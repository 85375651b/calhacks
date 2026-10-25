import { detectedWallBoxes } from "./detectedWalls.js";
export function corners(item) {
  const a = ((item.rotationDeg || 0) * Math.PI) / 180,
    c = Math.cos(a),
    s = Math.sin(a);
  return [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].map(([x, z]) => ({
    x: item.xIn + ((x * item.widthIn) / 2) * c - ((z * item.depthIn) / 2) * s,
    z: item.zIn + ((x * item.widthIn) / 2) * s + ((z * item.depthIn) / 2) * c,
  }));
}
export function overlaps(a, b) {
  const ca = corners(a),
    cb = corners(b);
  for (const points of [ca, cb])
    for (let i = 0; i < 2; i++) {
      const p = points[i],
        q = points[i + 1],
        axis = { x: -(q.z - p.z), z: q.x - p.x };
      const aa = ca.map((p) => p.x * axis.x + p.z * axis.z),
        bb = cb.map((p) => p.x * axis.x + p.z * axis.z);
      if (
        Math.max(...aa) <= Math.min(...bb) + 0.001 ||
        Math.max(...bb) <= Math.min(...aa) + 0.001
      )
        return false;
    }
  return true;
}
export function doorBox(d) {
  if (d.rotationDeg != null) return { xIn: d.x, zIn: d.z, widthIn: d.widthIn, depthIn: 72, rotationDeg: d.rotationDeg };
  return {
    xIn: d.x,
    zIn: d.z,
    widthIn: d.axis === "x" ? d.widthIn : 72,
    depthIn: d.axis === "x" ? 72 : d.widthIn,
    rotationDeg: 0,
  };
}
export function wallSegments(floor) {
  if (floor.walls) return detectedWallBoxes(floor);
  if(floor.openPlan)return [];
  const walls = [];
  for (const r of floor.rooms)
    for (const axis of ["x", "z"])
      for (const side of [0, 1]) {
        const fixed =
            axis === "x" ? r.z + side * r.depthIn : r.x + side * r.widthIn,
          start = axis === "x" ? r.x : r.z,
          end = start + (axis === "x" ? r.widthIn : r.depthIn);
        const gaps = floor.doors
          .filter(
            (d) =>
              d.axis === axis &&
              Math.abs((axis === "x" ? d.z : d.x) - fixed) < 0.01,
          )
          .map((d) => [
            (axis === "x" ? d.x : d.z) - d.widthIn / 2,
            (axis === "x" ? d.x : d.z) + d.widthIn / 2,
          ])
          .sort((a, b) => a[0] - b[0]);
        let cursor = start;
        const add = (a, b) => {
          if (b > a)
            walls.push({
              xIn: axis === "x" ? (a + b) / 2 : fixed,
              zIn: axis === "x" ? fixed : (a + b) / 2,
              widthIn: axis === "x" ? b - a : 1,
              depthIn: axis === "x" ? 1 : b - a,
            });
        };
        for (const [a, b] of gaps) {
          add(cursor, Math.min(end, a));
          cursor = Math.max(cursor, b);
        }
        add(cursor, end);
      }
  return walls;
}
export function warningsFor(items, floor) {
  const warnings = [],
    walls = wallSegments(floor);
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (a.category === "rug") continue;
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (b.category !== "rug" && overlaps(a, b))
        warnings.push({
          type: "collision",
          ids: [a.id, b.id],
          message: `${a.name} overlaps ${b.name}`,
        });
    }
    if (walls.some((w) => overlaps(a, w)))
      warnings.push({
        type: "wall",
        ids: [a.id],
        message: `${a.name} crosses a wall`,
      });
    if (
      corners(a).some(
        (p) =>
          !floor.rooms.some(
            (r) =>
              p.x >= r.x &&
              p.x <= r.x + r.widthIn &&
              p.z >= r.z &&
              p.z <= r.z + r.depthIn,
          ),
      )
    )
      warnings.push({
        type: "outside",
        ids: [a.id],
        message: `${a.name} extends outside the house`,
      });
    for (const d of floor.doors)
      if (overlaps(a, doorBox(d)))
        warnings.push({
          type: "door",
          ids: [a.id],
          message: `${a.name} blocks a door`,
        });
  }
  return warnings;
}
export function fitMessage(item, room) {
  if (item.widthIn > room.widthIn || item.depthIn > room.depthIn)
    return "This item is larger than the room.";
  if (room.widthIn - item.widthIn < 48 && room.depthIn - item.depthIn < 48)
    return "Less than 24 inches of clearance on both sides.";
  return "Footprint fits; verify access and actual dimensions.";
}
export function wallClearances(item, floor) {
  const r = floor.rooms.find(
    (r) =>
      item.xIn >= r.x &&
      item.xIn <= r.x + r.widthIn &&
      item.zIn >= r.z &&
      item.zIn <= r.z + r.depthIn,
  );
  if (!r) return { x: 0, z: 0 };
  const c = corners(item);
  return {
    x: Math.round(
      Math.min(
        Math.min(...c.map((p) => p.x)) - r.x,
        r.x + r.widthIn - Math.max(...c.map((p) => p.x)),
      ),
    ),
    z: Math.round(
      Math.min(
        Math.min(...c.map((p) => p.z)) - r.z,
        r.z + r.depthIn - Math.max(...c.map((p) => p.z)),
      ),
    ),
  };
}
export function clampPlacement(p, item, floor, snap = 0, flush = false) {
  const pts = corners({ ...item, ...p, xIn: 0, zIn: 0 }),
    hx = Math.max(...pts.map((p) => Math.abs(p.x))),
    hz = Math.max(...pts.map((p) => Math.abs(p.z)));
  let x = snap ? Math.round(p.xIn / snap) * snap : p.xIn,
    z = snap ? Math.round(p.zIn / snap) * snap : p.zIn;
  x = Math.max(hx, Math.min(floor.widthIn - hx, x));
  z = Math.max(hz, Math.min(floor.depthIn - hz, z));
  if (flush && !floor.openPlan && !floor.walls) {
    for (const r of floor.rooms) {
      for (const edge of [r.x + hx, r.x + r.widthIn - hx])
        if (Math.abs(x - edge) < 2) x = edge;
      for (const edge of [r.z + hz, r.z + r.depthIn - hz])
        if (Math.abs(z - edge) < 2) z = edge;
    }
  }
  return { ...p, xIn: x, zIn: z };
}
