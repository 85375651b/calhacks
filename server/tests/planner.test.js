import test from 'node:test';
import assert from 'node:assert/strict';
import {generateHouse} from '../../src/lib/planner/houseGenerator.js';
import {listingSnapshot,readSession,writeSession} from '../../src/lib/planner/listingSnapshot.js';
test('generated floors partition area, connect rooms, include windows and flag tight sizes',()=>{
  for(let seed=0;seed<40;seed++) for(const sqft of [250,1500,8000]) for(const stories of [1,2,3]){
    const input={seed,sqft,stories,beds:seed%6,baths:2},house=generateHouse(input);assert.deepEqual(house,generateHouse(input));
    for(const f of house.floors){assert.ok(Math.abs(f.rooms.reduce((s,r)=>s+r.widthIn*r.depthIn,0)/144-sqft/stories)<.01);assert.ok(f.doors.some(d=>d.exterior));
      for(const r of f.rooms){assert.ok(f.doors.some(d=>d.roomIds.includes(r.id)));if(r.type!=='hallway')assert.ok(f.windows.some(w=>w.roomId===r.id));for(const b of f.rooms)if(r!==b)assert.ok(Math.min(r.x+r.widthIn,b.x+b.widthIn)-Math.max(r.x,b.x)<.001||Math.min(r.z+r.depthIn,b.z+b.depthIn)-Math.max(r.z,b.z)<.001);}
      const reached=new Set([f.rooms[0].id]);for(let i=0;i<f.rooms.length;i++)for(const d of f.doors)if(d.roomIds.some(id=>reached.has(id)))d.roomIds.forEach(id=>reached.add(id));assert.equal(reached.size,f.rooms.length);
    }
  }
});
test('snapshot merges non-null details and session restoration expires',()=>{assert.equal(listingSnapshot({id:'a',sqft:1000},{sqft:null,stories:2}).sqft,1000);assert.equal(listingSnapshot({}).beds,null);let v;const storage={setItem:(k,x)=>v=x,getItem:()=>v};writeSession('x',{selected:'a'},storage);assert.deepEqual(readSession('x',storage),{selected:'a'});v=JSON.stringify({at:0,data:{}});assert.equal(readSession('x',storage),null);});
