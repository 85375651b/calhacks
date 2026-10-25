// Geometry shared by rendering and furniture collision checks. All values are inches.
export function wallFrame(wall) {
  const dx = wall.x2 - wall.x1, dz = wall.z2 - wall.z1;
  const length = Math.hypot(dx, dz);
  return { length, dx: dx / length, dz: dz / length,
    angle: Math.atan2(dz, dx) * 180 / Math.PI };
}

export function wallSections(wall, heightIn, doorsOnly = false) {
  const { length } = wallFrame(wall);
  const gaps = (wall.openings || []).filter(o => !doorsOnly || o.type === "door")
    .map(o => ({ a: Math.max(0, o.positionIn - o.widthIn / 2),
      b: Math.min(length, o.positionIn + o.widthIn / 2),
      bottom: Math.min(heightIn, o.type === "door" ? 0 : o.sillIn ?? 36),
      top: Math.min(heightIn, (o.type === "door" ? 0 : o.sillIn ?? 36) + (o.heightIn ?? (o.type === "door" ? 81 : 48))) }))
    .filter(o => o.b > o.a && o.top > o.bottom);
  const xs = [...new Set([0, length, ...gaps.flatMap(o => [o.a, o.b])])].sort((a,b) => a-b);
  const parts = [];
  for (let i = 1; i < xs.length; i++) {
    const a = xs[i-1], b = xs[i], mid = (a+b)/2;
    const holes = gaps.filter(o => mid > o.a && mid < o.b).sort((a,b) => a.bottom-b.bottom);
    let y = 0;
    for (const o of holes) {
      if (o.bottom > y) parts.push({ a, b, bottom: y, top: o.bottom });
      y = Math.max(y, o.top);
    }
    if (y < heightIn) parts.push({ a, b, bottom: y, top: heightIn });
  }
  return parts;
}

export function detectedWallBoxes(floor) {
  return floor.walls.flatMap(w => {
    const f = wallFrame(w);
    // A one-inch horizontal slice excludes door gaps but retains window sills.
    return wallSections(w, 1, true).map(p => ({
      xIn: w.x1 + f.dx * (p.a+p.b)/2, zIn: w.z1 + f.dz * (p.a+p.b)/2,
      widthIn: p.b-p.a, depthIn: w.thicknessIn, rotationDeg: f.angle,
    }));
  });
}
