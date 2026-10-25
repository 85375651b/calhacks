export const ACTOR_ID = () =>
  process.env.FLOORPLAN_ACTOR_ID || "t26CMdjfnjh3OcJYT";
export const bounded = (v, fallback, min, max) =>
  Number.isFinite(Number(v)) && v !== ""
    ? Math.max(min, Math.min(max, Math.floor(Number(v))))
    : fallback;
export const timeoutSecs = () =>
  bounded(process.env.FLOORPLAN_RUN_TIMEOUT_SECS, 150, 30, 300);
export const text = (v, max = 200) =>
  typeof v === "string" ? v.trim().slice(0, max) || null : null;
export const number = (v) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
export function httpsUrl(v) {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && !u.username && !u.password && !u.port
      ? u.href.slice(0, 2000)
      : null;
  } catch {
    return null;
  }
}
export function normalizeAddress(v) {
  const address = text(v, 501);
  if (
    !address ||
    address.length > 500 ||
    !/\d/.test(address) ||
    address.split(",").length < 3
  )
    throw new Error("Enter a full street address, city and state.");
  return address.replace(/\s+/g, " ");
}
export const addressKey = (v) =>
  normalizeAddress(v)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export const safeKey = (v) =>
  typeof v === "string" &&
  /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/.test(v) &&
  !v.includes("..");
export function actorInput(address, urls = []) {
  address = normalizeAddress(address);
  const listingUrls = (Array.isArray(urls) ? urls : [])
    .slice(0, 8)
    .map((v) => httpsUrl(typeof v === "string" ? v : v?.url))
    .filter((v) => {
      if (!v) return false;
      const host = new URL(v).hostname;
      return [
        "zillow.com",
        "redfin.com",
        "realtor.com",
        "compass.com",
        "homes.com",
      ].some((h) => host === h || host.endsWith("." + h));
    })
    .map((url) => ({ url, address }));
  return {
    addresses: [address],
    listingUrls,
    enabledSources: ["zillow", "redfin", "realtor", "compass", "webSearch"],
    maxFloorPlansPerAddress: 4,
    minConfidence: 0.5,
    includeLowConfidence: false,
    outputImageFormat: "png",
    combineIntoPdf: false,
    includeListingFacts: true,
    runOcr: true,
    ocrMaxImages: 4,
    useVisionCheck: false,
    proxyConfiguration: { useApifyProxy: true },
    maxConcurrency: 2,
    perAddressTimeoutSecs: timeoutSecs() - 10,
    requestTimeoutSecs: 30,
  };
}
export function labels(v) {
  return Array.isArray(v)
    ? v.slice(0, 60).flatMap((l) => {
        if (!text(l?.text) || !["dimension", "room_name"].includes(l.kind))
          return [];
        const b = l.bbox;
        return [
          {
            text: text(l.text),
            kind: l.kind,
            bbox:
              b &&
              ["x", "y", "width", "height"].every(
                (k) => number(b[k]) != null && b[k] <= 100000,
              )
                ? Object.fromEntries(
                    ["x", "y", "width", "height"].map((k) => [k, b[k]]),
                  )
                : null,
            feet: number(l.feet ?? l.parsedFeet),
          },
        ];
      })
    : [];
}
export function adaptResult(row, storeId, address) {
  const statuses = [
    "found",
    "listing_found_no_floor_plan",
    "no_listing_found",
    "blocked",
    "invalid_address",
    "error",
  ];
  const status = statuses.includes(row?.status) ? row.status : "error";
  const plans = (Array.isArray(row?.floorPlans) ? row.floorPlans : [])
    .slice(0, 4)
    .filter((p) => p && typeof p === "object")
    .map((p) => ({
      kvStoreId: text(p.kvStoreId) || storeId || null,
      kvKey: text(p.kvKey ?? p.key),
      type:
        p.type === "pdf" || p.contentType === "application/pdf"
          ? "pdf"
          : "image",
      contentType: text(p.contentType),
      bytes: number(p.bytes),
      width: number(p.width),
      height: number(p.height),
      pages: number(p.pages),
      floorLabel: text(p.floorLabel, 80),
      confidence:
        number(p.confidence) == null ? null : Math.min(1, p.confidence),
      sourceName: text(p.sourceName ?? p.source, 80),
      sourcePageUrl: httpsUrl(p.sourcePageUrl ?? p.sourceUrl),
      detectedLabels: labels(p.detectedLabels),
    }));
  const facts = row?.listingFacts ?? row?.facts;
  return {
    address: text(row?.normalizedAddress ?? row?.inputAddress) || address,
    status,
    reason: text(row?.reason, 300),
    plans,
    listingFacts:
      facts && typeof facts === "object"
        ? {
            ...Object.fromEntries(
              [
                "beds",
                "baths",
                "sqft",
                "yearBuilt",
                "stories",
                "ceilingHeightFt",
              ].map((k) => [k, number(facts[k])]),
            ),
            ceilingNote: text(facts.ceilingNote),
          }
        : null,
    attempts: Array.isArray(row?.attempts)
      ? row.attempts
          .slice(0, 30)
          .filter((a) => a && typeof a === "object")
          .map((a) => ({
            source: text(a.source, 80),
            step: text(a.step, 80),
            ok: typeof a.ok === "boolean" ? a.ok : null,
          }))
      : [],
  };
}
