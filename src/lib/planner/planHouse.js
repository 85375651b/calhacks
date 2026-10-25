import {calibrate,planSize} from './calibration.js';
export function planHouse(floorPlan,assets) {
  const floors=[];
  for(const plan of floorPlan.plans){
    const asset=assets.find(a=>a.assetId===plan.assetId);
    if(!asset||!plan.calibration||floors.some(f=>f.level===plan.levelIndex))continue;
    try{calibrate(plan.calibration.p1,plan.calibration.p2,plan.calibration.realLengthIn,asset.widthPx,asset.heightPx);}catch{continue;}
    const {widthIn,depthIn}=planSize(asset,plan);
    floors.push({level:plan.levelIndex,widthIn,depthIn,openPlan:true,rooms:[{id:`plan-${plan.levelIndex}`,name:asset.sample?'Sample floor plan':'Floor plan',type:'living',x:0,z:0,widthIn,depthIn,dimensionSource:'user'}],doors:[],windows:[]});
  }
  return floors.length?{floors:floors.sort((a,b)=>a.level-b.level),source:'floorplan',estimated:false,ceilingHeightIn:floorPlan.ceilingHeightIn}:null;
}
