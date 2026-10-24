import React, {useRef} from 'react';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
import {Box} from './Scene';
import {clampPlacement} from '../../lib/planner/collisions';
const plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
export default function FurnitureModel({item,selected,warning,onSelect,onMove,floor,snap,flush}){
  const group=useRef(),drag=useRef(null),{controls}=useThree();const w=item.widthIn/12,d=item.depthIn/12,h=item.heightIn/12,color=warning?'#cf5550':item.colorOverride||item.color;
  const box=(x,y,z,a,b,c,tint=color)=><Box position={[x,y,z]} size={[a,b,c]} color={tint} castShadow receiveShadow/>;
  const legs=()=>[-1,1].flatMap(x=>[-1,1].map(z=><React.Fragment key={x+','+z}>{box(x*(w/2-.15),h/2,z*(d/2-.15),.15,h,.15,'#6b5744')}</React.Fragment>));
  function stop(e){e.stopPropagation();if(!drag.current)return;const p={...item,xIn:group.current.position.x*12,zIn:group.current.position.z*12};drag.current=null;if(controls)controls.enabled=true;e.target.releasePointerCapture?.(e.pointerId);onMove(p);}
  return <group ref={group} position={[item.xIn/12,0,item.zIn/12]} rotation={[0,-(item.rotationDeg||0)*Math.PI/180,0]} onClick={e=>{e.stopPropagation();onSelect(item.id);}} onPointerDown={e=>{e.stopPropagation();onSelect(item.id);if(e.pointerType==='touch'&&!selected)return;const p=e.ray.intersectPlane(plane,new THREE.Vector3());if(!p)return;drag.current={x:p.x-item.xIn/12,z:p.z-item.zIn/12};e.target.setPointerCapture(e.pointerId);if(controls)controls.enabled=false;}} onPointerMove={e=>{if(!drag.current)return;e.stopPropagation();const p=e.ray.intersectPlane(plane,new THREE.Vector3());if(!p)return;const next=clampPlacement({...item,xIn:(p.x-drag.current.x)*12,zIn:(p.z-drag.current.z)*12},item,floor,snap,flush);group.current.position.set(next.xIn/12,0,next.zIn/12);}} onPointerUp={stop} onPointerCancel={stop}>
    {item.category==='bed'?<>{box(0,.6,0,w,1.2,d)}{box(0,1.35,0,w*.95,.3,d*.94,'#eee5d8')}{box(0,h/2,-d/2+.1,w,h,.2)}{box(0,1.6,-d*.3,w*.75,.2,d*.2,'#fffaf1')}</>:item.category==='table'||item.category==='desk'?<>{legs()}{box(0,h-.1,0,w,.2,d)}</>:item.category==='seating'?<>{box(0,h*.25,0,w,h*.5,d)}{box(0,h*.75,-d/2+.15,w,h*.5,.3)}{!item.name.toLowerCase().includes('chair')&&<>{box(-w/2+.15,h*.5,0,.3,h*.4,d)}{box(w/2-.15,h*.5,0,.3,h*.4,d)}</>}</>:item.category==='rug'?box(0,.025,0,w,.05,d):item.category==='decor'?<>{box(0,.1,0,w,.2,d)}{box(0,h/2,0,w*.25,h,d*.25)}{box(0,h*.8,0,w,h*.3,d)}</>:<>{box(0,h/2,0,w,h,d)}{[.3,.65].map(y=><React.Fragment key={y}>{box(0,h*y,d/2+.01,w*.9,.04,.03,'#65523f')}</React.Fragment>)}</>}
    {selected&&<mesh position={[0,.04,0]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[w+.2,d+.2]}/><meshBasicMaterial color="#e4aa33" wireframe/></mesh>}
  </group>;
}
