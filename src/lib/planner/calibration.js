import { validHouseOrNull } from "./validateHouseModel.js";
export function parseLength(value, unit = "ft") {
  const s = String(value)
    .trim()
    .toLowerCase()
    .replace(/[′’]/g, "'")
    .replace(/[″“”]/g, '"');
  const feet = s.match(
    /^(\d+(?:\.\d+)?)\s*(?:'|ft|feet)\s*(?:(\d+(?:\.\d+)?)\s*(?:"|in|inches)?)?$/,
  );
  if (feet) return Number(feet[1]) * 12 + Number(feet[2] || 0);
  const metric = s.match(/^(\d+(?:\.\d+)?)\s*m\s*(\d+(?:\.\d+)?)\s*cm$/);
  if (metric) return (Number(metric[1]) * 100 + Number(metric[2])) / 2.54;
  const n = s.match(/^(\d+(?:\.\d+)?)\s*(ft|in|"|m|cm)?$/);
  if (!n) throw Error("Enter a length such as 14, 14.5, 14'6\", or 4.3 m.");
  return (
    Number(n[1]) *
    ({ ft: 12, in: 1, '"': 1, m: 100 / 2.54, cm: 1 / 2.54 }[n[2] || unit] || 12)
  );
}
export function calibrate(p1, p2, realLengthIn, widthPx, heightPx) {
  if (
    ![widthPx, heightPx].every((v) => Number.isFinite(v) && v > 0 && v <= 4096)
  )
    throw Error("Plan dimensions unavailable.");
  for (const p of [p1, p2])
    if (
      !p ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y) ||
      p.x < 0 ||
      p.y < 0 ||
      p.x > widthPx ||
      p.y > heightPx
    )
      throw Error("Choose two points within the plan.");
  const distance = Math.hypot(p2.x - p1.x, p2.y - p1.y);
  if (distance < widthPx * 0.03)
    throw Error("Choose points at least 3% of the plan width apart.");
  if (
    !Number.isFinite(realLengthIn) ||
    realLengthIn < 12 ||
    realLengthIn > 2400
  )
    throw Error("Measured length must be between 1 and 200 ft.");
  return {
    p1: { ...p1 },
    p2: { ...p2 },
    realLengthIn,
    pixelsPerInch: distance / realLengthIn,
  };
}
export const rotation = (v) =>
  (((Math.round((Number(v) || 0) / 90) * 90) % 360) + 360) % 360;
export function planSize(asset, plan) {
  const swapped = rotation(plan.rotationDeg) % 180 !== 0,
    scale = plan.calibration?.pixelsPerInch;
  return {
    widthIn: (swapped ? asset.heightPx : asset.widthPx) / scale,
    depthIn: (swapped ? asset.widthPx : asset.heightPx) / scale,
  };
}
// Convert positions to original pixels, then into the new rotated inch space.
// The image rotates clockwise about its top-left bounding box; furniture sizes never change.
function rotatePoint(x, y, w, h, deg) {
  return deg === 90
    ? { x: h - y, y: x }
    : deg === 180
      ? { x: w - x, y: h - y }
      : deg === 270
        ? { x: y, y: w - x }
        : { x, y };
}
export function transformPlacements(items, asset, oldPlan, newPlan) {
  if (!oldPlan?.calibration || !newPlan?.calibration) return items;
  const a = oldPlan.calibration.pixelsPerInch,
    b = newPlan.calibration.pixelsPerInch,
    oldRotation = rotation(oldPlan.rotationDeg),
    nextRotation = rotation(newPlan.rotationDeg);
  const w = asset.widthPx,
    h = asset.heightPx;
  return items.map((p) => {
    if (p.level !== oldPlan.levelIndex) return p;
    const original = rotatePoint(
      p.xIn * a,
      p.zIn * a,
      oldRotation % 180 ? h : w,
      oldRotation % 180 ? w : h,
      rotation(-oldRotation),
    );
    const next = rotatePoint(original.x, original.y, w, h, nextRotation);
    return {
      ...p,
      xIn: next.x / b,
      zIn: next.y / b,
      level: newPlan.levelIndex,
      rotationDeg:
        ((p.rotationDeg || 0) + nextRotation - oldRotation + 360) % 360,
    };
  });
}
const num = (v, min, max, fallback) =>
  typeof v === "number" && Number.isFinite(v)
    ? Math.max(min, Math.min(max, v))
    : fallback;
export function validateFloorPlan(value) {
  const v = value && typeof value === "object" ? value : {};
  const plans = [];
  for (const p of (Array.isArray(v.plans) ? v.plans : []).slice(0, 16)) {
    if (
      !p ||
      !/^[a-f0-9]{32}$/.test(p.assetId) ||
      plans.some((a) => a.assetId === p.assetId)
    )
      continue;
    let calibration = null;
    if (p.calibration) {
      const c = p.calibration;
      if (
        c.p1 &&
        c.p2 &&
        [c.p1.x, c.p1.y, c.p2.x, c.p2.y].every(
          (n) =>
            typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 4096,
        ) &&
        Number.isFinite(c.realLengthIn) &&
        c.realLengthIn >= 12 &&
        c.realLengthIn <= 2400
      ) {
        const distance = Math.hypot(c.p2.x - c.p1.x, c.p2.y - c.p1.y);
        if (distance >= 1)
          calibration = {
            p1: { x: c.p1.x, y: c.p1.y },
            p2: { x: c.p2.x, y: c.p2.y },
            realLengthIn: c.realLengthIn,
            pixelsPerInch: distance / c.realLengthIn,
          };
      }
    }
    plans.push({
      assetId: p.assetId,
      levelIndex: Math.round(num(p.levelIndex, 0, 3, 0)),
      rotationDeg: rotation(p.rotationDeg),
      calibration,
      calibratedAt:
        calibration &&
        typeof p.calibratedAt === "string" &&
        Number.isFinite(Date.parse(p.calibratedAt))
          ? new Date(p.calibratedAt).toISOString()
          : null,
    });
  }
  const convertedHouseModel = validHouseOrNull(v.convertedHouseModel);
  return {
    ...(convertedHouseModel?.source === "floorplan"
      ? {
          convertedHouseModel,
          houseModelSource:
            typeof v.houseModelSource === "string"
              ? v.houseModelSource.slice(0, 100)
              : "floorplan",
        }
      : {}),
    mode:
      v.mode === "plan" && plans.some((p) => p.calibration)
        ? "plan"
        : "estimated",
    ceilingHeightIn: num(v.ceilingHeightIn, 72, 240, 96),
    ceilingSource: ["listing", "user"].includes(v.ceilingSource)
      ? v.ceilingSource
      : "default",
    plans,
  };
}
