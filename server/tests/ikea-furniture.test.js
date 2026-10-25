import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { config } from "../config.js";
import { extractIkeaDimensions } from "../furniture/ikeaDimensions.js";
import { createIkeaResolver, normalizeIkea, ikeaProductUrl, IKEA_ACTOR_ID, IKEA_ACTOR_BUILD } from "../furniture/ikea.js";
import { furniture, layout } from "../storage/planner.js";
import { resolveFurniture } from "../furniture/resolve.js";
import { prefillMeasurements } from "../../src/lib/planner/measurements.js";

const row = { name:"Test sofa",price:"$499",url:"https://www.ikea.com/us/en/p/test-sofa-12345678/",imageUrl:"https://www.ikea.com/us/en/images/products/test.jpg",matchScore:1.5 };
const html = '<h2>Measurements</h2><p>Width: 78 3/4 &quot;</p><p>Depth: 35 3/8 &quot;</p><p>Height: 32 5/8 &quot;</p><h2>Package details</h2><p>Width: 999 cm</p>';
test("IKEA product dimensions read fractions and metric labels, exclude packaging and guesses",()=>{
  assert.deepEqual(extractIkeaDimensions(html),{widthIn:78.75,depthIn:35.375,heightIn:32.625});
  const cm = extractIkeaDimensions('<h2>Measurements</h2>Width: 200 cm Depth: 90 cm Height: 83 cm');
  assert.equal(cm.widthIn,78.74);
  assert.deepEqual(extractIkeaDimensions('<h2>Package details</h2>Width: 200 cm Depth: 90 cm Height: 83 cm'),{widthIn:null,depthIn:null,heightIn:null});
  assert.deepEqual(extractIkeaDimensions('<h1>Sofa 200 x 90 x 83 cm</h1>'),{widthIn:null,depthIn:null,heightIn:null});
  assert.equal(extractIkeaDimensions('<h2>Measurements</h2>Seat width: 50 cm Seat depth: 40 cm Seat height: 30 cm').widthIn,null);
});
test("IKEA structured measurements require known units and do not borrow recommendation dimensions",()=>{
  const markup = p=>'<script type="application/ld+json">'+JSON.stringify(p)+'</script>';
  const p = extractIkeaDimensions(markup({'@type':'Product',width:{value:152.4,unitCode:'CMT'},depth:'30 in',height:{value:30,unitText:'inches'}}));
  assert.deepEqual(p,{widthIn:60,depthIn:30,heightIn:30});
  assert.equal(extractIkeaDimensions(markup([{'@type':'Product',name:'No dimensions'},{'@type':'Product',width:'60 in'}])).widthIn,null);
  assert.equal(extractIkeaDimensions(markup({'@type':'Product',width:60})).widthIn,null);
});
test("actor adapter returns missing dimensions as null, strips match confidence and validates URLs",()=>{
  const item=normalizeIkea(row,{},'grey sofa');
  assert.equal(item.widthIn,null);
  assert.equal(item.dimensionSource,'missing');
  assert.equal(item.confidence,undefined);
  assert.equal(item.matchScore,undefined);
  assert.equal(item.productId,'12345678');
  assert.equal(normalizeIkea({...row,imageUrl:'https://evil.example/image'}, {}, 'sofa').imageUrl,null);
  for(const url of ['https://ikea.com.evil/p/','https://127.0.0.1/us/en/p/test','http://www.ikea.com/us/en/p/x','https://www.ikea.com/search/']) assert.throws(()=>ikeaProductUrl(url));
});
test("IKEA search routes to the supplied actor, enriches product details and caches repeated descriptions",async()=>{
  const old={enabled:config.enableApify,token:config.apifyToken};config.enableApify=true;config.apifyToken='test-placeholder';
  let calls=0,claims=0,seen;
  const values=new Map();
  const resolve=createIkeaResolver({
    run:async(...args)=>{calls++;seen=args;return [row];},page:async()=>({html}),claim:async()=>{claims++;},
    memo:async(key,fn)=>{const k=JSON.stringify(key);if(!values.has(k))values.set(k,await fn());return values.get(k);},
  });
  try {
    const product=await resolve({query:'grey sofa'},false);
    assert.equal(product.widthIn,78.75);
    assert.equal(product.source,'ikea');
    assert.equal(product.modelStatus,'placeholder');
    assert.equal(seen[0],IKEA_ACTOR_ID);
    assert.deepEqual(seen[1],{description:'grey sofa',country:'us',language:'en'});
    assert.equal(seen[2].build,process.env.IKEA_ACTOR_BUILD || IKEA_ACTOR_BUILD);
    await resolve({query:' GREY SOFA '},false);
    assert.equal(calls,1);assert.equal(claims,1);
  } finally {config.enableApify=old.enabled;config.apifyToken=old.token;}
});
test("new Actor size fields reach the planner without a second product-page request",async()=>{
  const old={enabled:config.enableApify,token:config.apifyToken};config.enableApify=true;config.apifyToken='test-placeholder';
  let key;
  const result={...row,width:57.875,length:31.125,height:30.375,unit:'in'};
  const resolve=createIkeaResolver({run:async()=>[result],page:async()=>{assert.fail('Complete Actor dimensions should skip page scraping');},claim:async()=>{},memo:(k,fn)=>{key=k;return fn();}});
  try {
    const product=await resolve({query:'small grey two seat sofa'},false);
    assert.deepEqual([product.widthIn,product.depthIn,product.heightIn],[57.875,31.125,30.375]);
    assert.equal(product.estimated,false);
    assert.equal(product.dimensionSource,'product');
    assert.equal(key.version,2);
    assert.equal(key.build,process.env.IKEA_ACTOR_BUILD || IKEA_ACTOR_BUILD);
    const saved=furniture({...product,id:'saltmyran'});
    assert.deepEqual([saved.widthIn,saved.depthIn,saved.heightIn],[57.875,31.125,30.375]);
  } finally {config.enableApify=old.enabled;config.apifyToken=old.token;}
});

