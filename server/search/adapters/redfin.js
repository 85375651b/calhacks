import { normalize as norm } from "../listing.js";
import { siteUrl } from "../criteria.js";
export const supportedFilters = [
  "minPrice",
  "maxPrice",
  "minBeds",
  "minBaths",
  "minSqft",
  "maxSqft",
  "minYearBuilt",
  "maxHoa",
  "newConstruction",
];
export function buildInput(c) {
  const base = { maxListings: c.limit, searchMode: "SALE" };
  if (siteUrl(c.searchUrl, "redfin"))
    return { ...base, locations: [c.searchUrl] };
  const v = {
    ...base,
    locations: [c.location],
    searchMode: "SALE",
  };
  for (const k of [
    "minPrice",
    "maxPrice",
    "minBeds",
    "minBaths",
    "minYearBuilt",
  ])
    if (c[k] != null) v[k] = c[k];
  if (c.minSqft != null) v.minSqFt = c.minSqft;
  if (c.maxSqft != null) v.maxSqFt = c.maxSqft;
  if (c.maxHoa > 0 && !c.noHoa) v.maxHOA = c.maxHoa;
  if (c.daysOnMarket && c.status !== "sold") v.maxDaysOnMarket = c.daysOnMarket;
  if (c.newConstruction) v.isNewConstruction = true;
  if (c.homeTypes?.length && !c.homeTypes.includes("apartment"))
    v.propertyTypes = c.homeTypes.map(
      (x) => ({ townhome: "townhouse", manufactured: "mobile" })[x] || x,
    );
  return v;
}
export const normalize = (i) => norm(i, "Redfin");
