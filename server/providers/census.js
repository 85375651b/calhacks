import { join } from "node:path";
import { serverDirectory } from "../config.js";
import { persistentMemo } from "../storage/memo.js";
import {
  addressLabel,
  normalizeAddress,
  splitAddress,
  exactAddress,
} from "../../src/lib/search/address.js";
const memo = persistentMemo(
  join(serverDirectory, ".cache", "census-address-v1.json"),
);
export function createCensusVerifier({ fetchImpl = fetch, cache = memo } = {}) {
  return async (candidate) => {
    const label = addressLabel(candidate);
    if (!candidate.city || !candidate.state || !candidate.zip)
      return { ...candidate, verified: false };
    let fresh;
    let result;
    try {
      result = await cache(
        normalizeAddress(label),
        async () => {
          try {
            const u = new URL(
              "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress",
            );
            u.search = new URLSearchParams({
              address: label,
              benchmark: "Public_AR_Current",
              format: "json",
            });
            const r = await fetchImpl(u, { signal: AbortSignal.timeout(6000) });
            if (!r.ok) throw Error();
            const matches = (await r.json())?.result?.addressMatches || [];
            if (matches.length !== 1) return { verified: false };
            const m = matches[0];
            const line1 = String(m.matchedAddress || "").split(",")[0],
              zip =
                m.addressComponents?.zip ||
                String(m.matchedAddress || "").match(/\b\d{5}\b/)?.[0];
            if (
              !exactAddress(
                {
                  ...candidate,
                  line1: splitAddress(candidate.line1 || candidate.street).base,
                },
                { address: line1, zip },
              )
            )
              return { verified: false };
            const unit = splitAddress(candidate.line1 || candidate.street).unit;
            const standardized =
              line1 +
              (unit ? " Apt " + unit : "") +
              String(m.matchedAddress).slice(line1.length);
            return (fresh = {
              verified: true,
              line1: line1 + (unit ? " Apt " + unit : ""),
              street: line1 + (unit ? " Apt " + unit : ""),
              city: m.addressComponents?.city || candidate.city,
              state: m.addressComponents?.state || candidate.state,
              zip,
              label: standardized,
              standardized,
              lat: m.coordinates.y,
              lng: m.coordinates.x,
            });
          } catch {
            return { verified: false, verificationUnavailable: true };
          }
        },
        (v) => (v.verificationUnavailable ? 60000 : 7 * 86400000),
      );
    } catch {
      result = fresh || { verified: false, verificationUnavailable: true };
    }
    return { ...candidate, ...result };
  };
}
export const verifyAddress = createCensusVerifier();
