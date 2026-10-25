import { config } from '../config.js';
import { ACTOR_SETTINGS } from '../config/apify.js';
import { ACTOR_ID, safeKey, timeoutSecs } from './actorAdapter.js';
const id = v => { if (!/^[a-zA-Z0-9_-]{1,100}$/.test(v)) throw new Error('Invalid provider identifier'); return v; };
export function createFloorPlanApi({ fetchImpl=fetch, token=()=>config.apifyToken }={}) {
  async function request(path, {method='GET',body,signal,raw=false}={}) {
    const r=await fetchImpl('https://api.apify.com/v2'+path,{method,headers:{Authorization:'Bearer '+token(),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,signal:signal || AbortSignal.timeout(25000)});
    if(!r.ok) throw new Error('Floor plan provider unavailable');
    if(raw) {
      if(Number(r.headers.get('content-length'))>10*1024*1024) throw new Error('Plan file too large');
      const chunks=[];let bytes=0; for await(const chunk of r.body){bytes+=chunk.length;if(bytes>10*1024*1024)throw new Error('Plan file too large');chunks.push(chunk);}return Buffer.concat(chunks);
    }
    const j=await r.json();return j.data ?? j;
  }
  return {
    start:input=>request(`/acts/${ACTOR_ID().replace('/','~')}/runs?timeout=${timeoutSecs()}&maxTotalChargeUsd=${ACTOR_SETTINGS.chargeCapUsd}`,{method:'POST',body:input}),
    poll:(runId,signal)=>request(`/actor-runs/${id(runId)}?waitForFinish=20`,{signal}),
    abort:runId=>request(`/actor-runs/${id(runId)}/abort`,{method:'POST'}),
    items:dataset=>request(`/datasets/${id(dataset)}/items?limit=25`),
    file:(store,key)=>{if(!safeKey(key))throw new Error('Invalid plan file key');return request(`/key-value-stores/${id(store)}/records/${encodeURIComponent(key)}`,{raw:true});},
  };
}
export const floorPlanApi=createFloorPlanApi();
