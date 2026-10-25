import test from 'node:test';
import assert from 'node:assert/strict';
import {parseLength,calibrate,transformPlacements,validateFloorPlan} from '../../src/lib/planner/calibration.js';
import {layout} from '../storage/planner.js';
test('length formats, scale validation and inch calculation',()=>{
 for(const [value,inches]of [['14',168],['14.5',174],[`14'6"`,174],['4.3 m',430/2.54],['430 cm',430/2.54],['4 m 30 cm',430/2.54]])assert.ok(Math.abs(parseLength(value)-inches)<1e-8);
 assert.throws(()=>parseLength('nonsense'));assert.equal(calibrate({x:0,y:0},{x:100,y:0},50,1000,800).pixelsPerInch,2);
 for(const [p,l]of [[{x:1,y:0},50],[{x:100,y:0},11],[{x:100,y:0},2401],[{x:1001,y:0},50]])assert.throws(()=>calibrate({x:0,y:0},p,l,1000,800));
});
test('recalibration and all rotations preserve image positions and furniture dimensions',()=>{
 const asset={widthPx:1200,heightPx:900},base={levelIndex:0,rotationDeg:0,calibration:{pixelsPerInch:2}},item={level:0,xIn:100,zIn:150,widthIn:36,depthIn:24,rotationDeg:15};
 const half={...base,calibration:{pixelsPerInch:4}};const [scaled]=transformPlacements([item],asset,base,half);assert.equal(scaled.xIn,50);assert.equal(scaled.widthIn,36);
 for(const rotationDeg of [90,180,270]){const rotated={...base,rotationDeg};const [p]=transformPlacements([item],asset,base,rotated);const [back]=transformPlacements([p],asset,rotated,base);assert.deepEqual(back,item);}
 const [p]=transformPlacements([item],asset,base,{...base,rotationDeg:90});assert.equal(p.xIn,300);assert.equal(p.zIn,100);
});
test('floor-plan layout persistence clamps, strips unknown fields and preserves old layouts',()=>{
 const old=layout({placements:[],homeSnapshot:{}},'a');assert.equal(old.floorPlan,undefined);
 const c=calibrate({x:0,y:0},{x:200,y:0},100,1200,900);
 const fp=validateFloorPlan({mode:'plan',ceilingHeightIn:500,plans:[{assetId:'a'.repeat(32),levelIndex:8,rotationDeg:89,calibration:{...c,pixelsPerInch:999},secret:'no'}],unknown:'no'});
 assert.equal(fp.ceilingHeightIn,240);assert.equal(fp.plans[0].levelIndex,3);assert.equal(fp.plans[0].rotationDeg,90);assert.equal(fp.plans[0].calibration.pixelsPerInch,2);assert.equal(fp.plans[0].secret,undefined);
 assert.deepEqual(layout({placements:[],floorPlan:fp},'a').floorPlan,fp);assert.equal(validateFloorPlan({mode:'plan',plans:[{assetId:'../../etc'}]}).mode,'estimated');
});
