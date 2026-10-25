import { LookupError } from "./errors.js";
import { trace } from "./search/address-trace.js";

export function createRentCastClient({ apiKey, fetchImpl = fetch }) {
  return async function request(path, address, extra = {}) {
    if (!apiKey || apiKey === "your_key_here") {
      throw new LookupError(
        503,
        "CONFIGURATION",
        "Property lookup is not configured yet. Please try again later.",
      );
    }
    const url = new URL(`https://api.rentcast.io/v1${path}`);
    url.search = new URLSearchParams({ ...(address ? { address } : {}), ...extra }).toString();
    let response;
    try {
      response = await fetchImpl(url, {
        headers: { "X-Api-Key": apiKey, Accept: "application/json" },
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      throw new LookupError(
        502,
        "UPSTREAM_ERROR",
        "The property data service is taking too long. Please try again later.",
      );
    }
    trace("rentcast-http", { status: response.status });
    if (response.status === 404) return null;
    if (response.status === 400)
      throw new LookupError(
        404,
        "NOT_FOUND",
        "We couldn’t find that address. Include the street, city, state, and ZIP code.",
      );
    if (response.status === 429 || response.status === 402) {
      throw new LookupError(
        429,
        "RATE_LIMIT",
        "The property data request limit or quota has been reached. Please try again later.",
      );
    }
    if (response.status === 403)
      throw new LookupError(
        503,
        "ACCESS_LIMIT",
        "The data provider has restricted access. The account’s quota, billing, or API permissions may need attention.",
      );
    if (response.status === 401)
      throw new LookupError(
        503,
        "CONFIGURATION",
        "Property lookup is temporarily unavailable. The server’s API configuration needs attention.",
      );
    if (!response.ok)
      throw new LookupError(
        502,
        "UPSTREAM_ERROR",
        "The property data service is unavailable. Please try again later.",
      );
    try {
      return await response.json();
    } catch {
      throw new LookupError(
        502,
        "UPSTREAM_ERROR",
        "The property data service returned an unreadable response.",
      );
    }
  };
}
