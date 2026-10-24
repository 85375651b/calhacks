import { LookupError } from "../errors.js";

// Input schema and README: https://api.apify.com/v2/acts/crawloop~zillow-search-scraper/builds/default
export const APIFY_ACTOR_ID = "crawloop~zillow-search-scraper";
export function apifyInput(address, listingUrl) {
  // The actor's location field is city/ZIP-only. Use its supported search-URL input for a full address.
  const slug = address
    .trim()
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");
  return {
    startUrls: [
      { url: listingUrl || `https://www.zillow.com/homes/${slug}_rb/` },
    ],
    fetchDetails: true,
    maxItems: 1,
    monitorMode: false,
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ["RESIDENTIAL"],
      apifyProxyCountry: "US",
    },
  };
}

export async function resolveZillowUrl(address, fetchImpl = fetch) {
  const slug = address
    .trim()
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");
  // Resolve only the public redirect. All listing content still comes from the Apify actor.
  const response = await fetchImpl(`https://www.zillow.com/homes/${slug}_rb/`, {
    method: "HEAD",
    signal: AbortSignal.timeout(5000),
  });
  const url = new URL(response.url);
  if (
    !response.ok ||
    !["www.zillow.com", "zillow.com"].includes(url.hostname) ||
    !/^\/homedetails\/[^/]+\/\d+_zpid\/$/.test(url.pathname)
  ) {
    throw new LookupError(
      404,
      "APIFY_NOT_FOUND",
      "Zillow data unavailable right now",
    );
  }
  return `${url.origin}${url.pathname}`;
}

export function createApifyClient({
  token,
  fetchImpl = fetch,
  beforeRun = async () => {},
  resolveUrl = (address) => resolveZillowUrl(address, fetchImpl),
}) {
  return async (address) => {
    if (!token || token === "your_token_here")
      throw new LookupError(
        503,
        "APIFY_UNAVAILABLE",
        "Zillow data unavailable right now",
      );
    const url = new URL(
      `https://api.apify.com/v2/acts/${APIFY_ACTOR_ID}/run-sync-get-dataset-items`,
    );
    // Body maxItems caps actual rows; API maxItems alone only caps pay-per-result billing.
    url.search = new URLSearchParams({
      maxItems: "1",
      timeout: "55",
      maxTotalChargeUsd: "0.10",
      restartOnError: "false",
      clean: "true",
      limit: "1",
    }).toString();
    let response;
    try {
      const listingUrl = await resolveUrl(address);
      await beforeRun();
      response = await fetchImpl(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(apifyInput(address, listingUrl)),
        signal: AbortSignal.timeout(60000),
      });
      if (!response.ok)
        throw new LookupError(
          response.status === 408 ? 504 : 502,
          "APIFY_UNAVAILABLE",
          "Zillow data unavailable right now",
        );
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("Unexpected dataset");
      if (
        data.length &&
        !data.some((row) => {
          try {
            return new URL(row.url).pathname === new URL(listingUrl).pathname;
          } catch {
            return false;
          }
        })
      )
        throw new LookupError(
          404,
          "APIFY_NOT_FOUND",
          "Zillow data unavailable right now",
        );
      return data;
    } catch (error) {
      if (error instanceof LookupError) throw error;
      throw new LookupError(
        error.name === "TimeoutError" ? 504 : 502,
        "APIFY_UNAVAILABLE",
        "Zillow data unavailable right now",
      );
    }
  };
}
