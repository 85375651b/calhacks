import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { config, serverDirectory } from "../config.js";
import { ACTORS } from "../config/apify.js";
import { runActor } from "../providers/actor.js";
import { persistentMemo } from "../storage/memo.js";
import { validateCriteria, siteUrl } from "./criteria.js";
import { mergeListings, postFilter, unapplied, normalize, identity } from "./listing.js";
import * as zillow from "./adapters/zillow.js";
import * as redfin from "./adapters/redfin.js";
import { createAutocompleteProvider } from "../providers/autocomplete.js";
const adapters = { Zillow: zillow, Redfin: redfin },
  memo = persistentMemo(join(serverDirectory, ".cache", "search-v4b.json")),
  geo = createAutocompleteProvider();
export function rentcastParams(c) {
  const params = {
    limit: String(c.limit),
    status: c.status === "sold" ? "Inactive" : "Active",
  };
  if (/^\d{5}$/.test(c.location)) params.zipCode = c.location;
  else {
    const parts = c.location.split(",");
    if (parts.length !== 2 || !/^\s*[a-z]{2}\s*$/i.test(parts[1]))
      throw new Error("RentCast fallback requires City, ST or ZIP.");
    params.city = parts[0].trim();
    params.state = parts[1].trim().toUpperCase();
  }
  if (c.minBeds != null)
    params.bedrooms = c.exactBeds ? String(c.minBeds) : c.minBeds + ":";
  if (c.minBaths != null) params.bathrooms = c.minBaths + ":";
  for (const [a, b, k] of [
    ["minPrice", "maxPrice", "price"],
    ["minSqft", "maxSqft", "squareFootage"],
    ["minLotSize", "maxLotSize", "lotSize"],
    ["minYearBuilt", "maxYearBuilt", "yearBuilt"],
  ])
    if (c[a] != null || c[b] != null)
      params[k] = (c[a] ?? "") + ":" + (c[b] ?? "");
  if (c.daysOnMarket) params.daysOnMarket = "0:" + c.daysOnMarket;
  if (c.homeTypes?.length)
    params.propertyType = c.homeTypes
      .map(
        (t) =>
          ({
            house: "Single Family",
            townhome: "Townhouse",
            condo: "Condo",
            "multi-family": "Multi-Family",
            apartment: "Apartment",
            manufactured: "Manufactured",
            land: "Land",
          })[t],
      )
      .join(",");
  return params;
}
async function fallback(c) {
  const u = new URL("https://api.rentcast.io/v1/listings/sale");
  u.search = new URLSearchParams(rentcastParams(c));
  if (!config.apiKey) throw new Error("Property search is unavailable");
  const r = await fetch(u, {
    headers: { "X-Api-Key": config.apiKey },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error("Property search is unavailable");
  const data = await r.json();
  return data
    .map((i) => normalize(i, "RentCast"))
    .filter((p) => postFilter(p, c));
}
export function createSearch({
  runner = runActor,
  cache = memo,
  fixtureMode = config.useFixtures,
  enabled = config.enableApify,
  fallbackProvider = fallback,
  geocode = geo,
} = {}) {
  return async function search(input) {
    const c = validateCriteria(input),
      key = { ...c, location: c.location.toLowerCase().replace(/\s+/g, " ") };
    return cache(
      [
        fixtureMode ? "fixtures" : "live",
        enabled,
        ACTORS.Zillow,
        ACTORS.Redfin,
        key,
      ],
      async () => {
        const sourceErrors = {},
          notApplied = {},
          sourceCounts = {},
          notes = [];
        const results = await Promise.all(
          c.sources.map(async (source) => {
            const a = adapters[source],
              override = siteUrl(c.searchUrl, source.toLowerCase());
            try {
              if (!c.location && !override)
                throw new Error("Enter a location for this source.");
              let rows = fixtureMode
                ? JSON.parse(
                    await readFile(
                      join(
                        serverDirectory,
                        "fixtures",
                        "search-" + source.toLowerCase() + ".json",
                      ),
                      "utf8",
                    ),
                  )
                : await runner(ACTORS[source], a.buildInput(c), {
                    limit: c.limit,
                  });
              let listings = rows.map(a.normalize);
              if (!override)
                listings = listings.filter((p) => postFilter(p, c));
              else
                notes.push(
                  source +
                    ": form filters ignored; pasted URL filters take precedence.",
                );
              notApplied[source] = override
                ? []
                : unapplied(c, [
                    ...a.supportedFilters,
                    ...(source === "Redfin" &&
                    ["sale", "sold"].includes(c.status)
                      ? ["status"]
                      : []),
                  ]);
              if (
                source === "Zillow" &&
                c.newConstruction &&
                ["coming-soon", "pending"].includes(c.status)
              )
                notApplied[source].push("newConstruction");
              listings = listings.slice(0, c.limit);
              sourceCounts[source] = listings.length;
              return listings;
            } catch (e) {
              sourceErrors[source] = e.message;
              sourceCounts[source] = 0;
              return [];
            }
          }),
        );
        let listings = mergeListings(results.flat());
        if (
          Object.keys(sourceErrors).length === c.sources.length &&
          !fixtureMode
        ) {
          listings = await fallbackProvider(c);
          sourceCounts.RentCast = listings.length;
          notes.push(
            "Apify sources unavailable. Showing RentCast listings; inactive listings do not confirm a completed sale.",
          );
          notApplied.RentCast = unapplied(c, ["minBeds", "minBaths"]);
        }
        if (!fixtureMode) {
          await Promise.all(
            listings.map(async (p) => {
              if (p.lat != null && p.lng != null && p.zip) return;
              try {
                const hits = await geocode(
                  [p.address, p.city, p.state].filter(Boolean).join(", "),
                );
                const h = hits.find(
                  (h) =>
                    identity({address:h.street,city:h.city,state:h.state}) ===
                      identity({...p,zip:null}) &&
                    (!p.zip || p.zip === h.zip),
                );
                if (h) {
                  p.lat ??= h.lat;
                  p.lng ??= h.lng;
                  p.zip ??= h.zip;
                }
              } catch {}
            }),
          );
          listings = mergeListings(listings);
        }
        if (fixtureMode)
          notes.push(
            "Offline demo: numeric and home-type filters are applied to saved results. Native-only provider filters and pasted URL contents are not simulated.",
          );
        return {
          listings,
          sourceErrors,
          sourceCounts,
          notApplied,
          notes,
          usingFixtures: fixtureMode,
        };
      },
      (value) => (Object.keys(value.sourceErrors).length ? 300000 : 3600000),
    );
  };
}
export const search = createSearch();
