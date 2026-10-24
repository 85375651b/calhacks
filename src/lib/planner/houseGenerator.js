export const clamp = (value, min, max, fallback = min) =>
  Number.isFinite(Number(value)) && value != null && value !== ""
    ? Math.max(min, Math.min(max, Number(value)))
    : fallback;
function hash(seed) {
  let n = 2166136261;
  for (const c of String(seed)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return (n >>> 0) / 4294967296;
}
// A central corridor with two exterior-facing room bands yields a connected,
// non-overlapping partition and gives every habitable room an exterior window.
export function generateHouse(input = {}, overrides = {}) {
  if (Array.isArray(input.customRooms) && input.customRooms.length) {
    const rooms = input.customRooms.slice(0, 20).map((r, i) => ({
      id: "custom-room-" + i,
      name: String(r.name || `Room ${i + 1}`).slice(0, 80),
      type: ["living", "bedroom", "bathroom", "kitchen", "dining"].includes(
        r.type,
      )
        ? r.type
        : "living",
      widthIn: clamp(
        overrides["custom-room-" + i]?.widthIn ?? r.widthIn,
        36,
        1200,
        144,
      ),
      depthIn: clamp(
        overrides["custom-room-" + i]?.depthIn ?? r.depthIn,
        36,
        1200,
        144,
      ),
      dimensionSource: "user",
    }));
    const maxDepth = Math.max(...rooms.map((r) => r.depthIn)),
      doors = [],
      windows = [];
    let x = 0;
    for (const r of rooms) {
      Object.assign(r, {
        x,
        z: maxDepth - r.depthIn,
        tight: r.widthIn < 144 || r.depthIn < 144,
      });
      x += r.widthIn;
      doors.push({
        id: "door-" + r.id,
        roomIds: [r.id, "custom-hall"],
        x: r.x + r.widthIn / 2,
        z: maxDepth,
        widthIn: 32,
        axis: "x",
      });
      windows.push({
        id: "window-" + r.id,
        roomId: r.id,
        x: r.x + r.widthIn / 2,
        z: r.z,
        widthIn: 32,
        axis: "x",
      });
    }
    rooms.push({
      id: "custom-hall",
      name: "Hallway",
      type: "hallway",
      x: 0,
      z: maxDepth,
      widthIn: x,
      depthIn: 42,
    });
    doors.push({
      id: "front",
      roomIds: ["custom-hall"],
      x: 0,
      z: maxDepth + 21,
      widthIn: 32,
      axis: "z",
      exterior: true,
    });
    return {
      floors: [
        { level: 0, rooms, doors, windows, widthIn: x, depthIn: maxDepth + 42 },
      ],
      ceilingHeightIn: 96,
      generatedFrom: { custom: true },
      estimated: true,
      limited: false,
    };
  }
  const sqft = clamp(input.sqft, 250, 8000, 1500),
    beds = Math.round(clamp(input.beds, 0, 10, 3)),
    baths = Math.ceil(clamp(input.baths, 1, 8, 2)),
    stories = Math.round(clamp(input.stories, 1, 3, 1));
  const ratio = 1.2 + hash(input.seed) * 0.4,
    width = Math.sqrt((sqft / stories) * 144 * ratio),
    depth = ((sqft / stories) * 144) / width;
  const floors = [];
  for (let level = 0; level < stories; level++) {
    const types = [];
    if (level === 0) {
      types.push([
        beds === 0 ? "Studio / kitchen" : "Living room",
        "living",
        3,
      ]);
      if (beds) types.push(["Kitchen", "kitchen", 2]);
    }
    if (level === 0 && sqft / stories > 1100 && beds)
      types.push(["Dining room", "dining", 1.5]);
    if ((stories === 1 || level === 1) && beds)
      for (let i = 0; i < beds; i++)
        types.push([i ? `Bedroom ${i + 1}` : "Primary bedroom", "bedroom", 2]);
    for (
      let i = 0;
      i < Math.floor(baths / stories) + (level < baths % stories ? 1 : 0);
      i++
    )
      types.push([`Bathroom ${i + 1}`, "bathroom", 1]);
    while (types.length < 2)
      types.push([`Flex room ${types.length + 1}`, "living", 3]);
    const corridor = Math.min(42, depth * 0.16),
      band = (depth - corridor) / 2;
    const rooms = [],
      doors = [],
      windows = [];
    const hall = {
      id: `${level}-hall`,
      name: stories > 1 ? "Hallway / stairs" : "Hallway",
      type: "hallway",
      x: 0,
      z: band,
      widthIn: width,
      depthIn: corridor,
    };
    rooms.push(hall);
    const bands = [
      types.filter((_, i) => i % 2 === 0),
      types.filter((_, i) => i % 2 === 1),
    ];
    bands.forEach((items, side) => {
      let x = 0;
      const total = items.reduce((s, t) => s + t[2], 0);
      items.forEach(([name, type, weight], i) => {
        const id = `${level}-${side}-${i}`,
          w = (width * weight) / total,
          z = side ? band + corridor : 0;
        const room = { id, name, type, x, z, widthIn: w, depthIn: band };
        rooms.push(room);
        doors.push({
          id: "door-" + id,
          roomIds: [id, hall.id],
          x: x + w / 2,
          z: side ? z : band,
          widthIn: Math.min(32, w * 0.6),
          axis: "x",
        });
        windows.push({
          id: "window-" + id,
          roomId: id,
          x: x + w / 2,
          z: side ? depth : 0,
          widthIn: Math.min(48, w * 0.6),
          axis: "x",
        });
        x += w;
      });
    });
    doors.push({
      id: `front-${level}`,
      roomIds: [hall.id],
      x: 0,
      z: band + corridor / 2,
      widthIn: Math.min(32, corridor * 0.8),
      axis: "z",
      exterior: true,
    });
    // Fixed dimensions are packed into separate exterior-facing rooms connected
    // by an extended corridor. This deliberately changes estimated total area.
    const listingOverrides = {};
    if (Array.isArray(input.roomDimensions))
      for (const dim of input.roomDimensions) {
        const r = rooms.find(
          (r) => r.name.toLowerCase() === String(dim.name).toLowerCase(),
        );
        if (r && Number.isFinite(dim.widthIn) && Number.isFinite(dim.depthIn))
          listingOverrides[r.id] = {
            widthIn: dim.widthIn,
            depthIn: dim.depthIn,
          };
      }
    const fixed = { ...listingOverrides, ...overrides };
    if (Object.keys(fixed).some((id) => rooms.some((r) => r.id === id))) {
      let x = 0,
        maxDepth = 0;
      for (const r of rooms.filter((r) => r.type !== "hallway")) {
        const o = fixed[r.id];
        r.widthIn = clamp(o?.widthIn, 36, 1200, r.widthIn);
        r.depthIn = clamp(o?.depthIn, 36, 1200, r.depthIn);
        r.x = x;
        r.z = 0;
        x += r.widthIn;
        maxDepth = Math.max(maxDepth, r.depthIn);
        r.dimensionSource = overrides[r.id]
          ? "user"
          : listingOverrides[r.id]
            ? "listing"
            : "estimated";
      }
      // Align rooms against the corridor; irregular outside edge is intentional.
      for (const r of rooms.filter((r) => r.type !== "hallway"))
        r.z = maxDepth - r.depthIn;
      Object.assign(hall, { x: 0, z: maxDepth, widthIn: x, depthIn: 42 });
      doors.length = 0;
      windows.length = 0;
      for (const r of rooms.filter((r) => r.type !== "hallway")) {
        doors.push({
          id: "door-" + r.id,
          roomIds: [r.id, hall.id],
          x: r.x + r.widthIn / 2,
          z: maxDepth,
          widthIn: 32,
          axis: "x",
        });
        windows.push({
          id: "window-" + r.id,
          roomId: r.id,
          x: r.x + r.widthIn / 2,
          z: r.z,
          widthIn: 32,
          axis: "x",
        });
      }
      doors.push({
        id: `front-${level}`,
        roomIds: [hall.id],
        x: 0,
        z: maxDepth + 21,
        widthIn: 32,
        axis: "z",
        exterior: true,
      });
    }
    rooms.forEach((r) => {
      const min =
        r.type === "bedroom"
          ? [108, 108]
          : r.type === "bathroom"
            ? [60, 96]
            : r.type === "living"
              ? [144, 144]
              : [36, 36];
      r.tight = r.widthIn < min[0] || r.depthIn < min[1];
    });
    floors.push({
      level,
      rooms,
      doors,
      windows,
      widthIn: Math.max(...rooms.map((r) => r.x + r.widthIn)),
      depthIn: Math.max(...rooms.map((r) => r.z + r.depthIn)),
    });
  }
  return {
    floors,
    ceilingHeightIn: 96,
    generatedFrom: { sqft, beds, baths, stories, seed: input.seed },
    estimated: true,
    limited: ["sqft", "beds", "baths", "stories"].some((k) => input[k] == null),
  };
}
