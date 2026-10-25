import { join } from "node:path";
import { serverDirectory } from "../config.js";
import { persistentMemo } from "../storage/memo.js";
import { addressLabel, normalizeAddress, splitAddress, addressKey, validBias } from "../../src/lib/search/address.js";
import { trace } from "../search/address-trace.js";
const memo = persistentMemo(join(serverDirectory, ".cache", "census-address-v2.json"));
let active = 0, nextStart = 0;
const waiting = [];
async function polite(fn) {
  if (active >= 3) {
    if (waiting.length >= 30) throw Error("busy");
    await new Promise(resolve => waiting.push(resolve));
  } else active++;
  const delay = Math.max(0, nextStart - Date.now());
  nextStart = Math.max(Date.now(), nextStart) + 150;
  try {
    if (delay) await new Promise(resolve => setTimeout(resolve, delay));
    return await fn();
  } finally {
    const next = waiting.shift();
    if (next) next(); else active--;
  }
}
export function createCensusVerifier({ fetchImpl = fetch, cache = memo } = {}) {
  return async candidate => {
    const label = addressLabel({ ...candidate, zip: "" });
    if (!candidate.city || !candidate.state) return { ...candidate, zip: "", verified: false };
    let result;
    try {
      result = await cache(normalizeAddress(label), async () => {
        try {
          return await polite(async () => {
            const u = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
            u.search = new URLSearchParams({ address: label, benchmark: "Public_AR_Current", format: "json" });
            const r = await fetchImpl(u, { signal: AbortSignal.timeout(3000) });
            trace("census-response", { status: r.status });
            if (!r.ok) throw Error("unavailable");
            const matches = (await r.json())?.result?.addressMatches;
            if (!Array.isArray(matches)) throw Error("invalid response");
            const street = splitAddress(candidate.line1 || candidate.street).base.split(",")[0];
            const same = matches.filter(m => addressKey(street) === addressKey(String(m.matchedAddress || "").split(",")[0]) &&
              (!m.addressComponents?.state || m.addressComponents.state.toUpperCase() === candidate.state.toUpperCase()));
            if (same.length !== 1) return { verified: false };
            const m = same[0], zip = String(m.addressComponents?.zip || String(m.matchedAddress || "").match(/\b\d{5}\b(?=[^\d]*$)/)?.[0] || "");
            if (!/^\d{5}$/.test(zip) || !validBias({ lat: m.coordinates?.y, lng: m.coordinates?.x })) return { verified: false };
            const unit = splitAddress(candidate.line1 || candidate.street).unit;
            const line1 = String(m.matchedAddress).split(",")[0] + (unit ? " Apt " + unit : "");
            const verified = { verified: true, line1, street: line1, city: m.addressComponents?.city || candidate.city, state: m.addressComponents?.state || candidate.state, zip, lat: m.coordinates.y, lng: m.coordinates.x };
            verified.standardized = addressLabel(verified);
            verified.label = verified.standardized;
            return verified;
          });
        } catch { return { verified: false, verificationUnavailable: true }; }
      }, v => v.verificationUnavailable ? 0 : 7 * 86400000);
    } catch { result = { verified: false, verificationUnavailable: true }; }
    trace("census-verification", { address: label, providerZip: candidate.providerZip || candidate.zip || null, censusZip: result.verified ? result.zip : null, unavailable: Boolean(result.verificationUnavailable) });
    return { ...candidate, zip: "", ...result };
  };
}
export const verifyAddress = createCensusVerifier();
