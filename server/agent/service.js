import {createHash,randomUUID} from 'node:crypto';
import {join} from 'node:path';
import Ajv from 'ajv';
import {agentTools} from './tools.js';
import {atomicJson} from '../storage/atomic.js';
import {serverDirectory,config} from '../config.js';
import {library,layouts} from '../storage/planner-routes.js';
import {resolveIkea} from '../furniture/ikea.js';
import {generateHouse} from '../../src/lib/planner/houseGenerator.js';
import {validHouseOrNull} from '../../src/lib/planner/validateHouseModel.js';
import {corners,warningsFor} from '../../src/lib/planner/collisions.js';
import {defaultManager} from '../floorplan/routes.js';
import {assets} from '../floorplan/assets.js';
import {converters} from '../floorplan/converters/index.js';

const demo={id:'demo',address:'Synthetic demo house',sqft:1500,beds:3,baths:2,stories:1};
const ajv=new Ajv();
const validators=new Map(agentTools.map(t=>[t.function.name,ajv.compile(t.function.parameters)]));
export function createAgentService({store=atomicJson(join(serverDirectory,'data','agent-sessions.json')),furnitureStore=library,layoutStore=layouts,search=resolveIkea,jobs=defaultManager,assetStore=assets,registry=converters}={}) {
  const queues=new Map();
  async function house(owner,id) {
    const saved=(await layoutStore.list(owner)).find(h=>h.homeId===id);
    if(!saved && id!=='demo') throw Error('House not found. Connect your website workspace or use demo.');
    const converted=saved?.floorPlan?.mode==='plan' ? validHouseOrNull(saved?.floorPlan?.convertedHouseModel) : null;
    if(saved?.floorPlan?.mode==='plan' && !converted) throw Error('This floor plan has no converted geometry yet. Convert it before agent placement.');
    const model=converted || generateHouse(saved?.homeSnapshot || demo,saved?.roomOverrides || {});
    return {saved,model};
  }
  async function execute(session,name,args,callId) {
    const data=await store.read();
    const state=data[session] || {owner:randomUUID(),products:{},jobs:[],calls:{}};
    const cached=state.calls[callId];
    if(cached) {
      if(cached.name!==name || JSON.stringify(cached.args)!==JSON.stringify(args)) throw Error('Request ID already used for another operation.');
      return cached.result;
    }
    const owner=state.owner;
    const shortId=prefix=>prefix+'-'+createHash('sha256').update(session+callId).digest('hex').slice(0,24);
    let result;
    if(name==='capabilities') result={ikea:'live Actor size-fields',house:'saved geometry, floor-plan Actor and CubiCasa',houseSearchFixtureMode:config.useFixtures,placement:'sized primitives with collision checks',sam3d:'not_implemented',materials:'not_implemented',units:'inches'};
    else if(name==='list_houses') result={houses:(await layoutStore.list(owner)).map(h=>({id:h.homeId,address:h.homeSnapshot?.address})),demo:{id:'demo',synthetic:true}};
    else if(name==='load_house' || name==='get_scene') {
      const {saved,model}=await house(owner,args.home_id);
      const ids=new Set((saved?.placements||[]).map(p=>p.furnitureId));
      const definitions=(await furnitureStore.list(owner)).filter(d=>ids.has(d.id)).map(({id,name,category,widthIn,depthIn,heightIn})=>({id,name,category,widthIn,depthIn,heightIn}));
      result={homeId:args.home_id,units:'inches',house:model,placements:saved?.placements || [],furniture:definitions,estimated:model.estimated,synthetic:args.home_id==='demo',viewerPath:'/planner/'+encodeURIComponent(args.home_id)};
    } else if(name==='search_ikea') {
      const product=await search({query:args.description},false);
      const id=shortId('product');state.products[id]=product;
      if(Object.keys(state.products).length>50) delete state.products[Object.keys(state.products)[0]];
      result={...product,id,requiresProductConfirmation:true,meshAvailable:false};
    } else if(name==='generate_furniture_model') result={status:'not_implemented',message:'SAM 3D and resize.py are not connected yet. Offer an accurately sized placeholder, with user agreement.'};
    else if(name==='place_furniture' || name==='move_furniture') {
      const {saved,model}=await house(owner,args.home_id);
      const placed=saved?.placements || [];
      let definition,placement;
      if(name==='place_furniture') {
        definition=state.products[args.product_id];
        if(!definition) throw Error('Product not found in this conversation. Search IKEA first.');
        if([definition.widthIn,definition.depthIn,definition.heightIn].some(n=>!Number.isFinite(n)||n<=0)) throw Error('Product has missing dimensions. Cannot place it accurately.');
        const floor=model.floors.find(f=>f.rooms.some(r=>r.id===args.room_id));
        const room=floor?.rooms.find(r=>r.id===args.room_id);
        if(!room) throw Error('Unknown room. Load the house to get room IDs.');
        definition={...definition,id:shortId('furniture')};
        placement={id:shortId('placement'),furnitureId:definition.id,level:floor.level,xIn:args.x??room.x+room.widthIn/2,zIn:args.z??room.z+room.depthIn/2,rotationDeg:args.rotation??0,widthIn:definition.widthIn,depthIn:definition.depthIn,heightIn:definition.heightIn};
        const test={...definition,...placement};
        if(corners(test).some(p=>p.x<room.x||p.x>room.x+room.widthIn||p.z<room.z||p.z>room.z+room.depthIn)) throw Error('Furniture does not fit inside the requested room at that position.');
      } else {
        const old=placed.find(p=>p.id===args.placement_id);
        if(!old) throw Error('Placement not found.');
        definition=(await furnitureStore.list(owner)).find(d=>d.id===old.furnitureId);
        if(!definition) throw Error('Furniture definition is missing.');
        placement={...old,xIn:args.x,zIn:args.z,rotationDeg:args.rotation};
      }
      const floor=model.floors.find(f=>f.level===placement.level);
      const defs=await furnitureStore.list(owner);
      const others=placed.filter(p=>p.id!==placement.id&&p.level===floor.level).map(p=>({...defs.find(d=>d.id===p.furnitureId),...p}));
      const warnings=warningsFor([...others,{...definition,...placement}],floor).filter(w=>w.ids.includes(placement.id));
      if(warnings.length) throw Error(warnings.map(w=>w.message).join('; '));
      await furnitureStore.put(owner,definition);
      await layoutStore.put(owner,{...(saved||{homeSnapshot:demo}),placements:[...placed.filter(p=>p.id!==placement.id),placement]},args.home_id);
      result={status:'saved',placement,modelStatus:'placeholder',units:'inches'};
    } else if(name==='start_house_search') {
      result={...await jobs.start({address:args.address,homeId:args.home_id},owner),fixture:config.useFixtures};
      state.jobs=[...state.jobs,result.jobId].filter(Boolean).slice(-30);
    } else if(name==='get_house_job') {
      if(!state.jobs.includes(args.job_id)) throw Error('Job not owned by this conversation.');
      result={...await jobs.get(args.job_id,owner),fixture:config.useFixtures};
    } else if(name==='convert_house_plan') {
      const asset=await assetStore.get(args.asset_id,owner);
      const converted=await registry.convert('cubicasa',{asset,calibration:null,levelIndex:0,rotationDeg:0,ceilingHeightIn:96,listingFacts:{address:args.address}});
      const old=(await layoutStore.list(owner)).find(h=>h.homeId===args.home_id);
      if(old?.placements.length) throw Error('Existing house has furniture. Choose a new house ID to avoid changing its geometry.');
      await layoutStore.put(owner,{homeSnapshot:{id:args.home_id,address:args.address},placements:[],floorPlan:{mode:'plan',ceilingHeightIn:96,plans:[],convertedHouseModel:converted.houseModel,houseModelSource:'cubicasa'}},args.home_id);
      result={status:'saved',homeId:args.home_id,warnings:converted.warnings,confidence:converted.confidence};
    } else throw Error('Unknown tool.');
    state.calls={...state.calls,[callId]:{name,args,result}};
    state.calls=Object.fromEntries(Object.entries(state.calls).slice(-60));
    await store.mutate(all=>{all[session]=state;});
    return result;
  }
  return {
    async bind(session,owner) {
      if(!/^[a-f0-9]{64}$/.test(session)) throw Error('Invalid conversation.');
      await store.mutate(data=>{data[session]={owner,products:{},jobs:[],calls:{}};});
      return {status:'connected'};
    },
    run(session,name,args,callId) {
      if(!/^[a-f0-9]{64}$/.test(session)||!/^[-\w]{1,150}$/.test(callId)) return Promise.reject(Error('Invalid conversation or request ID.'));
      const validate=validators.get(name);
      if(!validate || !validate(args)) return Promise.reject(Error('Invalid tool arguments.'));
      const previous=queues.get(session)||Promise.resolve();
      const task=previous.catch(()=>{}).then(()=>execute(session,name,args,callId));
      queues.set(session,task);
      task.finally(()=>{if(queues.get(session)===task)queues.delete(session);}).catch(()=>{});
      return task;
    },
  };
}
