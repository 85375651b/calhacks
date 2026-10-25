import {Router} from 'express';
import {randomBytes,timingSafeEqual} from 'node:crypto';
import {clientId} from '../storage/favorites.js';
import {agentTools} from './tools.js';
import {createAgentService} from './service.js';

export function createAgentRouter({service=createAgentService(),token=()=>process.env.AGENT_BRIDGE_TOKEN,now=Date.now}={}) {
  const router=Router(),codes=new Map(),limits=new Map();
  router.get('/status',(_req,res)=>res.json({configured:!!token(),sam3d:false}));
  router.use((req,res,next)=>{
    const key=req.ip;
    const entry=limits.get(key)||{count:0,until:now()+60000};
    if(entry.until<now()){entry.count=0;entry.until=now()+60000;}
    entry.count++;limits.set(key,entry);
    if(entry.count>60) return res.status(429).json({error:'Please wait before retrying.'});
    res.set('Cache-Control','no-store');next();
  });
  router.post('/link',(req,res)=>{
    try {
      if(!token()) throw Error('Agent bridge is not configured.');
      const owner=clientId(req.get('X-Client-Id'));
      for(const [code,value] of codes) if(value.until<now()) codes.delete(code);
      if(codes.size>=500) throw Error('Please try again later.');
      const code=randomBytes(8).toString('hex');
      codes.set(code,{owner,until:now()+600000});
      res.json({code,expiresInSeconds:600});
    } catch(error){res.status(400).json({error:{message:error.message}});}
  });
  router.use((req,res,next)=>{
    const expected=token(),actual=req.get('Authorization')?.replace(/^Bearer /,'');
    if(!expected||!actual||Buffer.byteLength(actual)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(actual),Buffer.from(expected)))
      return res.status(401).json({error:'Agent authentication required.'});
    next();
  });
  router.get('/tools',(_req,res)=>res.json(agentTools));
  router.post('/tools/:name',async(req,res)=>{
    try {
      const {session,arguments:args,callId}=req.body||{};
      let result;
      if(req.params.name==='connect_workspace') {
        const code=args?.code,link=codes.get(code);
        if(!link||link.until<now()) throw Error('Connection code expired or invalid. Create another in the website.');
        result=await service.bind(session,link.owner);codes.delete(code);
      } else result=await service.run(session,req.params.name,args,callId);
      res.json({ok:true,result});
    } catch(error){res.status(400).json({ok:false,error:error.message});}
  });
  return router;
}
