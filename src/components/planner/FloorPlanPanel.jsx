import React,{useEffect,useRef,useState} from 'react';
import {floorPlanApi,useAssetImage} from '../../lib/planner/floorPlanApi';
import PlanViewer from './PlanViewer';
export function FloorPlanStatus({state}) {
  const j=state.job;if(!j)return null;
  const pending=['queued','running','downloading'].includes(j.status);
  const title=pending?`Searching for a floor plan… ${j.elapsedSecs||0}s`:j.status==='ready'?`Floor plan found (${j.result?.plans?.filter(p=>p.assetId).length||0})`:j.status==='not_found'?'No floor plan found':j.status==='capped'?'Search limited right now':j.status==='disabled'?'Floor plan search disabled':"Couldn't search for floor plans";
  return <span className="floorplan-status" role="status" aria-live="polite">{title} {pending?<button onClick={state.cancel}>Cancel</button>:['error','blocked','capped'].includes(j.status)&&<button onClick={state.retry}>Retry</button>}</span>;
}
function Thumbnail({plan,clientId,onOpen}){const url=useAssetImage(plan.assetId,clientId);return <button className="plan-thumbnail" onClick={onOpen} disabled={!url}>{url?<img src={url} alt={`${plan.sample?'Sample floor plan':plan.floorLabel||'Floor plan'} preview`}/>:<span>Preview unavailable</span>}</button>;}
export default function FloorPlanPanel({state,clientId,homeId,address,floorPlan,onChange,onKeepEstimated,onRooms,onCalibrate}) {
  const [selected,setSelected]=useState(null),[pending,setPending]=useState([]),[error,setError]=useState(''),[uploading,setUploading]=useState(false),input=useRef();
  const chosen=state.plans.find(p=>p.assetId===selected)||pending.find(p=>p.assetId===selected);
  async function upload(file){if(!file)return;setError('');if(file.size>10*1024*1024){setError('Choose a file up to 10 MB.');return;}setUploading(true);try{const r=await floorPlanApi(clientId,'/uploads',{method:'POST',headers:{'Content-Type':file.type||'application/octet-stream'},body:file});setPending(r.plans);setSelected(r.plans[0]?.assetId);}catch(e){setError(e.message);}finally{setUploading(false);input.current.value='';}}
  return <aside className="planner-panel floorplan-panel" aria-label="Floor plan panel">
    <h2>Floor plan</h2><p className="small-note">We look up public listings for this address to find a floor plan.</p>
    {state.job?.message&&<p>{state.job.message}</p>}
    <label>Upload your own floor plan (PNG, JPG, WebP or PDF, up to 10 MB)<input ref={input} type="file" accept="image/png,image/jpeg,image/webp,application/pdf" disabled={uploading} onChange={e=>upload(e.target.files[0])}/></label>
    {uploading&&<p role="status">Preparing your preview…</p>}{error&&<p role="alert">{error}</p>}
    {pending.length>0&&<section><h3>Confirm uploaded pages</h3><p>Select a page to preview, then add the pages you want.</p>{pending.map(p=><div key={p.assetId}><button onClick={()=>setSelected(p.assetId)}>Preview page {p.floorLabel}</button><button onClick={()=>{state.setPlans(old=>[...old,p]);onChange?.(p,{});setPending(old=>old.filter(x=>x.assetId!==p.assetId));}}>Use this page</button></div>)}<button onClick={()=>{pending.forEach(p=>floorPlanApi(clientId,'/uploads/'+p.assetId,{method:'DELETE'}).catch(()=>{}));setPending([]);setSelected(null);}}>Cancel upload</button></section>}
    {homeId==='demo'&&<button onClick={()=>state.sample().catch(e=>setError(e.message))}>Use sample floor plan</button>}
    <div className="floorplan-fallbacks"><button onClick={onKeepEstimated}>Keep the estimated layout</button><button onClick={onRooms}>Enter room sizes</button></div>
    {state.plans.map((p,i)=>{
      const saved=floorPlan?.plans?.find(s=>s.assetId===p.assetId);
      return <article className="floorplan-card" key={p.assetId||i}>
        {p.assetId?<Thumbnail plan={p} clientId={clientId} onOpen={()=>setSelected(p.assetId)}/>:<p>{p.reason||'Preview unavailable. Upload a screenshot instead.'}</p>}
        <strong>{p.sample?'Sample floor plan':p.floorLabel||'Floor plan'}</strong>
        {p.confidence!=null&&<span> · {Math.round(p.confidence*100)}% detection confidence</span>}
        {p.assetId&&<label>Assign floor<select value={saved?.levelIndex??Math.min(i,3)} onChange={e=>onChange?.(p,{levelIndex:+e.target.value})}>{['Level 1','Level 2','Level 3','Basement'].map((s,n)=><option key={s} value={n}>{s}</option>)}</select></label>}
        <p className="small-note">Floor plan from {p.sourcePageUrl?<a href={p.sourcePageUrl} target="_blank" rel="noopener noreferrer">{p.sourceName||'listing source'}</a>:p.sourceName||'listing source'}. For your personal evaluation only.</p>
        {p.assetId&&<button onClick={()=>{setSelected(p.assetId);onCalibrate?.(p);}}>{saved?.calibration?'Re-calibrate':'Set the scale to use this plan'}</button>}
        <button disabled aria-disabled="true" title="Coming soon: detect walls, rooms, doors and windows from your calibrated floor plan.">Convert to 3D · Coming soon</button>
      </article>;
    })}
    {chosen&&<PlanViewer plan={chosen} clientId={clientId} address={address} onClose={()=>setSelected(null)} />}
  </aside>;
}
