import React, { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { PointerLockControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import DetectedWalls from "../planner/DetectedWalls";
import { SurfaceMaterials } from "../planner/Scene";
import { move } from "../../lib/tour/collide";

export const EYE_HEIGHT = 5.5, WALK_SPEED = 4, PLAYER_RADIUS = 0.8;

// Flat horizontal polygon made of footprint rectangles (normal up, or down for the ceiling).
function rectsGeometry(rects, y, down = false) {
  const pos = [], nor = [], uv = [], index = [];
  for (const [x0, z0, x1, z1] of rects) {
    const n = pos.length / 3;
    pos.push(x0, y, z0, x1, y, z0, x1, y, z1, x0, y, z1);
    for (let i = 0; i < 4; i++) nor.push(0, down ? -1 : 1, 0);
    uv.push(x0, -z0, x1, -z0, x1, -z1, x0, -z1);
    // Counter-clockwise seen from the side the normal points to.
    if (down) index.push(n, n + 1, n + 2, n, n + 2, n + 3);
    else index.push(n, n + 2, n + 1, n, n + 3, n + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(index);
  return g;
}

function Environment() {
  const { gl, scene } = useThree();
  useEffect(() => {
    const pmrem = new THREE.PMREMGenerator(gl);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.35;
    return () => { scene.environment = null; env.dispose(); pmrem.dispose(); };
  }, [gl, scene]);
  return null;
}

function Furniture({ item }) {
  const { scene } = useGLTF("/" + item.glb.replace(/^\/+/, ""), false, false);
  const object = useMemo(() => {
    const o = scene.clone(true);
    o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return o;
  }, [scene]);
  const [x, y, z] = item.position || [0, 0, 0];
  return <primitive object={object} position={[x, y || 0, z]}
    rotation={[0, ((item.rotation_deg || 0) * Math.PI) / 180, 0]} />;
}

class Boundary extends React.Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(e) { console.warn("Furniture failed to load", this.props.name, e); }
  render() { return this.state.failed ? null : this.props.children; }
}

// First-person movement: WASD / arrows, collision with walls and furniture footprints.
function Player({ start, obstacles, onLockChange, controlsRef }) {
  const { camera, gl } = useThree();
  const keys = useRef(new Set());
  useEffect(() => {
    camera.rotation.order = "YXZ";
    camera.position.set(start.x, start.y, start.z);
    camera.rotation.set(start.pitch, start.yaw, 0);
    camera.updateMatrixWorld();
  }, [camera, start]);
  useEffect(() => {
    const code = (e) => ({ ArrowUp: "KeyW", ArrowDown: "KeyS", ArrowLeft: "KeyA", ArrowRight: "KeyD" }[e.code] || e.code);
    const down = (e) => {
      if (["KeyW", "KeyA", "KeyS", "KeyD"].includes(code(e))) e.preventDefault();
      keys.current.add(code(e));
      if (e.shiftKey) keys.current.add("Shift"); else keys.current.delete("Shift");
    };
    const up = (e) => { keys.current.delete(code(e)); if (!e.shiftKey) keys.current.delete("Shift"); };
    const blur = () => keys.current.clear();
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); window.removeEventListener("blur", blur); };
  }, []);
  const fwd = useMemo(() => new THREE.Vector3(), []);
  useFrame((_, dt) => {
    const k = keys.current;
    const f = (k.has("KeyW") ? 1 : 0) - (k.has("KeyS") ? 1 : 0), r = (k.has("KeyD") ? 1 : 0) - (k.has("KeyA") ? 1 : 0);
    if (!f && !r) return;
    camera.getWorldDirection(fwd);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-8) return;
    fwd.normalize();
    let dx = fwd.x * f - fwd.z * r, dz = fwd.z * f + fwd.x * r;
    const len = Math.hypot(dx, dz), step = WALK_SPEED * (k.has("Shift") ? 2 : 1) * Math.min(dt, 0.1);
    dx = (dx / len) * step; dz = (dz / len) * step;
    const [x, z] = move(camera.position.x, camera.position.z, dx, dz, PLAYER_RADIUS, obstacles);
    camera.position.set(x, EYE_HEIGHT, z);
  });
  return <PointerLockControls ref={controlsRef} domElement={gl.domElement}
    selector="#tour-root canvas" onLock={() => onLockChange(true)} onUnlock={() => onLockChange(false)} />;
}

export default function TourWorld({ floor, ceilingHeightIn, scene, entries, footprint, lights, obstacles, start, showCeiling, onLockChange, controlsRef }) {
  const heightFt = ceilingHeightIn / 12;
  const floorGeo = useMemo(() => rectsGeometry(footprint.rects, 0), [footprint]);
  const ceilingGeo = useMemo(() => rectsGeometry(footprint.rects, heightFt, true), [footprint, heightFt]);
  const [bx0, bz0, bx1, bz1] = footprint.bounds;
  return (
    <>
      <color attach="background" args={["#cfe0ee"]} />
      <fog attach="fog" args={["#cfe0ee", 60, 220]} />
      <Environment />
      <hemisphereLight args={["#fffaf0", "#a8977e", 0.55]} />
      <directionalLight position={[bx0 - 30, 60, bz0 - 20]} intensity={1.6} color="#fff4e0" castShadow
        shadow-mapSize={[2048, 2048]} shadow-bias={-0.0005} shadow-normalBias={0.05}
        shadow-camera-left={-45} shadow-camera-right={45} shadow-camera-top={45} shadow-camera-bottom={-45}
        shadow-camera-far={200} target-position={[(bx0 + bx1) / 2, 0, (bz0 + bz1) / 2]} />
      {lights.map(([x, z], i) => (
        <pointLight key={i} position={[x, heightFt - 1.4, z]} intensity={10} distance={24} decay={1.3} color="#ffeedd" />
      ))}
      {/* Ground outside the house so windows don't look into the void. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(bx0 + bx1) / 2, -0.05, (bz0 + bz1) / 2]} receiveShadow>
        <planeGeometry args={[400, 400]} />
        <meshStandardMaterial color="#8e9a78" roughness={1} />
      </mesh>
      <mesh geometry={floorGeo} userData={{ surface: "floor" }} receiveShadow>
        <meshStandardMaterial color="#d8cbb4" roughness={0.8} />
      </mesh>
      {showCeiling && (
        <mesh geometry={ceilingGeo} userData={{ surface: "ceiling" }}>
          <meshStandardMaterial color="#fbfaf7" roughness={0.95} />
        </mesh>
      )}
      <DetectedWalls walls={floor.walls} heightIn={ceilingHeightIn} />
      <SurfaceMaterials floor={entries.floor} walls={entries.walls} />
      {(scene.furniture || []).map((item, i) => item.glb && (
        <Boundary key={item.id || i} name={item.glb}>
          <Suspense fallback={null}><Furniture item={item} /></Suspense>
        </Boundary>
      ))}
      <Player start={start} obstacles={obstacles} onLockChange={onLockChange} controlsRef={controlsRef} />
    </>
  );
}
