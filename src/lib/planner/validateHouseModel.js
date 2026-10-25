const fail = () => {
  throw Error("Invalid house model.");
};
const num = (v, min = 0, max = 100000) =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
    ? v
    : fail();
const id = (v) =>
  typeof v === "string" &&
  /^[\w-]{1,100}$/.test(v) &&
  !["__proto__", "constructor", "prototype"].includes(v)
    ? v
    : fail();
const text = (v, n = 160) => (typeof v === "string" ? v.slice(0, n) : "");
function list(v, max) {
  if (!Array.isArray(v) || v.length > max) fail();
  return v;
}
function unique(rows, key) {
  if (new Set(rows.map((r) => r[key])).size !== rows.length) fail();
  return rows;
}
// Shared by generation, conversion and browser/server layout loading. Returns a
// fresh allowlisted model; malformed geometry is rejected, never silently trusted.
export function validateHouseModel(value) {
  if (!value || typeof value !== "object") fail();
  const floors = unique(
    list(value.floors, 4).map((f) => {
      const widthIn = num(f.widthIn, 1),
        depthIn = num(f.depthIn, 1),
        level = num(f.level, 0, 3);
      if (!Number.isInteger(level)) fail();
      const rooms = unique(
        list(f.rooms, 60).map((r) => {
          const room = {
            id: id(r.id),
            name: text(r.name),
            type: [
              "living",
              "bedroom",
              "bathroom",
              "kitchen",
              "dining",
              "hallway",
            ].includes(r.type)
              ? r.type
              : "living",
            x: num(r.x),
            z: num(r.z),
            widthIn: num(r.widthIn, 1),
            depthIn: num(r.depthIn, 1),
          };
          if (
            room.x + room.widthIn > widthIn + 0.01 ||
            room.z + room.depthIn > depthIn + 0.01
          )
            fail();
          if (["estimated", "listing", "user"].includes(r.dimensionSource))
            room.dimensionSource = r.dimensionSource;
          if (typeof r.tight === "boolean") room.tight = r.tight;
          return room;
        }),
        "id",
      );
      if (!rooms.length) fail();
      const ids = new Set(rooms.map((r) => r.id));
      const opening = (o) => ({
        id: id(o.id),
        x: Math.max(0, Math.min(widthIn, num(o.x, -0.01, widthIn + 0.01))),
        z: Math.max(0, Math.min(depthIn, num(o.z, -0.01, depthIn + 0.01))),
        widthIn: num(o.widthIn, 1, 1200),
        axis: ["x", "z"].includes(o.axis) ? o.axis : fail(),
        ...(o.rotationDeg != null ? { rotationDeg: num(o.rotationDeg, -360, 360) } : {}),
      });
      const doors = unique(
        list(f.doors, 120).map((d) => {
          const roomIds = list(d.roomIds, 2).map(id);
          if (!roomIds.length || roomIds.some((r) => !ids.has(r))) fail();
          return {
            ...opening(d),
            roomIds,
            ...(d.exterior === true ? { exterior: true } : {}),
          };
        }),
        "id",
      );
      const windows = unique(
        list(f.windows, 120).map((w) => {
          if (!ids.has(w.roomId)) fail();
          return { ...opening(w), roomId: w.roomId };
        }),
        "id",
      );
      if (f.openPlan && (doors.length || windows.length || rooms.length !== 1))
        fail();
      const walls = f.walls == null ? undefined : unique(list(f.walls, 1000).map(w => {
        const wall = { id: id(w.id), x1: num(w.x1, 0, widthIn), z1: num(w.z1, 0, depthIn),
          x2: num(w.x2, 0, widthIn), z2: num(w.z2, 0, depthIn), thicknessIn: num(w.thicknessIn, 0.01, 120) };
        const length = Math.hypot(wall.x2-wall.x1,wall.z2-wall.z1);
        if (length < 0.1 || f.openPlan) fail();
        wall.openings = list(w.openings || [], 240).map(o => ({
          type: ["door","window"].includes(o.type) ? o.type : fail(),
          positionIn: num(o.positionIn,0,length), widthIn: num(o.widthIn,0.1,1200),
          heightIn: num(o.heightIn,1,240), sillIn: num(o.sillIn,0,240),
        }));
        return wall;
      }), "id");
      if (walls && !walls.length) fail();
      return {
        level,
        rooms,
        doors,
        windows,
        widthIn,
        depthIn,
        ...(walls ? { walls } : {}),
        ...(f.openPlan === true ? { openPlan: true } : {}),
      };
    }),
    "level",
  );
  if (!floors.length) fail();
  const result = {
    floors,
    ceilingHeightIn: num(value.ceilingHeightIn ?? 96, 72, 240),
    source: value.source === "floorplan" ? "floorplan" : "estimated",
    estimated: value.estimated !== false,
  };
  if (typeof value.limited === "boolean") result.limited = value.limited;
  if (value.generatedFrom) {
    result.generatedFrom = {};
    for (const key of ["sqft", "beds", "baths", "stories", "seed", "custom"]) {
      const v = value.generatedFrom[key];
      if (typeof v === "number" && Number.isFinite(v))
        result.generatedFrom[key] = v;
      else if (typeof v === "string") result.generatedFrom[key] = text(v);
      else if (typeof v === "boolean") result.generatedFrom[key] = v;
    }
  }
  return result;
}
export function validHouseOrNull(value) {
  try {
    return validateHouseModel(value);
  } catch {
    return null;
  }
}
