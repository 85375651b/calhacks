import { catalog } from "./catalog.js";
export function demoPlacements(house) {
  const rooms = house.floors[0].rooms;
  return [
    [1, "living", 0.28, 0.28],
    [4, "living", 0.6, 0.55],
    [12, "bedroom", 0.5, 0.4],
    [9, "bedroom", 0.85, 0.25],
    [14, "kitchen", 0.3, 0.3],
    [16, "dining", 0.5, 0.4],
    [24, "living", 0.85, 0.2],
  ].map(([index, type, x, z], i) => {
    const r =
        rooms.find((r) => r.type === type) ||
        rooms.find((r) => r.type === "living"),
      def = catalog[index];
    return {
      ...def,
      id: "demo-item-" + i,
      furnitureId: def.id,
      level: 0,
      xIn: r.x + r.widthIn * x,
      zIn: r.z + r.depthIn * z,
      rotationDeg: 0,
    };
  });
}
