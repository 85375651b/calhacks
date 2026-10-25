import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {normalizePlan,createAssetStore} from '../floorplan/assets.js';
const tinyPdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]/Resources<<>>/Contents 4 0 R>>endobj\n4 0 obj<</Length 15>>stream\n0 0 100 50 re S\nendstream\nendobj\ntrailer<</Root 1 0 R>>\n%%EOF');
test('image normalization strips metadata, bounds pixels and rejects unsafe/invalid uploads',async()=>{
 const input=await sharp({create:{width:5000,height:20,channels:4,background:'#00000000'}}).png().toBuffer();
 const [p]=await normalizePlan(input);assert.equal(p.widthPx,4096);const metadata=await sharp(p.buffer).metadata();assert.equal(metadata.hasAlpha,false);assert.equal(metadata.exif,undefined);
 for(const data of [Buffer.from('<svg/>'),Buffer.from('RIFFxxxxWEBPbroken'),Buffer.alloc(10*1024*1024+1),Buffer.from([137,80,78,71,13,10,26,10])])await assert.rejects(()=>normalizePlan(data));
});
test('npm-only PDF rasterizer produces a decoded PNG page',async()=>{const [p]=await normalizePlan(tinyPdf);assert.equal(p.widthPx,400);assert.equal(p.heightPx,200);assert.equal((await sharp(p.buffer).metadata()).format,'png');});
test('assets enforce ownership, unguessable IDs, upload caps, LRU and TTL',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'floorplan-assets-'));let now=1000;
 const data=await sharp({create:{width:10,height:10,channels:3,background:'#ffffff'}}).png().toBuffer();
 const store=createAssetStore({directory,now:()=>now,maxFiles:2});
 try{
  const [a]=await store.ingest(data,{source:'upload',ownerClientId:'owner'});assert.match(a.assetId,/^[a-f0-9]{32}$/);await assert.rejects(()=>store.get(a.assetId,'other'));await assert.rejects(()=>store.get('../index','owner'));
  await store.get(a.assetId,'owner');now++;const [b]=await store.ingest(data,{source:'apify'});now++;await store.get(a.assetId,'owner');now++;await store.ingest(data,{source:'apify'});await assert.rejects(()=>store.get(b.assetId));
  now+=31*86400000;await store.cleanup();await assert.rejects(()=>store.get(a.assetId,'owner'));assert.deepEqual(JSON.parse(await readFile(join(directory,'index.json'),'utf8')),{});
  const capped=createAssetStore({directory,maxFiles:150});for(let i=0;i<10;i++)await capped.ingest(data,{source:'upload',ownerClientId:'owner'});await assert.rejects(()=>capped.ingest(data,{source:'upload',ownerClientId:'owner'}),/10/);
 }finally{await rm(directory,{recursive:true,force:true});}
});
