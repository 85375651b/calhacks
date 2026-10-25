import {saleStatus,isDisplayable} from './status.js';
import { createHash } from "node:crypto";
import { siteUrl } from "./criteria.js";
export const number = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
export const text = (v) =>
  typeof v === "string" ? v.trim().slice(0, 500) || null : null;
export function photo(v) {
  try {
    const u = new URL(v);
    return u.protocol === "https:" &&
      !u.username &&
      !u.password &&
      ["zillowstatic.com", "cdn-redfin.com"].some(
        (h) => u.hostname === h || u.hostname.endsWith("." + h),
      )
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export function homeType(v) {
  return (
    {
      singlefamily: "house",
      house: "house",
      townhouse: "townhome",
      townhome: "townhome",
      condo: "condo",
      coop: "condo",
      multifamily: "multi-family",
      apartment: "apartment",
      manufactured: "manufactured",
      mobile: "manufactured",
      land: "land",
      lot: "land",
    }[
      String(v || "")
        .toLowerCase()
        .replace(/[^a-z]/g, "")
    ] || null
  );
}
export function identity(p) {
  let a = String(p.address || "")
    .split(",")
    .filter(
      (part, index) =>
        index === 0 || /^\s*(apt\b|apartment\b|unit\b|suite\b|#)/i.test(part),
    )
    .join(" ")
    .toLowerCase()
    .replace(/\b(apartment|apt|unit|suite)\b|#/g, " unit ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(
      /\b(street|avenue|road|drive|boulevard|lane|court|circle|place|trail)\b/g,
      (s) =>
        ({
          street: "st",
          avenue: "ave",
          road: "rd",
          drive: "dr",
          boulevard: "blvd",
          lane: "ln",
          court: "ct",
          circle: "cir",
          place: "pl",
          trail: "trl",
        })[s],
    )
    .replace(/\s+/g, " ")
    .trim();
  return a + "|" + (p.zip || [p.city, p.state].join("|").toLowerCase());
}
export function normalize(item, source, forSaleQuery = false) {
  const z = source === "Zillow";
  const address =
    text(item.address?.streetAddress) ||
    text(item.address) ||
    text(item.streetLine) ||
    (text(item.addressLine1) ? [item.addressLine1,item.addressLine2].filter(Boolean).join(' ') : text(item.formattedAddress));
  const p = {
    address,
    city: text(item.city) || text(item.address?.city),
    state: text(item.state) || text(item.address?.state),
    zip: text(
      item.zip || item.zipCode || item.zipcode || item.address?.zipcode,
    ),
    price: number(item.price),
    beds: number(item.bedrooms ?? item.beds),
    baths: number(item.bathrooms ?? item.baths),
    sqft: number(item.livingArea ?? item.sqFt ?? item.squareFootage),
    lotSizeSqft: number(item.lotSizeSqFt ?? item.lotSize ?? item.lotSizeSqft),
    yearBuilt: number(item.yearBuilt),
    homeType: homeType(item.homeType || item.propertyType),
    stories: number(item.stories),
    hoaMonthly: number(
      item.hoaFee ?? item.hoa?.fee ?? item.hoa ?? item.monthlyHoaFee,
    ),
    daysOnMarket: number(item.daysOnMarket ?? item.daysOnZillow),
    status: saleStatus(item.listingStatus || item.mlsStatus || item.status || item.homeStatus, source, item, forSaleQuery),
    checkedAt: new Date().toISOString(),
    garageSpaces: number(item.garageSpaces),
    photoUrl:
      source === "RentCast"
        ? null
        : photo(item.mainImage || item.coverPhotoUrl || item.photos?.[0]),
    lat:
      typeof (item.latitude ?? item.lat) === "number" && Math.abs(item.latitude ?? item.lat) <= 90
        ? (item.latitude ?? item.lat)
        : null,
    lng:
      typeof (item.longitude ?? item.lng) === "number" && Math.abs(item.longitude ?? item.lng) <= 180
        ? (item.longitude ?? item.lng)
        : null,
    zillowUrl: z ? siteUrl(item.propertyUrl || item.url, "zillow") : null,
    redfinUrl: source === "Redfin" ? siteUrl(item.url, "redfin") : null,
    sources: [source],
  };
  p.id = createHash("sha256").update(identity(p)).digest("hex").slice(0, 24);
  return p;
}
export function mergeListings(rows) {
  const map = new Map();
  for (const p of rows) {
    if (!p.address) continue;
    const key = identity(p);
    if (!map.has(key)) {
      map.set(key, { ...p, id:createHash("sha256").update(key).digest("hex").slice(0,24) });
      continue;
    }
    const old = map.get(key);
    for (const [k, v] of Object.entries(p))
      if (old[k] == null && v != null) old[k] = v;
    if(!isDisplayable(p))old.status=p.status;
    old.sources = [...new Set([...old.sources, ...p.sources])];
  }
  return [...map.values()];
}
export const POST_FILTERS = [
  "maxBeds",
  "maxBaths",
  "minPrice",
  "maxPrice",
  "minBeds",
  "exactBeds",
  "minBaths",
  "minSqft",
  "maxSqft",
  "minLotSize",
  "maxLotSize",
  "minYearBuilt",
  "maxYearBuilt",
  "maxHoa",
  "noHoa",
  "daysOnMarket",
  "homeTypes",
  "stories",
];
export function postFilter(p, c) {
  for (const [key, field, dir] of [
    ["minPrice", "price", 1],
    ["maxPrice", "price", -1],
    ["minBeds", "beds", 1],
    ["maxBeds", "beds", -1],
    ["minBaths", "baths", 1],
    ["maxBaths", "baths", -1],
    ["minSqft", "sqft", 1],
    ["maxSqft", "sqft", -1],
    ["minLotSize", "lotSizeSqft", 1],
    ["maxLotSize", "lotSizeSqft", -1],
    ["minYearBuilt", "yearBuilt", 1],
    ["maxYearBuilt", "yearBuilt", -1],
    ["maxHoa", "hoaMonthly", -1],
    ["daysOnMarket", "daysOnMarket", -1],
  ])
    if (c[key] != null && p[field] != null && dir * (p[field] - c[key]) < 0)
      return false;
  if (
    c.exactBeds &&
    c.minBeds != null &&
    p.beds != null &&
    p.beds !== c.minBeds
  )
    return false;
  if (c.noHoa && p.hoaMonthly != null && p.hoaMonthly > 0) return false;
  if (c.homeTypes?.length && p.homeType && !c.homeTypes.includes(p.homeType))
    return false;
  if (c.stories === "single" && p.stories != null && p.stories !== 1)
    return false;
  if (c.stories === "multi" && p.stories != null && p.stories < 2) return false;
  return true;
}
export function unapplied(c, native) {
  return Object.keys(c).filter(
    (k) =>
      !["location", "limit", "sources", "searchUrl"].includes(k) &&
      !(Array.isArray(c[k]) && !c[k].length) &&
      !native.includes(k) &&
      !POST_FILTERS.includes(k),
  );
}
