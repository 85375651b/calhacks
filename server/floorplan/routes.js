import express, { Router } from 'express';
import { clientId } from '../storage/favorites.js';
import { createJobManager } from './jobs.js';
export function createFloorPlanRouter({manager=createJobManager(),assets=null,convert=null}={}) {
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
  return router;
}
