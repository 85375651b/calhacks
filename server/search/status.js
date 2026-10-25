export const DISPLAYABLE_STATUSES = ["for_sale"];
export const SHOW_HIDDEN_COUNT = true;
// Observed fixtures: Zillow forSale/other, Redfin Active/Coming Soon,
// RentCast Active/Inactive. Other explicit labels are conservative policy aliases.
const key = (v) =>
  typeof v === "string" ? v.toLowerCase().replace(/[^a-z]/g, "") : "";
export const STATUS_MAPS = {
  Zillow: {
    forsale: "for_sale",
    forsalebyagent: "for_sale",
    forsalebyowner: "for_sale",
    forsaleresale: "for_sale",
    forsalenewconstruction: "for_sale",
    other: "unknown",
  },
  Redfin: { active: "for_sale", comingsoon: "coming_soon" },
  RentCast: { active: "for_sale", inactive: "off_market" },
};
const aliases = {
  forsale: "for_sale",
  active: "for_sale",
  forsalebyagent: "for_sale",
  forsalebyowner: "for_sale",
  pending: "pending",
  undercontract: "pending",
  contingent: "pending",
  activeundercontract: "pending",
  comingsoon: "coming_soon",
  sold: "sold",
  recentlysold: "sold",
  offmarket: "off_market",
  withdrawn: "off_market",
  expired: "off_market",
  inactive: "off_market",
  forrent: "for_rent",
  rental: "for_rent",
  rented: "for_rent",
};
export function normalizeListingStatus(rawStatus, source, extra = {}) {
  const signals = [
    rawStatus,
    extra.listingStatus,
    extra.mlsStatus,
    extra.status,
    extra.homeStatus,
    extra.listingType,
    extra.listingSubType,
  ];
  const statuses = signals.map(
    (v) =>
      STATUS_MAPS[source]?.[key(v)] ||
      aliases[key(v)] ||
      (/pending|undercontract|contingent/.test(key(v)) ? "pending" : null),
  );
  if (
    extra.isForRent === true ||
    extra.isRental === true ||
    extra.rentalPrice != null ||
    extra.rentPrice != null ||
    statuses.includes("for_rent")
  )
    return "for_rent";
  if (
    extra.isPending === true ||
    extra.isUnderContract === true ||
    statuses.includes("pending")
  )
    return "pending";
  if (extra.soldDate || extra.dateSold || statuses.includes("sold"))
    return "sold";
  if (
    extra.removedDate ||
    statuses.includes("off_market") ||
    /off[ -]?market/i.test(extra.statusText || "")
  )
    return "off_market";
  if (extra.isComingSoon === true || statuses.includes("coming_soon"))
    return "coming_soon";
  if (statuses.includes("for_sale")) return "for_sale";
  return "unknown";
}
export function saleStatus(raw, source, extra = {}, forSaleQuery = false) {
  const status = normalizeListingStatus(raw, source, extra);
  if (status === "unknown" && forSaleQuery && raw && process.env.NODE_ENV === "development")
    console.warn("Unmapped sale listing status:", source, String(raw).slice(0, 60).replace(/[^a-zA-Z _-]/g, ""));
  return status === "unknown" && forSaleQuery ? "for_sale" : status;
}
export const isDisplayable = (p) => DISPLAYABLE_STATUSES.includes(p?.status);
export const visibleListings = (rows) =>
  (Array.isArray(rows) ? rows : []).filter(isDisplayable);
