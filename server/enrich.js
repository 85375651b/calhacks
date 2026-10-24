import { readFile } from "node:fs/promises";
import { normalizeAddress, CACHE_TTL } from "./cache.js";
import { LookupError } from "./errors.js";
import { APIFY_ACTOR_ID } from "./providers/apify.js";

export const ENRICHMENT_FAILURE_TTL = 5 * 60 * 1000;
const cleanText = (value) =>
  typeof value === "string" && value.trim()
    ? value
        .replace(/<[^>]*>/g, "")
        .replace(/\s+/g, " ")
        .trim()
    : null;
const number = (value) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
const date = (value) =>
  typeof value === "string" && Number.isFinite(Date.parse(value))
    ? value
    : null;
function safeUrl(value, image = false) {
  try {
    const url = new URL(value),
      host = url.hostname.toLowerCase();
    const allowed = image
      ? host === "zillowstatic.com" ||
        host.endsWith(".zillowstatic.com") ||
        host === "photos.zillow.com"
      : host === "www.zillow.com" || host === "zillow.com";
    return allowed &&
      url.protocol === "https:" &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function normalizeEnrichment(
  items,
  { usingFixtures = false, fixtureAddress = null } = {},
) {
  const row = Array.isArray(items)
    ? items.find((item) => item?.zpid && item.url)
    : null;
  if (!row)
    throw new LookupError(
      404,
      "APIFY_NOT_FOUND",
      "Zillow data unavailable right now",
    );
  const image = safeUrl(row.image, true);
  const history = (Array.isArray(row.priceHistory) ? row.priceHistory : [])
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      date: date(item.date),
      event: cleanText(item.event),
      price: number(item.price),
    }))
    .sort((a, b) => (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0))
    .slice(0, 5);
  const description = cleanText(row.description);
  return {
    zestimate: number(row.zestimate),
    listingStatus: cleanText(row.status),
    zillowUrl: safeUrl(row.url),
    // The actor documents a primary image only. Never invent gallery URLs from photoCount.
    photos: image ? [image] : [],
    priceHistory: history,
    description:
      description && description.length > 300
        ? `${description.slice(0, 297).trimEnd()}…`
        : description,
    brokerage: cleanText(row.brokerageName) || cleanText(row.brokerName),
    sources: ["Zillow data via Apify"],
    usingFixtures,
    ...(usingFixtures ? { fixtureAddress } : {}),
  };
}

export async function loadApifyFixtures() {
  const items = JSON.parse(
    await readFile(
      new URL("./fixtures/apify-sample.json", import.meta.url),
      "utf8",
    ),
  );
  const metadata = JSON.parse(
    await readFile(
      new URL("./fixtures/apify-metadata.json", import.meta.url),
      "utf8",
    ),
  );
  return { items, metadata };
}

export function createEnrichment({
  request,
  cache,
  enabled = true,
  token,
  useFixtures = false,
  fixtures,
}) {
  const inFlight = new Map();
  return async (rawAddress) => {
    if (
      typeof rawAddress !== "string" ||
      !rawAddress.trim() ||
      rawAddress.length > 300 ||
      /[\x00-\x1f]/.test(rawAddress)
    )
      throw new LookupError(
        400,
        "INVALID_ADDRESS",
        "Enter a full US property address.",
      );
    if (!enabled || (!useFixtures && (!token || token === "your_token_here")))
      throw new LookupError(
        503,
        "APIFY_UNAVAILABLE",
        "Zillow data unavailable right now",
      );
    if (useFixtures)
      return normalizeEnrichment(fixtures.items, {
        usingFixtures: true,
        fixtureAddress: fixtures.metadata.address,
      });
    const address = rawAddress.trim().replace(/\s+/g, " ");
    const key = `${APIFY_ACTOR_ID}:${normalizeAddress(address)}`;
    const cached = await cache.get(key);
    if (cached?.error)
      throw new LookupError(
        cached.error.status,
        cached.error.code,
        "Zillow data unavailable right now",
      );
    if (cached?.data) return cached.data;
    if (inFlight.has(key)) return inFlight.get(key);
    const pending = (async () => {
      try {
        const data = normalizeEnrichment(await request(address));
        await cache.set(key, { address, sampleData: false, data }, CACHE_TTL);
        return data;
      } catch (error) {
        const safe =
          error instanceof LookupError
            ? error
            : new LookupError(
                502,
                "APIFY_UNAVAILABLE",
                "Zillow data unavailable right now",
              );
        await cache.set(
          key,
          {
            address,
            sampleData: false,
            error: { status: safe.status, code: safe.code },
          },
          ENRICHMENT_FAILURE_TTL,
        );
        throw new LookupError(
          safe.status,
          safe.code,
          "Zillow data unavailable right now",
        );
      }
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  };
}
