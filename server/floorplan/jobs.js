import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { config, serverDirectory } from '../config.js';
import { atomicJson } from '../storage/atomic.js';
import { claimRun, createRunGuard } from '../providers/actor.js';
import { floorPlanApi } from './apify.js';
import { actorInput, addressKey, adaptResult, safeKey, bounded, timeoutSecs, ACTOR_ID } from './actorAdapter.js';
const globalClaim=createRunGuard(join(serverDirectory,'.cache','floorplan-budget.json'),{max:()=>bounded(process.env.FLOORPLAN_MAX_RUNS_PER_HOUR,20,0,100)});
const clientBudget=atomicJson(join(serverDirectory,'.cache','floorplan-client-budget.json'));
async function claimClient(client) {await clientBudget.mutate(data=>{const now=Date.now();for(const k of Object.keys(data)){data[k]=data[k].filter(t=>t>now-3600000);if(!data[k].length)delete data[k];}const rows=data[client]||[];if(rows.length>=bounded(process.env.FLOORPLAN_CLIENT_RUNS_PER_HOUR,5,0,20))throw Error('cap');data[client]=[...rows,now];});}
export const TTL={ready:30*86400000,not_found:3*86400000,blocked:3600000};
export function createJobManager({api=floorPlanApi,cache=atomicJson(join(serverDirectory,'.cache','floorplan-jobs.json')),claimGlobal=globalClaim,claimShared=claimRun,claimPerClient=claimClient,now=Date.now,fixtureMode=()=>config.useFixtures,enabled=()=>config.enableApify && Boolean(config.apifyToken),storePlans=async()=>[],sample=async()=>[],deadlineMs=()=>timeoutSecs()*1000}={}) {
  const jobs=new Map(), addresses=new Map(); let running=0;
  const message={queued:'Waiting to search for a floor plan.',running:'Searching public listings for a floor plan.',downloading:'Preparing floor plan previews.',ready:'Floor plan found.',not_found:'No floor plan found. Upload your own or keep the estimated layout.',blocked:'Listing sources blocked the search. Try uploading a plan.',error:'Could not search for floor plans. Try again or upload a plan.',capped:'Search limited right now. Try later or upload a plan.',disabled:'Automatic floor plan search is disabled. You can upload a plan.'};
  function view(j){return {jobId:j.id,status:j.status,message:j.message||message[j.status],elapsedSecs:Math.max(0,Math.floor(((j.finishedAt||now())-j.startedAt)/1000)),...(j.result?{result:j.result}:{})};}
  async function execute(j,input,client) {
    let timer;
    try {
      if(fixtureMode()) {
        const status=/blocked/i.test(input.addresses[0])?'blocked':/error/i.test(input.addresses[0])?'error':/no plan/i.test(input.addresses[0])?'not_found':'ready';
        j.status=status;j.result={plans:status==='ready'?await sample():[],listingFacts:null,reason:'Sample floor plan result',sample:true};return;
      }
      if(!enabled()){j.status='disabled';return;}
      if(running>=2){j.status='capped';return;}
      running++;j.slot=true;
      try {await claimPerClient(client);await claimGlobal();await claimShared();}catch{j.status='capped';return;}
      if(j.cancelled)return;
      j.status='running';
      timer=setTimeout(()=>{j.timedOut=true;j.cancelled=true;j.controller.abort();if(j.runId)void api.abort(j.runId).catch(()=>{});},deadlineMs());
      let run=await api.start(input);j.runId=run.id;
      if(j.cancelled){await api.abort(j.runId).catch(()=>{});throw Error('cancelled');}
      while(!['SUCCEEDED','FAILED','TIMED-OUT','ABORTED'].includes(run.status)) run=await api.poll(j.runId,j.controller.signal);
      if(run.status!=='SUCCEEDED')throw Error('run failed');
      const rows=await api.items(run.defaultDatasetId);
      if(j.cancelled)throw Error('cancelled');
      const row=rows.find(r=>{try{return addressKey(r.normalizedAddress||r.inputAddress)===j.addressKey;}catch{return false;}});
      const normalized=adaptResult(row,run.defaultKeyValueStoreId,input.addresses[0]);
      j.status=normalized.status==='found'?'downloading':normalized.status==='blocked'?'blocked':['no_listing_found','listing_found_no_floor_plan'].includes(normalized.status)?'not_found':'error';
      let plans=[];
      if(j.status==='downloading'){
        const valid=normalized.plans.filter(p=>p.kvStoreId===run.defaultKeyValueStoreId && safeKey(p.kvKey));
        plans=await storePlans(valid,async p=>{if(j.cancelled)throw Error('cancelled');return api.file(run.defaultKeyValueStoreId,p.kvKey);},j.addressKey);
        j.status=plans.some(p=>p.assetId)?'ready':'not_found';
        if(!plans.some(p=>p.assetId))j.message='Floor plan preview unavailable. Upload a screenshot instead.';
      }
      j.result={plans,listingFacts:normalized.listingFacts,reason:normalized.reason};
    } catch {j.status='error';j.message=j.timedOut?'Floor plan search timed out. Try again or upload a plan.':j.cancelled?'Floor plan search cancelled.':'Could not search for floor plans. Try again or upload a plan.';}
    finally {
      clearTimeout(timer);if(j.slot)running--;j.finishedAt=now();addresses.delete(j.key);
      if(j.cancelled){j.status='error';j.message=j.timedOut?'Floor plan search timed out.':'Floor plan search cancelled.';}
      if(TTL[j.status] && !j.cancelled)await cache.mutate(d=>{d[j.key]={status:j.status,result:j.result,message:j.message,until:now()+TTL[j.status]};}).catch(()=>{});
    }
  }
  return {
    async start(body,client) {
      if(!body || typeof body.homeId!=='string' || !/^[\w-]{1,100}$/.test(body.homeId) || body.homeId==='demo' || body.homeId.startsWith('custom-'))throw Error('Choose a real listing for automatic lookup.');
      const input=actorInput(body.address,body.listingUrls), ak=addressKey(body.address), key=JSON.stringify([ACTOR_ID(),fixtureMode(),ak]);
      const active=addresses.get(key);if(active){active.clients.add(client);return {...view(active),cached:false};}
      const saved=(await cache.read())[key];
      // Re-check after asynchronous cache read, before installing a job.
      const joined=addresses.get(key);if(joined){joined.clients.add(client);return {...view(joined),cached:false};}
      for(const [id,j]of jobs)if(j.finishedAt && now()-j.finishedAt>3600000)jobs.delete(id);
      if(jobs.size>=500)throw Error('Too many floor plan jobs. Try again later.');
      const j={id:randomBytes(16).toString('hex'),key,addressKey:ak,status:'queued',startedAt:now(),clients:new Set([client]),controller:new AbortController()};jobs.set(j.id,j);
      if(saved?.until>now()){Object.assign(j,{status:saved.status,result:saved.result,message:saved.message,finishedAt:now()});return {...view(j),cached:true};}
      addresses.set(key,j);j.done=execute(j,input,client);return {...view(j),cached:false};
    },
    get(id,client){const j=jobs.get(id);if(!j||!j.clients.has(client))throw Error('Floor plan job not found.');return view(j);},
    async cancel(id,client){const j=jobs.get(id);if(!j||!j.clients.has(client))throw Error('Floor plan job not found.');j.clients.delete(client);if(!j.clients.size&&!j.finishedAt){j.cancelled=true;j.controller.abort();if(j.runId)await api.abort(j.runId).catch(()=>{});}return {status:'cancelled'};},
    async settled(id){await jobs.get(id)?.done;},
  };
}
