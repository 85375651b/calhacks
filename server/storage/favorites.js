import { atomicJson } from "./atomic.js";
import { siteUrl, HOME_TYPES } from "../search/criteria.js";
import { photo } from "../search/listing.js";
import { addressKey, exactAddress } from "../../src/lib/search/address.js";
export const MAX_FAVORITES = 5;
export function clientId(value) {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  )
    throw new Error("A valid anonymous client ID is required.");
  return value.toLowerCase();
}
const snapStrings = new Set([
  "source",
  "sampleNotice",
  "area",
  "overall",
  "nationalGrade",
  "actorBuild",
  "stateGrade",
  "latestYear",
  "violent",
  "property",
  "note",
  "label",
  "rating",
  "hazard",
  "resolution",
  "tract",
  "version",
  "vulnerability",
  "resilience",
  "insuranceNote",
  "name",
  "level",
  "grades",
  "date",
  "timezone",
  "range",
  "trafficLevel",
  "brand",
  "address",
]);
const snapNumbers = new Set([
  "rate",
  "national",
  "state",
  "score",
  "safetyScore",
  "violentPer100k",
  "population",
  "expectedAnnualLoss",
  "average",
  "yearBuilt",
  "distance",
  "minutes",
  "miles",
  "offPeak",
  "extraMinutes",
  "lat",
  "lng",
  "insuranceEstimate",
]);
function snapshot(value, depth = 0) {
  if (depth > 5 || !value || typeof value !== "object" || Array.isArray(value))
    return {};
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    if (snapStrings.has(k) && (typeof v === "string" || v === null))
      out[k] = v?.slice(0, 1000) ?? null;
    else if (
      snapNumbers.has(k) &&
      ((typeof v === "number" && Number.isFinite(v)) || v === null)
    )
      out[k] = v;
    else if (k === "rating" && typeof v === "number" && v >= 0 && v <= 10)
      out[k] = v;
    else if (k === "usingFixtures" && typeof v === "boolean") out[k] = v;
    else if (
      ["rates", "hazards", "schools", "stores"].includes(k) &&
      Array.isArray(v)
    )
      out[k] = v.slice(0, 20).map((x) => snapshot(x, depth + 1));
    else if (k === "photos" && Array.isArray(v))
      out[k] = v.map(photo).filter(Boolean).slice(0, 4);
    else if (["morning", "evening"].includes(k))
      out[k] = snapshot(v, depth + 1);
  }
  return out;
}
export function sanitizeListing(p) {
  if (
    !p ||
    typeof p !== "object" ||
    !/^[a-f0-9]{24}$/.test(p.id) ||
    typeof p.address !== "string" ||
    !p.address.trim()
  )
    throw new Error("Invalid favorite listing.");
  const out = { id: p.id };
  for (const k of ["address", "city", "state", "zip", "status"])
    out[k] = typeof p[k] === "string" ? p[k].slice(0, 300) : null;
  for (const k of [
    "price",
    "beds",
    "baths",
    "sqft",
    "lotSizeSqft",
    "yearBuilt",
    "stories",
    "hoaMonthly",
    "daysOnMarket",
    "garageSpaces",
  ])
    out[k] =
      typeof p[k] === "number" && Number.isFinite(p[k]) && p[k] >= 0
        ? p[k]
        : null;
  out.lat = typeof p.lat === "number" && Math.abs(p.lat) <= 90 ? p.lat : null;
  out.lng = typeof p.lng === "number" && Math.abs(p.lng) <= 180 ? p.lng : null;
  out.homeType = HOME_TYPES.includes(p.homeType) ? p.homeType : null;
  out.zillowUrl = siteUrl(p.zillowUrl, "zillow");
  out.redfinUrl = siteUrl(p.redfinUrl, "redfin");
  out.photoUrl = photo(p.photoUrl);
  out.sources = Array.isArray(p.sources)
    ? [
        ...new Set(
          p.sources.filter((s) => ["Zillow", "Redfin", "RentCast"].includes(s)),
        ),
      ]
    : [];
  out.snapshots = {};
  for (const k of ["crime", "hazards", "schools", "commute", "groceries"])
    if (p.snapshots?.[k]?.source && typeof p.snapshots[k].source === "string")
      if (k !== "crime" || typeof p.snapshots[k].safetyScore === "number")
        out.snapshots[k] = snapshot(p.snapshots[k]);
  return out;
}
export function createFavorites(file) {
  const store = atomicJson(file);
  const mutate = store.mutate;
  return {
    async list(id) {
      id = clientId(id);
      return (await store.read())[id] || [];
    },
    add(id, listing) {
      id = clientId(id);
      const p = sanitizeListing(listing);
      return mutate((data) => {
        const rows = data[id] || [];
        const index = rows.findIndex((r) => r.id === p.id || (addressKey(r) === addressKey(p) && exactAddress(r, p)));
        if (index < 0 && rows.length >= MAX_FAVORITES)
          throw new Error(
            "You can save up to 5 homes. Remove one to add another.",
          );
        if (index < 0) rows.push(p);
        else rows[index] = p;
        data[id] = rows;
        return rows;
      });
    },
    remove(id, listingId) {
      id = clientId(id);
      return mutate((data) => {
        data[id] = (data[id] || []).filter((p) => p.id !== listingId);
        return data[id];
      });
    },
  };
}
