// House footprint from wall segments: rasterise every wall (openings closed) on a grid,
// flood-fill the outside from the border, and keep what the flood can't reach.
// Pure; inputs are the importFloorPlan floor (inches), outputs feet.
import { wallFrame } from "../planner/detectedWalls.js";
import { overlapsAny } from "./collide.js";

export function computeFootprint(floor, { cell = 0.25, pad = 0.3 } = {}) {
  const box = (w, p) => {
    const f = wallFrame(w);
    return { x: (w.x1 + w.x2) / 24, z: (w.z1 + w.z2) / 24, w: f.length / 12 + 2 * p,
      d: w.thicknessIn / 12 + 2 * p, angle: (f.angle * Math.PI) / 180 };
  };
  // Padded walls close small junction gaps for the flood; core walls are the real extent.
  const walls = (floor.walls || []).map((w) => box(w, pad));
  const cores = (floor.walls || []).map((w) => box(w, cell / 2));
  const xs = (floor.walls || []).flatMap((w) => [w.x1 / 12, w.x2 / 12]);
  const zs = (floor.walls || []).flatMap((w) => [w.z1 / 12, w.z2 / 12]);
  if (!xs.length) return null;
  const x0 = Math.min(...xs) - 1, z0 = Math.min(...zs) - 1;
  const nx = Math.ceil((Math.max(...xs) + 1 - x0) / cell), nz = Math.ceil((Math.max(...zs) + 1 - z0) / cell);
  const idx = (i, j) => j * nx + i;
  const raster = (boxes) => {
    const mask = new Uint8Array(nx * nz);
    for (const b of boxes) {
      // Only test cells in the box's bounding box.
      const ext = (Math.abs(Math.cos(b.angle)) * b.w + Math.abs(Math.sin(b.angle)) * b.d) / 2,
        ezt = (Math.abs(Math.sin(b.angle)) * b.w + Math.abs(Math.cos(b.angle)) * b.d) / 2;
      const i0 = Math.max(0, Math.floor((b.x - ext - x0) / cell)), i1 = Math.min(nx - 1, Math.ceil((b.x + ext - x0) / cell));
      const j0 = Math.max(0, Math.floor((b.z - ezt - z0) / cell)), j1 = Math.min(nz - 1, Math.ceil((b.z + ezt - z0) / cell));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++)
        if (overlapsAny(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell, 1e-4, [b])) mask[idx(i, j)] = 1;
    }
    return mask;
  };
  const blocked = raster(walls), core = raster(cores);
  const outside = new Uint8Array(nx * nz), stack = [];
  const seed = (i, j) => { const k = idx(i, j); if (!blocked[k] && !outside[k]) { outside[k] = 1; stack.push(i, j); } };
  for (let i = 0; i < nx; i++) { seed(i, 0); seed(i, nz - 1); }
  for (let j = 0; j < nz; j++) { seed(0, j); seed(nx - 1, j); }
  while (stack.length) {
    const j = stack.pop(), i = stack.pop();
    if (i > 0) seed(i - 1, j); if (i < nx - 1) seed(i + 1, j);
    if (j > 0) seed(i, j - 1); if (j < nz - 1) seed(i, j + 1);
  }
  // Let the outside also claim the padding band on the outer face of exterior walls, so the
  // floor stops at the wall instead of poking out past it.
  for (let k = 0; k < nx * nz; k++) if (outside[k]) stack.push(k % nx, Math.floor(k / nx));
  const claim = (i, j) => { const k = idx(i, j); if (blocked[k] && !core[k] && !outside[k]) { outside[k] = 2; stack.push(i, j); } };
  while (stack.length) {
    const j = stack.pop(), i = stack.pop();
    if (i > 0) claim(i - 1, j); if (i < nx - 1) claim(i + 1, j);
    if (j > 0) claim(i, j - 1); if (j < nz - 1) claim(i, j + 1);
  }
  let interiorCount = 0;
  for (let k = 0; k < nx * nz; k++) if (!outside[k] && !blocked[k]) interiorCount++;
  // If the outline leaks (flood reached nearly everything) fall back to the bounding box.
  const leaked = interiorCount < 0.05 * nx * nz;
  const inFloor = (i, j) => leaked ? true : !outside[idx(i, j)];
  // Merge cells into rectangles: row runs, extended downward while identical.
  const used = new Uint8Array(nx * nz), rects = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
    if (used[idx(i, j)] || !inFloor(i, j)) continue;
    let i2 = i; while (i2 + 1 < nx && inFloor(i2 + 1, j) && !used[idx(i2 + 1, j)]) i2++;
    let j2 = j;
    const rowOk = (jj) => { for (let ii = i; ii <= i2; ii++) if (!inFloor(ii, jj) || used[idx(ii, jj)]) return false; return true; };
    while (j2 + 1 < nz && rowOk(j2 + 1)) j2++;
    for (let jj = j; jj <= j2; jj++) for (let ii = i; ii <= i2; ii++) used[idx(ii, jj)] = 1;
    rects.push([x0 + i * cell, z0 + j * cell, x0 + (i2 + 1) * cell, z0 + (j2 + 1) * cell]);
  }
  const interior = [];
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++)
    if (leaked ? !blocked[idx(i, j)] : !outside[idx(i, j)] && !blocked[idx(i, j)])
      interior.push([x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell]);
  return { rects, interior, leaked, bounds: [x0, z0, x0 + nx * cell, z0 + nz * cell] };
}

/** A start point inside the house, clear of obstacles, nearest the interior centroid. */
export function pickStart(footprint, obstacles, radius = 0.8) {
  const pts = footprint?.interior || [];
  if (!pts.length) return null;
  const cx = pts.reduce((s, p) => s + p[0], 0) / pts.length, cz = pts.reduce((s, p) => s + p[1], 0) / pts.length;
  const sorted = [...pts].sort((a, b) => Math.hypot(a[0] - cx, a[1] - cz) - Math.hypot(b[0] - cx, b[1] - cz));
  return sorted.find((p) => !overlapsAny(p[0], p[1], radius + 0.4, obstacles)) || sorted[0];
}

/** Light positions: interior grid points roughly every `spacing` ft. */
export function lightSpots(footprint, obstacles, spacing = 11, max = 8) {
  const pts = footprint?.interior || [];
  const buckets = new Map();
  for (const p of pts) {
    const key = `${Math.floor(p[0] / spacing)},${Math.floor(p[1] / spacing)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(p);
  }
  return [...buckets.values()].filter((b) => b.length > 40).sort((a, b) => b.length - a.length).slice(0, max)
    .map((b) => {
      const cx = b.reduce((s, p) => s + p[0], 0) / b.length, cz = b.reduce((s, p) => s + p[1], 0) / b.length;
      return b.reduce((best, p) => Math.hypot(p[0] - cx, p[1] - cz) < Math.hypot(best[0] - cx, best[1] - cz) ? p : best);
    });
}
