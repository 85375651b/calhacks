import { normalize as norm } from "../listing.js";
import { siteUrl } from "../criteria.js";
export const supportedFilters = [
  "status",
  "minPrice",
  "maxPrice",
  "minBeds",
  "exactBeds",
  "minBaths",
  "homeTypes",
  "minSqft",
  "maxSqft",
  "minLotSize",
  "maxLotSize",
  "minYearBuilt",
  "maxYearBuilt",
  "maxHoa",
  "noHoa",
  "minParking",
  "garage",
  "newConstruction",
  "priceReduced",
  "openHouse",
  "virtualTour",
  "ac",
  "pool",
  "waterfront",
  "views",
  "keywords",
];
export function buildInput(c) {
  const base = { maxResults: c.limit, includeDetails: false, compact: true };
  if (siteUrl(c.searchUrl, "zillow"))
    return { ...base, searchUrls: [{ url: c.searchUrl }] };
  const v = {
    ...base,
    searchLocation: [c.location],
    listingStatus: c.status === "sold" ? "sold" : "forSale",
  };
  for (const k of [
    "minPrice",
    "maxPrice",
    "minBeds",
    "minBaths",
    "minSqft",
    "maxSqft",
    "minLotSize",
    "maxLotSize",
    "minYearBuilt",
    "maxYearBuilt",
    "keywords",
  ])
    if (c[k] != null) v[k] = c[k];
  if (c.exactBeds && c.minBeds != null) v.maxBeds = c.minBeds;
  if (c.homeTypes?.length)
    v.homeTypes = c.homeTypes.map(
      (x) =>
        ({ townhome: "townhouse", "multi-family": "multiFamily", land: "lot" })[
          x
        ] || x,
    );
  if (c.noHoa || c.maxHoa != null) v.maxHoaFee = c.noHoa ? 0 : c.maxHoa;
  if (c.minParking != null) v.parkingSpots = c.minParking;
  const must = {
    pool: "pool",
    ac: "airConditioning",
    waterfront: "waterfront",
    garage: "garage",
    virtualTour: "has3DTour",
    openHouse: "openHouse",
    priceReduced: "priceReduced",
  };
  v.mustHave = Object.keys(must)
    .filter((k) => c[k])
    .map((k) => must[k]);
  if (c.stories === "single") v.mustHave.push("singleStory");
  if (c.views?.length) v.views = c.views;
  if (["1", "7", "14", "30", "90"].includes(String(c.daysOnMarket)))
    v.daysOnZillow = String(c.daysOnMarket);
  if (c.status === "coming-soon") v.listingTypes = ["comingSoon"];
  else if (c.status === "pending") v.listingTypes = ["pendingUnderContract"];
  else if (c.newConstruction) v.listingTypes = ["newConstruction"];
  return v;
}
export const normalize = (i) => norm(i, "Zillow");
