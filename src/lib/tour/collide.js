// Player-vs-obstacle collision for the first-person tour. Pure functions, feet, scene x/z.
// Obstacles are oriented rectangles { x, z, w, d, angle } (angle in radians: the box's local
// +w axis is (cos angle, sin angle) in x/z, matching wallFrame / detectedWallBoxes).
import { detectedWallBoxes } from "../planner/detectedWalls.js";

/** Wall pieces at ankle height, so door gaps are open and window sills are solid. */
export function wallObstacles(floor) {
  if (!floor?.walls) return [];
  return detectedWallBoxes(floor).map((b) => ({
    x: b.xIn / 12, z: b.zIn / 12, w: b.widthIn / 12, d: b.depthIn / 12,
    angle: (b.rotationDeg * Math.PI) / 180,
  }));
}

/** Furniture footprints from scene.json items (rotation.y = rotation_deg, CCW from above). */
export function furnitureObstacles(items = []) {
  return items.filter((f) => Array.isArray(f.size_ft) && Array.isArray(f.position)).map((f) => ({
    // three's rotation.y = t maps local (x, z) to (x cos t + z sin t, -x sin t + z cos t),
    // i.e. local +x points along angle -t in this x/z convention.
    x: f.position[0], z: f.position[2], w: f.size_ft[0], d: f.size_ft[2],
    angle: (-(f.rotation_deg || 0) * Math.PI) / 180,
  }));
}

/** Push a circle (px, pz, r) out of one box. Returns [x, z, hit]. */
export function pushOut(px, pz, r, b) {
  const c = Math.cos(b.angle), s = Math.sin(b.angle);
  const dx = px - b.x, dz = pz - b.z;
  let lu = dx * c + dz * s, lv = -dx * s + dz * c;
  const hw = b.w / 2, hd = b.d / 2;
  if (Math.abs(lu) < hw && Math.abs(lv) < hd) {
    // Centre inside the box: leave by the shallowest side.
    if (hw - Math.abs(lu) < hd - Math.abs(lv)) lu = Math.sign(lu || 1) * (hw + r);
    else lv = Math.sign(lv || 1) * (hd + r);
  } else {
    const qu = Math.max(-hw, Math.min(hw, lu)), qv = Math.max(-hd, Math.min(hd, lv));
    const eu = lu - qu, ev = lv - qv, dist = Math.hypot(eu, ev);
    if (dist >= r) return [px, pz, false];
    lu = qu + (eu / dist) * r;
    lv = qv + (ev / dist) * r;
  }
  return [b.x + lu * c - lv * s, b.z + lu * s + lv * c, true];
}

export function overlapsAny(px, pz, r, boxes) {
  return boxes.some((b) => pushOut(px, pz, r - 1e-6, b)[2]);
}

/** Resolve penetrations by repeated push-out (gives sliding along walls and corners). */
export function resolve(px, pz, r, boxes, iterations = 4) {
  for (let i = 0; i < iterations; i++) {
    let any = false;
    for (const b of boxes) {
      const out = pushOut(px, pz, r, b);
      if (out[2]) { px = out[0]; pz = out[1]; any = true; }
    }
    if (!any) break;
  }
  return [px, pz];
}

/** Move from (px, pz) by (dx, dz), sub-stepped so thin walls can't be tunnelled through. */
export function move(px, pz, dx, dz, r, boxes, minWallFt = 0.1) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / Math.max(0.02, minWallFt / 2)));
  for (let i = 0; i < steps; i++) [px, pz] = resolve(px + dx / steps, pz + dz / steps, r, boxes);
  return [px, pz];
}
