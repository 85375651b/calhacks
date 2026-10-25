import test from 'node:test';
import assert from 'node:assert/strict';
import {planHouse} from '../../src/lib/planner/planHouse.js';
import {warningsFor,wallSegments} from '../../src/lib/planner/collisions.js';
test('calibrated floors use inch bounds and retain furniture collisions without invented walls',()=>{
 const asset={assetId:'a',widthPx:1200,heightPx:900};
 const fp={ceilingHeightIn:108,plans:[{assetId:'a',levelIndex:3,rotationDeg:90,calibration:{p1:{x:0,y:0},p2:{x:200,y:0},realLengthIn:100,pixelsPerInch:2}}]};
 const house=planHouse(fp,[asset]);const f=house.floors[0];assert.equal(f.widthIn,450);assert.equal(f.depthIn,600);assert.equal(f.level,3);assert.equal(house.ceilingHeightIn,108);assert.deepEqual(wallSegments(f),[]);
 const item={id:'a',name:'Chair',category:'chair',xIn:30,zIn:30,widthIn:36,depthIn:36};assert.equal(warningsFor([item,{...item,id:'b'}],f)[0].type,'collision');assert.equal(planHouse(fp,[]),null);
});
