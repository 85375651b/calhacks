import { validateHouseModel } from "./validateHouseModel.js";
import { wallFrame } from "./detectedWalls.js";

// Accepts the notebook's plan1_clean.json, not arbitrary executable model files.
export function importFloorPlan(data, { pixelsPerInch, rotationDeg = 0, level = 0, widthPx, heightPx, ceilingHeightIn } = {}) {
  if (!data || !Array.isArray(data.walls) || !data.walls.length || data.walls.length > 1000 ||
      !Array.isArray(data.openings) || data.openings.length > 240) throw Error("Choose a floor plan JSON with walls and openings.");
  const finite = (v, min = 0, max = 100000) => {
    if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) throw Error("Floor plan contains invalid dimensions.");
    return v;
  };
  const ppi = pixelsPerInch ?? data.pixels_per_inch;
  const factor = data.units === "feet" ? 12 : data.units === "inches" ? 1 :
    data.units === "pixels" && Number.isFinite(ppi) && ppi > 0 ? 1 / ppi : null;
  if (!factor) throw Error("JSON must use feet or inches, or pixels with a calibrated scale.");
  const wallIds = new Map();
  const walls = data.walls.map((w, i) => {
    if (!["string", "number"].includes(typeof w.id) || wallIds.has(String(w.id))) throw Error("Wall IDs must be present and unique.");
    wallIds.set(String(w.id), i);
    return { id: `wall-${i}`, x1: finite(w.x1) * factor, z1: finite(w.y1) * factor,
      x2: finite(w.x2) * factor, z2: finite(w.y2) * factor,
      thicknessIn: finite(w.thickness, 0.001) * factor, openings: [] };
  });
  for (const o of data.openings) {
    const w = walls[wallIds.get(String(o.wall))];
    if (!w || !["door", "window"].includes(o.type)) throw Error("An opening refers to an unknown wall or type.");
    const length = wallFrame(w).length;
    const positionIn = finite(o.position) * factor, widthIn = finite(o.width, 0.001) * factor;
    if (positionIn > length + 0.1) throw Error("An opening falls outside its wall.");
    w.openings.push({ type: o.type, positionIn, widthIn,
      heightIn: o.height == null ? (o.type === "door" ? 81 : 48) : finite(o.height, 0.001) * factor,
      sillIn: o.type === "door" ? 0 : o.sill == null ? 36 : finite(o.sill) * factor });
  }
  const knownSize = widthPx != null && heightPx != null;
  let widthIn = knownSize ? finite(widthPx, 1, 4096) / finite(ppi, 0.0001) : Math.max(...walls.flatMap(w => [w.x1, w.x2])) + Math.max(...walls.map(w => w.thicknessIn))/2;
  let depthIn = knownSize ? finite(heightPx, 1, 4096) / ppi : Math.max(...walls.flatMap(w => [w.z1, w.z2])) + Math.max(...walls.map(w => w.thicknessIn))/2;
  if (![0,90,180,270].includes(rotationDeg)) throw Error("Invalid plan rotation.");
  const rotate = (x, z) => rotationDeg === 90 ? [depthIn-z,x] : rotationDeg === 180 ? [widthIn-x,depthIn-z] : rotationDeg === 270 ? [z,widthIn-x] : [x,z];
  for (const w of walls) {
    [w.x1,w.z1] = rotate(w.x1,w.z1);
    [w.x2,w.z2] = rotate(w.x2,w.z2);
  }
  if (rotationDeg % 180) [widthIn,depthIn] = [depthIn,widthIn];
  const doors = [], windows = [];
  for (const w of walls) {
    const f = wallFrame(w);
    for (const o of w.openings) {
      const entry = { id: `opening-${doors.length+windows.length}`, x: w.x1+f.dx*o.positionIn,
        z: w.z1+f.dz*o.positionIn, widthIn: o.widthIn,
        axis: Math.abs(f.dx) >= Math.abs(f.dz) ? "x" : "z", rotationDeg: f.angle };
      if (o.type === "door") doors.push({ ...entry, roomIds: ["plan-room"] });
      else windows.push({ ...entry, roomId: "plan-room" });
    }
  }
  return validateHouseModel({ source: "floorplan", estimated: false,
    ceilingHeightIn: ceilingHeightIn ?? (data.ceiling_height == null ? 96 : finite(data.ceiling_height, 6, 20) * 12),
    floors: [{ level, widthIn, depthIn, walls, doors, windows, rooms: [{ id: "plan-room", name: "Floor plan", type: "living", x: 0, z: 0, widthIn, depthIn, dimensionSource: "user" }] }] });
}
