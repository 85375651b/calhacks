import { join } from "node:path";
import { serverDirectory } from "../config.js";
import { persistentMemo } from "../storage/memo.js";
import { addressLabel, normalizeAddress, splitAddress, addressKey, validBias, parseAddressQuery, matchesAddressQuery } from "../../src/lib/search/address.js";
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

// Forward resolution also accepts street + city without a state or ZIP. Reuse
// the verifier's global request guard and seven-day cache; no paid calls.
export function createCensusResolver({ fetchImpl = fetch, cache = memo } = {}) {
  return async text => {
    const query = parseAddressQuery(text);
    if (!query) return [];
    const label = addressLabel({ ...query, zip: "" });
    const result = await cache(["resolve", normalizeAddress(label)], async () => {
      try {
        return await polite(async () => {
          const u = new URL("https://geocoding.geo.census.gov/geocoder/locations/onelineaddress");
          u.search = new URLSearchParams({ address: label, benchmark: "Public_AR_Current", format: "json" });
          const r = await fetchImpl(u, { signal: AbortSignal.timeout(3000) });
          trace("census-resolve-response", { status: r.status });
          if (!r.ok) throw Error("unavailable");
          const data = (await r.json())?.result?.addressMatches;
          if (!Array.isArray(data)) throw Error("invalid response");
          const unit = splitAddress(query.line1).unit;
          const candidates = data.slice(0, 6).map(m => {
            const components = m.addressComponents || {};
            const line1 = String(m.matchedAddress || "").split(",")[0] + (unit ? " Apt " + unit : "");
            const p = { line1, street: line1, city: components.city, state: components.state,
              zip: /^\d{5}$/.test(components.zip) ? components.zip : "",
              lat: m.coordinates?.y, lng: m.coordinates?.x, verified: true, provider: "census", resultType: "address" };
            p.label = p.standardized = addressLabel(p);
            return p;
          }).filter(p => p.city && p.state && p.zip && validBias(p) && matchesAddressQuery(query, p));
          return { candidates };
        });
      } catch { return { candidates: [], unavailable: true }; }
    }, v => v.unavailable ? 0 : 7 * 86400000);
    trace("census-resolved", { candidates: result.candidates, unavailable: Boolean(result.unavailable) });
    const candidates = result.candidates;
    if (result.unavailable) Object.defineProperty(candidates, "unavailable", { value: true, configurable: true });
    return candidates;
  };
}
export const resolveAddress = createCensusResolver();
