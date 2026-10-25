import express, { Router } from 'express';
import { clientId } from '../storage/favorites.js';
import { createJobManager } from './jobs.js';
import { assets as assetStore, storeActorPlans, samplePlans } from './assets.js';
const defaultManager=createJobManager({storePlans:storeActorPlans,sample:samplePlans});
export function createFloorPlanRouter({manager=defaultManager,assets=assetStore,convert=null}={}) {
  const router=Router(),limits=new Map();
  router.use((req,res,next)=>{
    res.set('Cache-Control','no-store');
    // Public actor assets are authorized in the asset handler; uploads require the owner header.
    if(req.method==='GET' && req.path.startsWith('/assets/'))return next();
    try{req.clientId=clientId(req.get('X-Client-Id'));}catch{return res.status(400).json({error:{message:'A valid anonymous client ID is required.'}});}
    const now=Date.now();for(const[k,v]of limits)if(v.until<now)limits.delete(k);
    const k=req.clientId+(req.method==='GET'?':read':':write'),v=limits.get(k)||{n:0,until:now+60000};limits.set(k,v);
    if(++v.n>(req.method==='GET'?90:20)||limits.size>5000)return res.status(429).json({error:{message:'Please wait a minute before trying again.'}});
    next();
  });
  const handle=fn=>async(req,res)=>{try{res.json(await fn(req));}catch{res.status(400).json({error:{message:'Floor plan request unavailable. Check the address or try an upload.'}});}};
  router.post('/jobs',handle(req=>manager.start(req.body,req.clientId)));
  router.get('/jobs/:jobId',handle(req=>manager.get(req.params.jobId,req.clientId)));
  router.delete('/jobs/:jobId',handle(req=>manager.cancel(req.params.jobId,req.clientId)));
  router.post('/sample',handle(()=>samplePlans()));
  router.get('/metadata/:assetId',handle(async req=>{
    const {ownerClientId,pngPath,addressKey,expiresAt,...publicAsset}=await assets.get(req.params.assetId,req.clientId);
    return publicAsset;
  }));
  router.delete('/uploads/:assetId',handle(req=>assets.remove(req.params.assetId,req.clientId)));
  router.get('/assets/:filename',async(req,res)=>{
    try {
      if(!/^[a-f0-9]{32}\.png$/.test(req.params.filename))throw Error();
      const asset=await assets.get(req.params.filename.slice(0,-4),req.get('X-Client-Id'));
      res.set({'Content-Type':'image/png','X-Content-Type-Options':'nosniff','Cache-Control':asset.source==='upload'?'private, no-store':'private, max-age=3600'});
      res.sendFile(asset.pngPath);
    } catch {res.status(404).json({error:{message:'Plan not found, expired, or belongs to another browser.'}});}
  });
  router.post('/uploads',express.raw({type:['image/png','image/jpeg','image/webp','application/pdf','application/octet-stream'],limit:'10mb'}),async(req,res)=>{
    try {const plans=await assets.ingest(req.body,{source:'upload',ownerClientId:req.clientId,sourceName:'Your upload'});res.json({...plans[0],plans});}
    catch(e){res.status(400).json({error:{message:/10|PDF|PNG|SVG/.test(e.message)?e.message:'File could not be decoded. Upload a PNG, JPG, WebP or PDF.'}});}
  });
  return router;
}
