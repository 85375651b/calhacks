import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { serverDirectory } from '../config.js';
import { atomicJson } from '../storage/atomic.js';
import { httpsUrl, labels } from './actorAdapter.js';
const MAX_BYTES=10*1024*1024, MAX_PIXELS=40e6;
export function fileType(data) {
  if(!Buffer.isBuffer(data)||!data.length||data.length>MAX_BYTES)throw Error('Upload must be at most 10 MB.');
  if(data.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return'png';
  if(data[0]===255&&data[1]===216&&data[2]===255)return'jpeg';
  if(data.toString('ascii',0,4)==='RIFF'&&data.toString('ascii',8,12)==='WEBP')return'webp';
  if(data.toString('ascii',0,5)==='%PDF-')return'pdf';
  throw Error('Choose a PNG, JPG, WebP or PDF. SVG files are not supported.');
}
async function png(data) {
  const image=sharp(data,{limitInputPixels:MAX_PIXELS,failOn:'error',animated:false});
  const metadata=await image.metadata();
  if(!['png','jpeg','webp'].includes(metadata.format))throw Error('Unsupported image');
  const {data:buffer,info}=await image.rotate().flatten({background:'#ffffff'}).resize({width:4096,height:4096,fit:'inside',withoutEnlargement:true}).png().toBuffer({resolveWithObject:true});
  return {buffer,widthPx:info.width,heightPx:info.height};
}
export async function normalizePlan(data) {
  if(fileType(data)!=='pdf')return [await png(data)];
  const canvas=await import('@napi-rs/canvas');
  // pdfjs uses these native, npm-delivered implementations on Node/Windows.
  globalThis.DOMMatrix ||= canvas.DOMMatrix;globalThis.ImageData ||= canvas.ImageData;globalThis.Path2D ||= canvas.Path2D;
  const {getDocument}=await import('pdfjs-dist/legacy/build/pdf.mjs');
  const task=getDocument({data:new Uint8Array(data),isEvalSupported:false,useSystemFonts:true,disableFontFace:true});
  let document;
  try {
    document=await task.promise;const pages=[];
    for(let i=1;i<=Math.min(4,document.numPages);i++){
      const page=await document.getPage(i),base=page.getViewport({scale:1});
      if(!Number.isFinite(base.width)||base.width<=0||!Number.isFinite(base.height)||base.height<=0)throw Error('Invalid PDF page');
      const scale=Math.min(2,4096/Math.max(base.width,base.height)),viewport=page.getViewport({scale});
      const surface=canvas.createCanvas(Math.ceil(viewport.width),Math.ceil(viewport.height));
      await page.render({canvasContext:surface.getContext('2d'),viewport,background:'rgb(255,255,255)'}).promise;
      pages.push({...await png(surface.toBuffer('image/png')),page:i});page.cleanup();
    }
    return pages;
  } catch {throw Error('PDF preview unavailable. Upload a screenshot instead.');}
  finally {await task.destroy();}
}
const assetId=v=>{if(typeof v!=='string'||!/^[a-f0-9]{32}$/.test(v))throw Error('Plan not found.');return v;};
export function createAssetStore({directory=join(serverDirectory,'data','floorplans'),now=Date.now,maxFiles=150,maxBytes=300*1024*1024,normalize=normalizePlan}={}) {
  const index=atomicJson(join(directory,'index.json'));let queue=Promise.resolve();
  const serial=fn=>{const p=queue.catch(()=>{}).then(fn);queue=p;return p;};
  const path=id=>join(directory,'files',assetId(id)+'.png');
  async function sweep() {
    const entries=Object.values(await index.read()),remove=new Set(entries.filter(e=>e.expiresAt<=now()).map(e=>e.assetId));
    let left=entries.filter(e=>!remove.has(e.assetId)).sort((a,b)=>a.lastAccessAt-b.lastAccessAt),bytes=left.reduce((n,e)=>n+e.bytes,0);
    while(left.length>maxFiles||bytes>maxBytes){const e=left.shift();remove.add(e.assetId);bytes-=e.bytes;}
    if(remove.size){await index.mutate(d=>{for(const id of remove)delete d[id];});for(const id of remove)await unlink(path(id)).catch(()=>{});}
  }
  return {
    async ingest(data,meta={}) {
      return serial(async()=>{
        const pages=await normalize(data);
        await sweep();const entries=Object.values(await index.read());
        if(meta.source==='upload' && entries.filter(e=>e.ownerClientId===meta.ownerClientId).length+pages.length>10)throw Error('You can store up to 10 uploaded plan pages.');
        await mkdir(join(directory,'files'),{recursive:true});const result=[];
        for(const [i,p]of pages.entries()){
          const id=randomBytes(16).toString('hex'),createdAt=now();
          const e={assetId:id,source:meta.source==='upload'?'upload':'apify',ownerClientId:meta.source==='upload'?meta.ownerClientId:null,addressKey:meta.addressKey||null,floorLabel:meta.floorLabel||`Level ${i+1}`,sourceName:meta.sourceName||'Your upload',sourcePageUrl:httpsUrl(meta.sourcePageUrl),widthPx:p.widthPx,heightPx:p.heightPx,bytes:p.buffer.length,createdAt,lastAccessAt:createdAt,expiresAt:createdAt+30*86400000,confidence:meta.confidence??null,sample:meta.sample===true,detectedLabels:labels(meta.detectedLabels)};
          await writeFile(path(id),p.buffer,{mode:0o600});await index.mutate(d=>{d[id]=e;});result.push(e);
        }
        await sweep();return result.map(({ownerClientId,addressKey,expiresAt,...e})=>e);
      });
    },
    async get(id,client) {
      const e=(await index.read())[assetId(id)];if(!e||e.expiresAt<=now()||(e.source==='upload'&&e.ownerClientId!==client))throw Error('Plan not found or expired.');
      await index.mutate(d=>{if(d[id])d[id].lastAccessAt=now();});
      return {...e,pngPath:path(id)};
    },
    remove:(id,client)=>serial(async()=>{
      assetId(id);const e=(await index.read())[id];
      if(!e||e.source!=='upload'||e.ownerClientId!==client)throw Error('Plan not found.');
      await index.mutate(d=>{delete d[id];});await unlink(path(id)).catch(()=>{});return {deleted:true};
    }),
    cleanup:()=>serial(sweep),
  };
}
export const assets=createAssetStore();
export async function storeActorPlans(plans,download,addressKey) {
  const stored=[];
  for(const plan of plans){try{stored.push(...await assets.ingest(await download(plan),{...plan,source:'apify',addressKey}));}catch{stored.push({assetId:null,floorLabel:plan.floorLabel,sourceName:plan.sourceName,sourcePageUrl:plan.sourcePageUrl,reason:'Preview unavailable. Upload a screenshot instead.'});}}
  return stored.slice(0,16);
}
let samplePromise;
export function samplePlans(){
  return samplePromise ||= readSample().then(data=>assets.ingest(data,{source:'apify',sourceName:'Sample',sample:true,confidence:1,floorLabel:'Level 1',detectedLabels:[{text:"LIVING 14' x 18'",kind:'dimension',bbox:{x:100,y:100,width:250,height:40},feet:14}]})).catch(e=>{samplePromise=null;throw e;});
}
function readSample(){return readFile(join(serverDirectory,'fixtures','sample-floorplan.png'));}
