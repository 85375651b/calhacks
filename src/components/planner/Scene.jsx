import React, { useEffect, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, OrthographicCamera, PerspectiveCamera, Html } from '@react-three/drei';
import * as THREE from 'three';
const roomColors = {living:'#e8ddc7',kitchen:'#d9e5dc',bedroom:'#e4dce8',bathroom:'#d5e5ed',hallway:'#eee9df',dining:'#eaddce'};
export function Box({position,size,color,...props}) { return <mesh position={position} {...props}><boxGeometry args={size}/><meshStandardMaterial color={color}/></mesh>; }
function Camera({floor,view,focus}) {
  const controls=useRef(), {camera}=useThree();
  useEffect(()=>{const x=(focus?focus.x+focus.widthIn/2:floor.widthIn/2)/12,z=(focus?focus.z+focus.depthIn/2:floor.depthIn/2)/12;camera.position.set(x+(view==='3D'?30:0),view==='3D'?40:70,z+(view==='3D'?36:.01));camera.lookAt(x,0,z);controls.current?.target.set(x,0,z);controls.current?.update();},[camera,floor.widthIn,floor.depthIn,focus,view]);
  return <OrbitControls ref={controls} makeDefault enableRotate={view==='3D'} minDistance={5} maxDistance={180} maxPolarAngle={Math.PI/2-.03}/>;
}
function Wall({room,edge,floor,height}) {
  const horizontal=edge==='north'||edge==='south', fixed=horizontal?(edge==='north'?room.z:room.z+room.depthIn):(edge==='west'?room.x:room.x+room.widthIn),start=horizontal?room.x:room.z,end=start+(horizontal?room.widthIn:room.depthIn);
  const openings=[...floor.doors,...floor.windows].filter(d=>d.axis===(horizontal?'x':'z')&&Math.abs((horizontal?d.z:d.x)-fixed)<.01).map(d=>({a:Math.max(start,(horizontal?d.x:d.z)-d.widthIn/2),b:Math.min(end,(horizontal?d.x:d.z)+d.widthIn/2),window:!!d.roomId})).filter(d=>d.b>d.a).sort((a,b)=>a.a-b.a);
  const parts=[];let cursor=start;
  const part=(a,b,y,h,color='#f6f2e9')=>{if(b-a>0)parts.push(<Box key={parts.length} position={horizontal?[(a+b)/24,y,fixed/12]:[fixed/12,y,(a+b)/24]} size={horizontal?[(b-a)/12,h,.12]:[.12,h,(b-a)/12]} color={color}/>);};
  for(const o of openings){part(cursor,o.a,height/2,height);if(o.window){part(o.a,o.b,Math.min(height,2)/2,Math.min(height,2));if(height>2)part(o.a,o.b,3,2,'#a9d5e3');if(height>4)part(o.a,o.b,(height+4)/2,height-4);}else if(height>6.8)part(o.a,o.b,(height+6.8)/2,height-6.8);cursor=Math.max(cursor,o.b);}part(cursor,end,height/2,height);
  return <group>{parts}</group>;
}
function Content({floor,view,fullWalls,quality,focus,children,onEmpty}) {
  return <><color attach="background" args={['#f0eee8']}/>{view==='2D'?<OrthographicCamera makeDefault position={[0,70,.01]} zoom={12} near={.1} far={500}/>:<PerspectiveCamera makeDefault position={[35,40,40]} fov={48}/>}
    <Camera floor={floor} view={view} focus={focus}/><ambientLight intensity={1.5}/><directionalLight position={[15,35,20]} intensity={2} castShadow={quality==='high'}/>
    <gridHelper args={[200,200,'#c2c9c2','#e1e3dc']} position={[0,-.1,0]}/>
    {floor.rooms.map(room=><group key={room.id}><Box position={[(room.x+room.widthIn/2)/12,-.04,(room.z+room.depthIn/2)/12]} size={[room.widthIn/12,.08,room.depthIn/12]} color={roomColors[room.type]} onClick={onEmpty} receiveShadow/>
      {['north','south','east','west'].map(edge=><Wall key={edge} room={room} edge={edge} floor={floor} height={view==='2D'?.15:fullWalls?8:1.2}/>)}
      <Html position={[(room.x+room.widthIn/2)/12,.05,(room.z+room.depthIn/2)/12]} center style={{pointerEvents:'none'}}><span className="room-label">{room.name}</span></Html></group>)}{children}</>;
}
export default function Scene(props){ return <Canvas aria-label="Estimated house layout. Use the Rooms and furniture panels for keyboard controls." dpr={[1,2]} shadows={props.quality==='high'} gl={{preserveDrawingBuffer:true}} onCreated={({gl})=>props.onCanvas?.(gl.domElement)}><Content {...props}/></Canvas>; }
