import { claimAddressRentCast } from "../providers/daily-budget.js";
import { addressSlot } from "../providers/concurrency.js";
import { join } from "node:path";
import { config, serverDirectory } from "../config.js";
import { createRentCastClient } from "../rentcast.js";
import { createAutocompleteProvider } from "../providers/autocomplete.js";
import { verifyAddress, resolveAddress } from "../providers/census.js";
import { persistentMemo } from "../storage/memo.js";
import { runActor } from "../providers/actor.js";
import { ACTORS } from "../config/apify.js";
import { buildInput } from "./adapters/zillow.js";
import { normalize, mergeListings } from "./listing.js";
import { visibleListings } from "./status.js";
import { recentListings } from "./recent.js";
import { addressFixtures, fixtureCandidates } from "./address-fixtures.js";
import { trace, withAddressTrace } from "./address-trace.js";
import { exactAddress, addressKey, addressLabel, normalizeAddress, validBias, splitAddress, parseAddressText, addressParts, parseAddressQuery, matchesAddressQuery } from "../../src/lib/search/address.js";
const memo = persistentMemo(join(serverDirectory, ".cache", "address-sale-v3.json"), { cacheErrors: false });
export function cleanSelected(p) {
  const result = {};
  for (const k of ["line1", "city", "state"]) {
    const v = k === "line1" ? p.line1 || p.street : p[k];
    if (typeof v !== "string" || !v.trim() || v.length > 150) throw Object.assign(Error("Choose a complete US address."), { status: 400 });
    result[k] = v.trim();
  }
  result.zip = typeof p.zip === "string" && /^\d{5}(?:-\d{4})?$/.test(p.zip) ? p.zip : "";
  if (!/^\d/.test(result.line1) || !/^[A-Z]{2}$/i.test(result.state) || ((p.lat != null || p.lng != null) && !validBias(p)))
    throw Object.assign(Error("Choose a complete US address."), { status: 400 });
  return { ...result, state: result.state.toUpperCase(), lat: p.lat, lng: p.lng, label: addressLabel(result) };
}
export function addressVariants(text, original, verified) {
  const strings = [parseAddressText(text) ? text : null, verified.verified ? verified.standardized : null,
    addressLabel({ ...original, zip: "" }), addressLabel({ ...verified, zip: "" })].filter(Boolean);
  const seen = new Set();
  return strings.filter(v => { const key = v.toLowerCase().replace(/[,\s]+/g, " ").trim(); if (seen.has(key)) return false; seen.add(key); return true; });
}
export function createAddressLookup({
  provider = createAutocompleteProvider(), verify = verifyAddress, resolve = resolveAddress, recent = recentListings,
  request = createRentCastClient({ apiKey: config.apiKey }), runner = runActor, cache = memo,
  fixtureMode = config.useFixtures, enabled = config.enableApify, now = Date.now, claim = claimAddressRentCast,
} = {}) {
  const clients = new Map(), flight = new Map();
  return async (body, client = "anonymous") => withAddressTrace(body?.debug === true, async () => {
    if (!body || (!body.selected && (typeof body.text !== "string" || body.text.trim().length < 3 || body.text.length > 300 || /[\x00-\x1f]/.test(body.text))))
      throw Object.assign(Error("Enter a US address up to 300 characters."), { status: 400 });
    for (const [k, v] of clients) if (v.until <= now()) clients.delete(k);
    if (clients.size >= 5000 && !clients.has(client)) throw Object.assign(Error("Address search is busy."), { status: 429 });
    const rate = clients.get(client) || { n: 0, retry: 0, until: now() + 60000 };
    clients.set(client, rate);
    if (++rate.n > 20 || (body.bypassCache === true && ++rate.retry > 2)) throw Object.assign(Error("Too many address searches. Try again in a minute."), { status: 429 });
    const selected = body.selected ? cleanSelected(body.selected) : null;
    const text = body.text?.trim() || "";
    const typed = parseAddressText(text);
    const partial = parseAddressQuery(text);
    // A complete typed address takes precedence over any stale suggestion object.
    const seed = typed || (text ? null : selected);
    const bias = validBias(body.bias) ? body.bias : validBias(body.savedWork) ? body.savedWork : undefined;
    const key = [fixtureMode, enabled, addressKey(seed || text), seed ? [normalizeAddress(seed.city), seed.state] : normalizeAddress(text), !seed && bias && [bias.lat.toFixed(2), bias.lng.toFixed(2)]];
    const compute = async () => addressSlot(async () => {
      const checkedAt = new Date(now()).toISOString();
      const base = { checkedAt, sources: [], usingFixtures: fixtureMode };
      const failed = (unavailable, reasonCode = "SOURCE_UNAVAILABLE", address) => ({ ...base, result: "check_failed", reasonCode, unavailable, ...(address ? { address } : {}), message: "We couldn't check this address right now. Try again." });
      let candidates, providerFailed = false;
      let known = [];
      if (!fixtureMode) {
        try { known = visibleListings(await recent(seed || partial || { line1: text })).filter(p => seed ? exactAddress(seed, p) : matchesAddressQuery(partial || { line1: text }, p)); }
        catch { trace("recent-cache", { error: "unavailable" }); }
      }
      trace("recent-cache", { count: known.length });
      if (seed) candidates = [seed];
      else if (fixtureMode) candidates = fixtureCandidates(text);
      else if (known.length) candidates = known.map(p => {
        const { base, unit } = splitAddress(p.address);
        const line1 = base.split(",")[0] + (partial && splitAddress(partial.line1).unit && unit ? " Apt " + unit : "");
        const candidate = { line1, city: p.city, state: p.state, zip: p.zip, lat: p.lat, lng: p.lng };
        return { ...candidate, label: addressLabel(candidate) };
      });
      else {
        // Census can fill missing city/state/ZIP even when autocomplete has no
        // building coverage. Try it first for partial input, then the providers.
        if (partial) {
          try { candidates = await resolve(text); providerFailed = Boolean(candidates.unavailable); }
          catch { candidates = []; providerFailed = true; }
        }
        if (!candidates?.length) try { candidates = await provider(text, bias); providerFailed ||= Boolean(candidates.unavailable); }
        catch { candidates = []; providerFailed = true; }
      }
      const seen = new Set();
      candidates = candidates.slice(0, 6).map(p => ({ ...p, line1: p.line1 || p.street })).filter(p => {
        if (!p.line1 || !p.city || !p.state) return false;
        if (!seed && partial && !matchesAddressQuery(partial, p)) return false;
        const k = [addressKey(p), normalizeAddress(p.city), p.state].join("|");
        if (seen.has(k)) return false; seen.add(k); return true;
      });
      trace("candidates", { candidates });
      if (!candidates.length) return providerFailed ? failed(["Autocomplete"], "GEOCODER_UNAVAILABLE") : { ...base, result: "not_found", reasonCode: "ADDRESS_NOT_RESOLVED", message: "We couldn't find that address. Check spelling and include city and state." };
      if (candidates.length > 1) return { ...base, result: "ambiguous", reasonCode: "MULTIPLE_ADDRESSES", candidates: candidates.map(p => ({ ...p, zip: "", label: addressLabel({ ...p, zip: "" }) })), message: "Add a city or choose an address to narrow it down." };
      const original = candidates[0];
      let candidate;
      if (original.provider === "census" && original.verified) candidate = original;
      else if (fixtureMode || known.length) candidate = { ...original, verified: false };
      else try { candidate = await verify(original); } catch { candidate = { ...original, zip: "", verified: false, verificationUnavailable: true }; }
      trace("census", { candidate, skipped: known.length ? "authoritative recent listing" : fixtureMode ? "fixture" : undefined });
      // Preserve the user's requested house/street/unit. Verification never redirects it.
      if (addressParts(candidate).street !== addressParts(original).street) candidate = { ...original, zip: "", verified: false };
      const address = { ...candidate, standardized: candidate.standardized || addressLabel({ ...candidate, zip: candidate.verified ? candidate.zip : "" }) };
      let listings = [], sources = [], unavailable = candidate.verificationUnavailable ? ["Census"] : [];
      const matchingRows = (rows, source) => {
        const result = [];
        for (const raw of rows) {
          const p = normalize(raw, source, true), match = exactAddress(candidate, p);
          trace("listing-decision", { source, address: p.address, zip: p.zip, rawStatus: String(raw.status || raw.listingStatus || raw.homeStatus || ""), status: p.status, reason: !match ? "dropped: house/street/unit or locality differs" : p.status !== "for_sale" ? `dropped: status ${p.status}` : "accepted" });
          if (match) result.push(p);
        }
        // Merge contradictions before filtering, so a pending duplicate cannot become active.
        return visibleListings(mergeListings(result));
      };
      if (fixtureMode) {
        listings = matchingRows(addressFixtures.map(p => ({ ...p, address: p.line1, latitude: p.lat, longitude: p.lng, price: 500000, bedrooms: 3, bathrooms: 2 })), "RentCast");
        sources.push("Saved sample data");
      } else {
        listings = known.filter(p => exactAddress(candidate, p));
        if (listings.length) sources.push("Recent listing cache");
        if (!listings.length) {
          const variants = addressVariants(text, original, candidate).map(address => ({ address, params: { status: "Active", limit: "50" } }));
          if (validBias(candidate)) variants.push({ address: undefined, params: { latitude: String(candidate.lat), longitude: String(candidate.lng), radius: "0.0622", status: "Active", limit: "50" } });
          for (const variant of variants) {
            trace("address-variant", variant);
            try {
              if (!(await claim())) { unavailable.push("RentCast"); trace("rentcast-error", { code: "DAILY_CAP" }); break; }
              trace("rentcast-request", variant);
              const data = await request("/listings/sale", variant.address, variant.params);
              if (data !== null && !Array.isArray(data)) throw Error("Invalid response");
              trace("rentcast-response", { count: data?.length || 0 });
              sources.push("RentCast");
              listings = matchingRows(data || [], "RentCast");
              if (listings.length) break;
            } catch (e) {
              unavailable.push("RentCast");
              trace("rentcast-error", { code: e.code || "UNAVAILABLE", status: e.upstreamStatus || e.status || null });
              // Do not multiply failed/quota-limited requests across variants.
              break;
            }
          }
        }
        if (!listings.length && enabled) {
          trace("apify-request", { address: addressLabel({ ...candidate, zip: candidate.verified ? candidate.zip : "" }) });
          try {
            const data = await runner(ACTORS.Zillow, buildInput({ location: addressLabel({ ...candidate, zip: candidate.verified ? candidate.zip : "" }), limit: 50, status: "sale" }), { limit: 50 });
            if (!Array.isArray(data)) throw Error("Invalid response");
            trace("apify-response", { count: data.length });
            sources.push("Zillow");
            listings = matchingRows(data, "Zillow");
          } catch { unavailable.push("Zillow"); trace("apify-error", { reason: "unavailable, timeout or cap" }); }
        } else trace("apify-skipped", { reason: listings.length ? "conclusive hit" : "disabled" });
      }
      listings = visibleListings(mergeListings(listings)).map(p => ({ ...p, usingFixtures: fixtureMode, checkedAt: sources.includes("Recent listing cache") ? p.checkedAt : checkedAt }));
      if (!listings.length && unavailable.length) return { ...failed([...new Set(unavailable)], "SOURCE_UNAVAILABLE", address), sources: [...new Set(sources)] };
      return { ...base, address, sources: [...new Set(sources)], unavailable: [...new Set(unavailable)],
        checkedAt: listings.length ? listings.map(p => p.checkedAt).sort()[0] : checkedAt,
        result: listings.length ? "for_sale" : "not_for_sale", reasonCode: listings.length ? "ACTIVE_EXACT_MATCH" : "NO_ACTIVE_LISTING",
        ...(listings.length ? { listings } : {}),
        message: listings.length ? (!splitAddress(original.line1).unit && listings.length > 1 ? "Several units are for sale. Choose a unit below." : "Active for-sale listing found.") : `${address.standardized} isn't currently listed for sale, so we're not showing it.`,
      };
    });
    const run = () => {
      const id = JSON.stringify(key);
      if (flight.has(id)) return flight.get(id);
      const task = compute().finally(() => flight.delete(id));
      flight.set(id, task); return task;
    };
    const result = await cache(key, run, v => v.result === "check_failed" ? 0 : Math.max(0, 3600000 - (now() - Date.parse(v.checkedAt))), { bypass: body.bypassCache === true });
    const enteredZip = typed?.zip;
    return enteredZip && result.listings ? { ...result, listings: result.listings.map(p => ({ ...p, ...(p.zip && p.zip !== enteredZip ? { zipNote: `You entered ZIP ${enteredZip}. This home's ZIP is ${p.zip}.` } : {}) })) } : result;
  });
}
export const lookupAddress = createAddressLookup();
