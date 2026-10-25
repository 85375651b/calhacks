import React,{useEffect,useState} from 'react';
import {useThree} from '@react-three/fiber';
import * as THREE from 'three';
export default function PlanFloor({url,floor,rotationDeg=0,opacity=1}) {
  const {gl}=useThree(),[texture,setTexture]=useState(null);
  useEffect(()=>{
    let cancelled=false,created;setTexture(null);if(!url)return;
    const img=new Image();img.onload=()=>{
      if(cancelled)return;
      const canvas=document.createElement('canvas'),swap=rotationDeg%180!==0;
      canvas.width=swap?img.height:img.width;canvas.height=swap?img.width:img.height;
      const ctx=canvas.getContext('2d');ctx.translate(canvas.width/2,canvas.height/2);ctx.rotate(rotationDeg*Math.PI/180);ctx.drawImage(img,-img.width/2,-img.height/2);
      created=new THREE.CanvasTexture(canvas);created.colorSpace=THREE.SRGBColorSpace;created.generateMipmaps=true;created.minFilter=THREE.LinearMipmapLinearFilter;created.anisotropy=Math.min(4,gl.capabilities.getMaxAnisotropy());setTexture(created);
    };img.src=url;
    return()=>{cancelled=true;img.onload=null;created?.dispose();};
  },[url,rotationDeg,gl]);
  if(!texture)return null;
  return <mesh position={[floor.widthIn/24,.007,floor.depthIn/24]} rotation={[-Math.PI/2,0,0]}><planeGeometry args={[floor.widthIn/12,floor.depthIn/12]}/><meshBasicMaterial map={texture} transparent opacity={opacity} depthWrite={false} side={THREE.DoubleSide}/></mesh>;
}