test("Actor measurements take priority while page measurements fill missing or invalid axes",()=>{
  const product=normalizeIkea({...row,widthIn:57.875,depthIn:-2,height:30.375,unit:'in'}, {widthIn:999,depthIn:31.125,heightIn:26},'sofa');
  assert.deepEqual([product.widthIn,product.depthIn,product.heightIn],[57.875,31.125,30.375]);
  assert.equal(normalizeIkea({...row,width:100,unit:'cm'},{},'sofa').widthIn,null);
});
test("an unreadable product page preserves match and image but never inserts guessed sizes",async()=>{
  const old={enabled:config.enableApify,token:config.apifyToken};config.enableApify=true;config.apifyToken='test-placeholder';
  const resolve=createIkeaResolver({run:async()=>[row],page:async()=>{throw Error('blocked');},claim:async()=>{},memo:(_key,fn)=>fn()});
  try {
    const item=await resolve({query:'sofa'},false);
    assert.equal(item.widthIn,null);assert.equal(item.imageUrl,row.imageUrl);
    assert.equal(item.name,row.name);
  } finally {config.enableApify=old.enabled;config.apifyToken=old.token;}
});
test("IKEA fixture mode never calls external providers and errors do not masquerade as catalog matches",async()=>{
  const fail=()=>{throw Error('external forbidden');};
  const resolve=createIkeaResolver({run:fail,page:fail,claim:fail,memo:fail});
  const item=await resolve({query:'sofa'},true);
  assert.equal(item.fixture,true);assert.match(item.notes,/Sample/);
  assert.deepEqual([item.widthIn,item.depthIn,item.heightIn],[57.875,31.125,30.375]);
  await assert.rejects(()=>resolve({query:'x',country:'../../bad'},true),/description/);
  const old=config.useFixtures,oldLive=config.ikeaLiveSearch;config.useFixtures=true;config.ikeaLiveSearch=false;
  try { assert.equal((await resolveFurniture({provider:'ikea',query:'sofa'})).source,'ikea'); }
  finally {config.useFixtures=old;config.ikeaLiveSearch=oldLive;}
});
test("IKEA live opt-in calls the measurement build even when the rest of the website uses fixtures",async()=>{
  const old={useFixtures:config.useFixtures,ikeaLiveSearch:config.ikeaLiveSearch,enableApify:config.enableApify,apifyToken:config.apifyToken};
  Object.assign(config,{useFixtures:true,ikeaLiveSearch:true,enableApify:true,apifyToken:'test-placeholder'});
  let options;
  const resolve=createIkeaResolver({run:async(_id,_input,opts)=>{options=opts;return [{...row,widthIn:57.875,depthIn:31.125,heightIn:30.375}];},page:()=>assert.fail('No page needed'),claim:async()=>{},memo:(_key,fn)=>fn()});
  try {
    const product=await resolve({query:'small grey sofa'});
    assert.equal(product.fixture,false);
    assert.doesNotMatch(product.notes,/Sample/);
    assert.equal(options.allowLiveInFixtureMode,true);
    assert.equal(options.build,process.env.IKEA_ACTOR_BUILD || IKEA_ACTOR_BUILD);
    assert.equal(config.useFixtures,true);
  } finally {Object.assign(config,old);}
});
test("confirmation form prefills separate Actor axes and keeps missing measurements empty",()=>{
  const product=prefillMeasurements({width:57.875,length:31.125,height:30.375,unit:'in'});
  assert.deepEqual([product.widthIn,product.depthIn,product.heightIn],[57.875,31.125,30.375]);
  assert.equal(prefillMeasurements({depth:31.125,unit:'in'}).depthIn,31.125);
  assert.equal(prefillMeasurements({widthIn:60,width:57.875,unit:'in'}).widthIn,60);
  assert.equal(prefillMeasurements({width:100,unit:'cm'}).widthIn,null);
  assert.equal(prefillMeasurements({heightIn:NaN}).heightIn,null);
  assert.equal(prefillMeasurements({}).depthIn,null);
});
test("IKEA furniture persists provenance and dimensions while retaining placement for later model replacement",()=>{
  const product=normalizeIkea(row,extractIkeaDimensions(html),'sofa');
  const saved=furniture({...product,id:'ikea-sofa',estimated:false,modelUrl:'https://evil/model.glb'});
  assert.equal(saved.price,'$499');assert.equal(saved.productId,'12345678');assert.equal(saved.source,'ikea');
  assert.equal(saved.depthIn,35.375);assert.equal(saved.modelStatus,'placeholder');assert.equal(saved.modelUrl,undefined);
  assert.throws(()=>furniture({...product,id:'bad',widthIn:null}),/width/);
  const placed={id:'placed',furnitureId:saved.id,level:0,xIn:100,zIn:120,rotationDeg:90,widthIn:saved.widthIn,depthIn:saved.depthIn,heightIn:saved.heightIn};
  assert.deepEqual(layout({placements:[placed]},'home').placements[0],placed);
});
test("prepared actor uses the same tested dimension extractor as the backend",async()=>{
  assert.equal(await readFile(new URL('../../actors/ikea-furniture-finder/src/dimensions.js',import.meta.url),'utf8'),await readFile(new URL('../furniture/ikeaDimensions.js',import.meta.url),'utf8'));
});
