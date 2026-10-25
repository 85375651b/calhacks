import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import express from 'express';
import {plannerRouter} from '../storage/planner-routes.js';

test('library deletion persists while preserving placed copies and their definitions', async t => {
  const app = express();
  app.use(express.json());
  app.use('/api',plannerRouter);
  const server=app.listen(0,'127.0.0.1');
  await new Promise(resolve=>server.once('listening',resolve));
  const client=randomUUID();
  const request=async(path,method='GET',body)=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{
      method,headers:{'Content-Type':'application/json','X-Client-Id':client},
      ...(body ? {body:JSON.stringify(body)} : {}),
    });
    assert.equal(response.status,200);
    return response.json();
  };
  t.after(async()=>{
    try {
      await request('/planner/layouts/delete-regression','DELETE');
      for(const definition of await request('/furniture')) await request('/furniture/'+definition.id,'DELETE');
    } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  });
  await request('/furniture','POST',{id:'placed-sofa',name:'Sofa',widthIn:57.875,depthIn:31.125,heightIn:30.375});
  const placement={id:'copy',furnitureId:'placed-sofa',level:0,xIn:100,zIn:100,rotationDeg:0};
  await request('/planner/layouts/delete-regression','PUT',{placements:[placement]});
  const afterDelete=await request('/furniture/placed-sofa','DELETE');
  assert.equal(afterDelete.filter(item=>!item.archived).length,0);
  const reloadedLibrary=await request('/furniture');
  const definition=reloadedLibrary.find(item=>item.id==='placed-sofa');
  assert.equal(definition.archived,true);
  assert.equal(definition.name,'Sofa');
  assert.equal(definition.widthIn,57.875);
  assert.deepEqual((await request('/planner/layouts/delete-regression')).placements,[placement]);

  await request('/furniture','POST',{id:'unplaced-chair',name:'Chair'});
  await request('/furniture/unplaced-chair','DELETE');
  assert.equal((await request('/furniture')).some(item=>item.id==='unplaced-chair'),false);

  await request('/furniture','POST',{id:'unsaved-table',name:'Table'});
  await request('/furniture/unsaved-table?preserveDefinition=true','DELETE');
  assert.equal((await request('/furniture')).find(item=>item.id==='unsaved-table').archived,true);
});
