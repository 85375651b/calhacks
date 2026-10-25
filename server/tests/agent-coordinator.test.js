import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {randomUUID} from 'node:crypto';
import {createAgentService} from '../agent/service.js';
import {createAgentRouter} from '../agent/routes.js';
import {generateHouse} from '../../src/lib/planner/houseGenerator.js';

const session='a'.repeat(64),other='b'.repeat(64);
function memory() {const data={};return {read:async()=>structuredClone(data),mutate:async fn=>fn(data)};}
function rows(field) {const data=new Map();return {list:async owner=>structuredClone(data.get(owner)||[]),put:async(owner,value,key)=>{const id=key||value[field];data.set(owner,[...(data.get(owner)||[]).filter(r=>r[field]!==id),structuredClone({...value,[field]:id})]);}};}
function setup() {
  const furnitureStore=rows('id'),layoutStore=rows('homeId');let searches=0;
  const service=createAgentService({store:memory(),furnitureStore,layoutStore,search:async()=>{searches++;return {name:'Test sofa',source:'ikea',widthIn:57.875,depthIn:31.125,heightIn:30.375,category:'seating',modelStatus:'placeholder',fixture:false};}});
  return {service,furnitureStore,layoutStore,searches:()=>searches};
}

test('coordinator enforces real tool ordering, persistent placement, collision checks and session isolation',async()=>{
  const {service,furnitureStore,layoutStore,searches}=setup();
  const owner=randomUUID();await service.bind(session,owner);
  const model=generateHouse({customRooms:[{name:'Living room',widthIn:240,depthIn:200}]});
  await layoutStore.put(owner,{homeSnapshot:{address:'Test'},floorPlan:{mode:'plan',convertedHouseModel:{...model,source:'floorplan'}},placements:[]},'house');
  await assert.rejects(service.run(session,'place_furniture',{home_id:'house',room_id:'custom-room-0',product_id:'missing'},'early'),/Search IKEA first/);
  const product=await service.run(session,'search_ikea',{description:'grey sofa'},'search');
  assert.equal((await service.run(session,'search_ikea',{description:'grey sofa'},'search')).id,product.id);
  assert.equal(searches(),1);
  await assert.rejects(service.run(session,'search_ikea',{description:'desk'},'search'),/another operation/);
  const placement=await service.run(session,'place_furniture',{home_id:'house',room_id:'custom-room-0',product_id:product.id,x:100,z:100},'place');
  assert.equal(placement.modelStatus,'placeholder');
  const scene=await service.run(session,'get_scene',{home_id:'house'},'read');
  assert.equal(scene.placements.length,1);
  assert.equal(scene.furniture[0].name,'Test sofa');
  assert.equal((await furnitureStore.list(owner))[0].widthIn,57.875);
  await assert.rejects(service.run(session,'place_furniture',{home_id:'house',room_id:'custom-room-0',product_id:product.id,x:100,z:100},'collision'),/overlaps/);
  await assert.rejects(service.run(other,'get_scene',{home_id:'house'},'private'),/not found/);
  await assert.rejects(service.run(session,'search_ikea',{description:'sofa',extra:'bad'},'schema'),/Invalid tool arguments/);
  const unavailable=await service.run(session,'generate_furniture_model',{product_id:product.id},'sam');
  assert.equal(unavailable.status,'not_implemented');
});

test('bridge requires authentication and one-time workspace codes expire and cannot be reused',async t=>{
  let time=0;const {service}=setup();
  const app=express();app.use(express.json());app.use('/api/agent',createAgentRouter({service,token:()=> 'secret-test',now:()=>time}));
  const server=app.listen(0,'127.0.0.1');await new Promise(resolve=>server.once('listening',resolve));
  t.after(()=>{server.closeAllConnections();server.close();});
  const url=`http://127.0.0.1:${server.address().port}/api/agent`;
  assert.equal((await fetch(url+'/tools')).status,401);
  const link=await fetch(url+'/link',{method:'POST',headers:{'X-Client-Id':randomUUID()}}).then(r=>r.json());
  const connect=()=>fetch(url+'/tools/connect_workspace',{method:'POST',headers:{Authorization:'Bearer secret-test','Content-Type':'application/json'},body:JSON.stringify({session,callId:'connect',arguments:{code:link.code}})});
  assert.equal((await connect()).status,200);
  assert.equal((await connect()).status,400);
  const expired=await fetch(url+'/link',{method:'POST',headers:{'X-Client-Id':randomUUID()}}).then(r=>r.json());
  time=600001;
  assert.equal((await fetch(url+'/tools/connect_workspace',{method:'POST',headers:{Authorization:'Bearer secret-test','Content-Type':'application/json'},body:JSON.stringify({session,arguments:{code:expired.code}})})).status,400);
});

test('floor-plan tools pass the listing ID and restrict job polling to the conversation that started it',async()=>{
  let jobOwner;
  const service=createAgentService({store:memory(),furnitureStore:rows('id'),layoutStore:rows('homeId'),jobs:{
    start:async(body,owner)=>{assert.equal(body.homeId,'listing-1');assert.equal(body.address,'123 Main St');jobOwner=owner;return {jobId:'job-1',status:'running'};},
    get:async(id,owner)=>{assert.equal(id,'job-1');assert.equal(owner,jobOwner);return {jobId:id,status:'ready',result:{plans:[]}};},
  }});
  const job=await service.run(session,'start_house_search',{home_id:'listing-1',address:'123 Main St'},'start');
  assert.equal(job.status,'running');
  assert.equal((await service.run(session,'get_house_job',{job_id:'job-1'},'poll')).status,'ready');
  await assert.rejects(service.run(other,'get_house_job',{job_id:'job-1'},'steal'),/not owned/);
});
