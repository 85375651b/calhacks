import { claimAddressRentCast } from "../providers/daily-budget.js";
import { addressSlot } from "../providers/concurrency.js";
import { join } from "node:path";
import { config, serverDirectory } from "../config.js";
import { createRentCastClient } from "../rentcast.js";
import { createAutocompleteProvider } from "../providers/autocomplete.js";
import { verifyAddress } from "../providers/census.js";
import { persistentMemo } from "../storage/memo.js";
import { runActor } from "../providers/actor.js";
import { ACTORS } from "../config/apify.js";
import { buildInput } from "./adapters/zillow.js";
import { normalize, mergeListings } from "./listing.js";
import { visibleListings } from "./status.js";
import { recentListings } from "./recent.js";
import { addressFixtures, fixtureCandidates } from "./address-fixtures.js";
import {
  exactAddress,
  addressLabel,
  normalizeAddress,
  validBias,
  splitAddress,
} from "../../src/lib/search/address.js";
const memo = persistentMemo(
  join(serverDirectory, ".cache", "address-sale-v1.json"),
);
export function cleanSelected(p) {
  const result = {};
  for (const k of ["line1", "city", "state", "zip"]) {
    const v = k === "line1" ? p.line1 || p.street : p[k];
    if (typeof v !== "string" || !v.trim() || v.length > 150)
      throw Object.assign(Error("Choose a complete US address."), {
        status: 400,
      });
    result[k] = v.trim();
  }
  if (
    !/^\d/.test(result.line1) ||
    !/^[A-Z]{2}$/i.test(result.state) ||
    !/^\d{5}(?:-\d{4})?$/.test(result.zip) ||
    !validBias(p)
  )
    throw Object.assign(Error("Choose a complete US address."), {
      status: 400,
    });
  return {
    ...result,
    state: result.state.toUpperCase(),
    lat: p.lat,
    lng: p.lng,
    label: addressLabel(result),
  };
}
export function createAddressLookup({
  provider = createAutocompleteProvider(),
  verify = verifyAddress,
  recent = recentListings,
  request = createRentCastClient({ apiKey: config.apiKey }),
  runner = runActor,
  cache = memo,
  fixtureMode = config.useFixtures,
  enabled = config.enableApify,
  now = Date.now,
  claim = claimAddressRentCast,
} = {}) {
  const clients = new Map();
  return async (body, client = "anonymous") => {
    if (
      !body ||
      (!body.selected &&
        (typeof body.text !== "string" ||
          body.text.trim().length < 3 ||
          body.text.length > 300 ||
          /[\x00-\x1f]/.test(body.text)))
    )
      throw Object.assign(Error("Enter a US address up to 300 characters."), {
        status: 400,
      });
    for (const [k, v] of clients) if (v.until <= now()) clients.delete(k);
    if (clients.size >= 5000 && !clients.has(client))
      throw Object.assign(Error("Address search is busy."), { status: 429 });
    const rate = clients.get(client) || { n: 0, until: now() + 60000 };
    clients.set(client, rate);
    if (++rate.n > 20)
      throw Object.assign(
        Error("Too many address searches. Try again in a minute."),
        { status: 429 },
      );
    const selected = body.selected ? cleanSelected(body.selected) : null,
      text = body.text?.trim(),
      bias = validBias(body.bias)
        ? body.bias
        : validBias(body.savedWork)
          ? body.savedWork
          : undefined;
    return cache(
      [
        fixtureMode,
        enabled,
        normalizeAddress(selected ? addressLabel(selected) : text),
        !selected && bias && [bias.lat.toFixed(2), bias.lng.toFixed(2)],
      ],
      async () =>
        addressSlot(async () => {
          const checkedAt = new Date(now()).toISOString(),
            base = { checkedAt, sources: [], usingFixtures: fixtureMode };
          let candidates = selected
            ? [selected]
            : fixtureMode
              ? fixtureCandidates(text)
              : await provider(text, bias);
          candidates = candidates
            .slice(0, 5)
            .map((p) => ({ ...p, line1: p.line1 || p.street }))
            .filter(
              (p) => p.line1 && p.city && p.state && p.zip && validBias(p),
            );
          if (!candidates.length)
            return {
              ...base,
              result: "not_found",
              message:
                "We couldn't find that address. Check spelling and include city, state and ZIP.",
            };
          candidates = await Promise.all(
            candidates.map((p) =>
              fixtureMode ? { ...p, verified: false } : verify(p),
            ),
          );
          if (
            !selected &&
            candidates.length === 1 &&
            !normalizeAddress(candidates[0].line1).startsWith(
              normalizeAddress(splitAddress(text).base.split(",")[0]),
            ) &&
            !candidates[0].verified
          )
            return {
              ...base,
              result: "ambiguous",
              candidates,
              message:
                "Confirm this address, or add a city or ZIP to narrow it down.",
            };
          if (!selected && candidates.length > 1) {
            const full = candidates.filter(
              (p) => p.verified && text.includes(p.zip),
            );
            if (full.length === 1) candidates = full;
            else
              return {
                ...base,
                result: "ambiguous",
                candidates,
                message: "Add a city or ZIP to narrow it down.",
              };
          }
          const candidate = candidates[0],
            address = {
              ...candidate,
              standardized:
                candidate.standardized ||
                candidate.label ||
                addressLabel(candidate),
            };
          let listings = [],
            sources = [],
            unavailable = [];
          if (fixtureMode) {
            listings = addressFixtures
              .filter((p) => exactAddress(candidate, p))
              .map((p) =>
                normalize(
                  {
                    address: p.line1,
                    city: p.city,
                    state: p.state,
                    zip: p.zip,
                    latitude: p.lat,
                    longitude: p.lng,
                    status: p.status,
                    price: 500000,
                    bedrooms: 3,
                    bathrooms: 2,
                    squareFootage: 1800,
                  },
                  "RentCast",
                  true,
                ),
              );
            sources = ["Saved sample data"];
          } else {
            listings = visibleListings(await recent(candidate)).filter((p) =>
              exactAddress(candidate, p),
            );
            if (listings.length) sources.push("Recent listing cache");
            if (!listings.length) {
              try {
                if (!(await claim())) throw Error("Daily cap");
                const data = await request(
                  "/listings/sale",
                  addressLabel(candidate),
                  { status: "Active", limit: "50" },
                );
                sources.push("RentCast");
                listings = visibleListings(
                  (Array.isArray(data) ? data : []).map((p) =>
                    normalize(p, "RentCast", true),
                  ),
                ).filter((p) => exactAddress(candidate, p));
              } catch {
                unavailable.push("RentCast");
              }
            }
            if (!listings.length && enabled) {
              try {
                const data = await runner(
                  ACTORS.Zillow,
                  buildInput({
                    location: addressLabel(candidate),
                    limit: 50,
                    status: "sale",
                  }),
                  { limit: 50 },
                );
                sources.push("Zillow");
                listings = visibleListings(
                  (Array.isArray(data) ? data : []).map((p) =>
                    normalize(p, "Zillow", true),
                  ),
                ).filter((p) => exactAddress(candidate, p));
              } catch {
                unavailable.push("Zillow");
              }
            }
          }
          listings = visibleListings(mergeListings(listings)).map((p) => ({
            ...p,
            usingFixtures: fixtureMode,
            checkedAt: sources.includes("Recent listing cache")
              ? p.checkedAt
              : checkedAt,
          }));
          return {
            ...base,
            checkedAt: listings.length
              ? listings.map((p) => p.checkedAt).sort()[0]
              : checkedAt,
            address,
            sources,
            unavailable,
            result: listings.length ? "for_sale" : "not_for_sale",
            ...(listings.length ? { listings } : {}),
            message: listings.length
              ? !splitAddress(candidate.line1).unit && listings.length > 1
                ? "Several units are for sale. Choose a unit below."
                : "Active for-sale listing found."
              : unavailable.length
                ? "We couldn't confirm an active listing because a source is unavailable. No home details are shown. Try again later."
                : `${address.standardized} isn't currently listed for sale, so we're not showing it.`,
          };
        }),
      (v) =>
        v.unavailable?.length
          ? 60000
          : Math.max(1000, 3600000 - (now() - Date.parse(v.checkedAt))),
    );
  };
}
export const lookupAddress = createAddressLookup();
