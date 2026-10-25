import React,{useEffect,useRef,useState} from 'react';
import {useAssetImage} from '../../lib/planner/floorPlanApi';
export default function PlanViewer({plan,clientId,address,onClose}) {
  const dialog=useRef(),url=useAssetImage(plan.assetId,clientId),[zoom,setZoom]=useState(1),[pan,setPan]=useState({x:0,y:0}),pointers=useRef(new Map()),last=useRef();
  useEffect(()=>{const focus=document.activeElement;dialog.current.showModal();return()=>focus?.focus();},[]);
  const scale=n=>setZoom(z=>Math.max(.25,Math.min(8,n??z)));
  return <dialog ref={dialog} className="floorplan-viewer" aria-labelledby="plan-viewer-title" onCancel={e=>{e.preventDefault();onClose();}}>
    <header><h2 id="plan-viewer-title">{plan.sample?'Sample floor plan':`Floor plan for ${address}`}</h2><button autoFocus onClick={onClose}>Close</button></header>
    <div className="plan-viewer-toolbar"><button onClick={()=>scale(zoom*1.25)}>Zoom in</button><button onClick={()=>scale(zoom/1.25)}>Zoom out</button><button onClick={()=>{setZoom(1);setPan({x:0,y:0});}}>Fit to screen</button></div>
    <p>Drag to pan. Use arrow keys to pan, +/− to zoom, or pinch on a touch screen.</p>
    <div className="plan-viewport" tabIndex={0} role="group" aria-label="Floor plan image controls" onKeyDown={e=>{const delta={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]}[e.key];if(delta){e.preventDefault();setPan(p=>({x:p.x+delta[0],y:p.y+delta[1]}));}if(e.key==='+'||e.key==='=')scale(zoom*1.2);if(e.key==='-')scale(zoom/1.2);}}
      onWheel={e=>scale(zoom*(e.deltaY<0?1.1:.9))}
      onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});last.current={x:e.clientX,y:e.clientY};}}
      onPointerMove={e=>{if(!pointers.current.has(e.pointerId))return;const before=[...pointers.current.values()];pointers.current.set(e.pointerId,{x:e.clientX,y:e.clientY});const after=[...pointers.current.values()];if(after.length===2){const dist=a=>Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y);if(dist(before)>0)scale(zoom*dist(after)/dist(before));}else if(last.current)setPan(p=>({x:p.x+e.clientX-last.current.x,y:p.y+e.clientY-last.current.y}));last.current={x:e.clientX,y:e.clientY};}}
      onPointerUp={e=>{pointers.current.delete(e.pointerId);last.current=null;}} onPointerCancel={()=>{pointers.current.clear();last.current=null;}}>
      {url?<img draggable="false" src={url} alt={`Floor plan for ${address}`} style={{transform:`translate(${pan.x}px, ${pan.y}px) scale(${zoom})`}}/>:<p>Loading preview…</p>}
    </div><p>Floor plan from {plan.sourceName||'listing source'}. For your personal evaluation only.</p>
  </dialog>;
}
