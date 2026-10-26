import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Canvas } from "@react-three/fiber";
import { importFloorPlan } from "../lib/planner/importFloorPlan";
import { loadLibrary, findEntry } from "../lib/planner/materials";
import { computeFootprint, pickStart, lightSpots } from "../lib/tour/footprint";
import { wallObstacles, furnitureObstacles } from "../lib/tour/collide";
import TourWorld, { EYE_HEIGHT, PLAYER_RADIUS } from "../components/tour/TourWorld";

const assetUrl = (p) => (/^([a-z][a-z0-9+.-]*:|\/)/i.test(p) ? p : "/" + p);
async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw Error(`Could not load ${url} (${r.status})`);
  return r.json();
}

// ?cam=x,y,z,yawDeg[,pitchDeg]  yaw 0 looks toward -z (plan north), 90 toward -x (CCW from above).
function parseCam(value) {
  const v = (value || "").split(",").map(Number);
  if (v.length < 4 || v.slice(0, 4).some((n) => !Number.isFinite(n))) return null;
  return { x: v[0], y: v[1], z: v[2], yaw: (v[3] * Math.PI) / 180, pitch: ((Number.isFinite(v[4]) ? v[4] : 0) * Math.PI) / 180 };
}

export default function Tour() {
  const [params] = useSearchParams();
  const sceneUrl = assetUrl(params.get("scene") || "scene.json");
  const camParam = params.get("cam");
  const showCeiling = params.get("ceiling") !== "0";
  const [state, setState] = useState({ status: "loading" });
  const [locked, setLocked] = useState(false);
  const controlsRef = useRef();
  const canvasRef = useRef();

  useEffect(() => {
    let cancelled = false;
    setState({ status: "loading" });
    (async () => {
      const scene = await getJson(sceneUrl);
      const houseData = typeof scene.house === "string" ? await getJson(assetUrl(scene.house)) : scene.house;
      const model = importFloorPlan(houseData);
      const library = await loadLibrary().catch(() => []);
      return { scene, model, library };
    })().then((v) => !cancelled && setState({ status: "ready", ...v }),
      (e) => !cancelled && setState({ status: "error", error: e.message || String(e) }));
    return () => { cancelled = true; };
  }, [sceneUrl]);

  const world = useMemo(() => {
    if (state.status !== "ready") return null;
    const { scene, model, library } = state;
    const floor = model.floors[0];
    const footprint = computeFootprint(floor);
    const obstacles = [...wallObstacles(floor), ...furnitureObstacles(scene.furniture)];
    const spot = pickStart(footprint, obstacles, PLAYER_RADIUS) || [floor.widthIn / 24, floor.depthIn / 24];
    const start = parseCam(camParam) || { x: spot[0], y: EYE_HEIGHT, z: spot[1], yaw: 0, pitch: 0 };
    return {
      floor, footprint, obstacles, start, ceilingHeightIn: model.ceilingHeightIn, scene,
      lights: lightSpots(footprint, obstacles),
      entries: { floor: findEntry(library, scene.materials?.floor), walls: findEntry(library, scene.materials?.walls) },
    };
  }, [state, camParam]);

  const onCreated = useCallback(({ gl, camera }) => {
    canvasRef.current = gl.domElement;
    // Debug / screenshot hooks for reproducible views.
    window.__tour = {
      getCam: () => ({ x: camera.position.x, y: camera.position.y, z: camera.position.z,
        yawDeg: (camera.rotation.y * 180) / Math.PI, pitchDeg: (camera.rotation.x * 180) / Math.PI }),
      setCam: (x, y, z, yawDeg = 0, pitchDeg = 0) => {
        camera.rotation.order = "YXZ";
        camera.position.set(x, y, z);
        camera.rotation.set((pitchDeg * Math.PI) / 180, (yawDeg * Math.PI) / 180, 0);
      },
      screenshot: () => gl.domElement.toDataURL("image/png"),
    };
  }, []);
  useEffect(() => () => { delete window.__tour; }, []);

  return (
    <div id="tour-root" style={styles.root}>
      {world && (
        <Canvas shadows dpr={[1, 2]} gl={{ preserveDrawingBuffer: true, antialias: true }}
          camera={{ fov: 70, near: 0.05, far: 600, position: [world.start.x, world.start.y, world.start.z] }}
          onCreated={onCreated}>
          <TourWorld {...world} showCeiling={showCeiling} onLockChange={setLocked} controlsRef={controlsRef} />
        </Canvas>
      )}
      {state.status === "loading" && <p style={styles.center}>Loading tour…</p>}
      {state.status === "error" && <p style={styles.center}>Could not load the tour: {state.error}</p>}
      {state.status === "ready" && !locked && (
        <div style={styles.hint}>Click to walk — WASD to move, Esc to release</div>
      )}
      {!locked && (
        <Link to="/planner" style={styles.back}>← Back to planner</Link>
      )}
      {locked && <div style={styles.crosshair} />}
    </div>
  );
}

const styles = {
  root: { position: "fixed", inset: 0, zIndex: 1000, background: "#cfe0ee", cursor: "pointer" },
  center: { position: "absolute", top: "45%", width: "100%", textAlign: "center", font: "16px system-ui, sans-serif", color: "#333" },
  hint: { position: "absolute", left: "50%", bottom: 24, transform: "translateX(-50%)", padding: "8px 14px",
    borderRadius: 8, background: "rgba(20,20,20,0.6)", color: "#fff", font: "14px system-ui, sans-serif", pointerEvents: "none" },
  back: { position: "absolute", left: 16, top: 14, padding: "6px 10px", borderRadius: 6, background: "rgba(255,255,255,0.85)",
    color: "#222", font: "13px system-ui, sans-serif", textDecoration: "none" },
  crosshair: { position: "absolute", left: "50%", top: "50%", width: 6, height: 6, margin: -3, borderRadius: 3,
    background: "rgba(255,255,255,0.8)", pointerEvents: "none" },
};
