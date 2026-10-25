import { validateFloorPlan } from '../../src/lib/planner/calibration.js';
import { atomicJson } from "./atomic.js";
import { clientId } from "./favorites.js";
import { categories } from "../../src/lib/planner/catalog.js";
import { listingSnapshot } from "../../src/lib/planner/listingSnapshot.js";
const text = (v, n = 160) => (typeof v === "string" ? v.slice(0, n) : "");
export function number(v, min, max, fallback = min) {
  return typeof v === "number" && Number.isFinite(v)
    ? Math.max(min, Math.min(max, v))
    : fallback;
}
export function validId(v) {
  if (
    typeof v !== "string" ||
    !/^[\w-]{1,100}$/.test(v) ||
    ["__proto__", "constructor", "prototype"].includes(v)
  )
    throw new Error("Invalid item ID.");
  return v;
}
const url = (v) => {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password
      ? u.href.slice(0, 2000)
      : null;
  } catch {
    return null;
  }
};
export function furniture(v) {
  if (!v || typeof v !== "object" || !text(v.name).trim())
    throw new Error("Furniture needs a name.");
  return {
    id: validId(v.id),
    name: text(v.name),
    category: categories.includes(v.category) ? v.category : "storage",
    widthIn: number(v.widthIn, 1, 600, 36),
    depthIn: number(v.depthIn, 1, 600, 24),
    heightIn: number(v.heightIn, 0.1, 240, 30),
    color: /^#[\da-f]{6}$/i.test(v.color) ? v.color : "#b48b65",
    imageUrl: url(v.imageUrl),
    sourceUrl: url(v.sourceUrl),
    source: ["catalog", "manual", "json-ld", "openai", "heuristic"].includes(
      v.source,
    )
      ? v.source
      : "manual",
    estimated: v.estimated !== false,
    createdAt:
      typeof v.createdAt === "string" &&
      Number.isFinite(Date.parse(v.createdAt))
        ? new Date(v.createdAt).toISOString()
        : new Date().toISOString(),
  };
}
export function layout(v, homeId) {
  if (
    !v ||
    typeof v !== "object" ||
    !Array.isArray(v.placements) ||
    v.placements.length > 80
  )
    throw new Error("A layout can have up to 80 placements.");
  const roomOverrides = {};
  for (const [id, o] of Object.entries(v.roomOverrides || {}).slice(0, 60)) {
    validId(id);
    roomOverrides[id] = {
      widthIn: number(o?.widthIn, 36, 1200, 144),
      depthIn: number(o?.depthIn, 36, 1200, 144),
    };
  }
  const s = listingSnapshot(v.homeSnapshot);
  for (const k of Object.keys(s)) {
    if (["roomDimensions", "customRooms"].includes(k)) {
      s[k] = Array.isArray(s[k])
        ? s[k].slice(0, 20).map((r) => ({
            name: text(r?.name, 80),
            type: text(r?.type, 20),
            widthIn: number(r?.widthIn, 36, 1200, 144),
            depthIn: number(r?.depthIn, 36, 1200, 144),
          }))
        : null;
      continue;
    }
    if (k === "sources") {
      delete s[k];
      continue;
    }
    if (typeof s[k] === "object") s[k] = null;
    else if (typeof s[k] === "string") s[k] = s[k].slice(0, 2000);
    else if (typeof s[k] === "number" && !Number.isFinite(s[k])) s[k] = null;
  }
  s.id = homeId;
  for (const [key, min, max] of [
    ["sqft", 250, 8000],
    ["beds", 0, 10],
    ["baths", 0, 8],
    ["stories", 1, 3],
    ["price", 0, 1e10],
    ["lat", -90, 90],
    ["lng", -180, 180],
    ["yearBuilt", 1000, 2200],
    ["lotSizeSqft", 0, 1e9],
  ])
    s[key] = s[key] == null ? null : number(s[key], min, max, min);
  s.photoUrl = url(s.photoUrl);
  s.zillowUrl = url(s.zillowUrl);
  s.redfinUrl = url(s.redfinUrl);
  const placements = v.placements.map((p) => ({
    id: validId(p.id),
    furnitureId: validId(p.furnitureId),
    level: Math.round(number(p.level, 0, 3)),
    xIn: number(p.xIn, 0, 30000),
    zIn: number(p.zIn, 0, 30000),
    rotationDeg: number(p.rotationDeg, -36000, 36000) % 360,
    ...(/^#[\da-f]{6}$/i.test(p.colorOverride)
      ? { colorOverride: p.colorOverride }
      : {}),
    ...(p.widthIn != null ? { widthIn: number(p.widthIn, 1, 600) } : {}),
    ...(p.depthIn != null ? { depthIn: number(p.depthIn, 1, 600) } : {}),
    ...(p.heightIn != null ? { heightIn: number(p.heightIn, 0.1, 240) } : {}),
  }));
  if (new Set(placements.map((p) => p.id)).size !== placements.length)
    throw new Error("Placement IDs must be unique.");
  return {
    homeId: validId(homeId),
    homeSnapshot: s,
    roomOverrides,
    placements,
    ...(v.floorPlan ? {floorPlan:validateFloorPlan(v.floorPlan)} : {}),
    updatedAt: new Date().toISOString(),
  };
}
export function createPlannerStore(file, { kind, cap }) {
  const store = atomicJson(file);
  return {
    async list(id) {
      return (await store.read())[clientId(id)] || [];
    },
    put(id, value, key) {
      id = clientId(id);
      const clean =
          kind === "furniture" ? furniture(value) : layout(value, key),
        field = kind === "furniture" ? "id" : "homeId";
      return store.mutate((data) => {
        const rows = data[id] || [],
          index = rows.findIndex((r) => r[field] === clean[field]);
        if (index < 0 && rows.length >= cap)
          throw new Error(
            `You can save up to ${cap} ${kind === "furniture" ? "items" : "layouts"}. Delete an older one first.`,
          );
        if (index < 0) rows.push(clean);
        else rows[index] = clean;
        data[id] = rows;
        return clean;
      });
    },
    remove(id, key) {
      id = clientId(id);
      return store.mutate((data) => {
        data[id] = (data[id] || []).filter(
          (r) => r[kind === "furniture" ? "id" : "homeId"] !== key,
        );
        return data[id];
      });
    },
  };
}
