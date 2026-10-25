import {
  normalizeAddress,
  splitAddress,
  addressLabel,
  validBias,
  parseAddressQuery,
  matchesAddressQuery,
} from "../../src/lib/search/address.js";
import { claimGeoapify } from "./daily-budget.js";
import { recentListings } from "../search/recent.js";
import { config } from "../config.js";
import { fixtureCandidates } from "../search/address-fixtures.js";
import savedExamples from "../fixtures/autocomplete-examples.json" with { type: "json" };
import { plausibleZip } from "./zip.js";
import { trace } from "../search/address-trace.js";
import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { serverDirectory } from '../config.js';
// Photon API: https://github.com/komoot/photon/blob/master/docs/api-v1.md
export const STATE_CODES = Object.fromEntries(
  [
    ["Alabama", "AL"],
    ["Alaska", "AK"],
    ["Arizona", "AZ"],
    ["Arkansas", "AR"],
    ["California", "CA"],
    ["Colorado", "CO"],
    ["Connecticut", "CT"],
    ["Delaware", "DE"],
    ["District of Columbia", "DC"],
    ["Florida", "FL"],
    ["Georgia", "GA"],
    ["Hawaii", "HI"],
    ["Idaho", "ID"],
    ["Illinois", "IL"],
    ["Indiana", "IN"],
    ["Iowa", "IA"],
    ["Kansas", "KS"],
    ["Kentucky", "KY"],
    ["Louisiana", "LA"],
    ["Maine", "ME"],
    ["Maryland", "MD"],
    ["Massachusetts", "MA"],
    ["Michigan", "MI"],
    ["Minnesota", "MN"],
    ["Mississippi", "MS"],
    ["Missouri", "MO"],
    ["Montana", "MT"],
    ["Nebraska", "NE"],
    ["Nevada", "NV"],
    ["New Hampshire", "NH"],
    ["New Jersey", "NJ"],
    ["New Mexico", "NM"],
    ["New York", "NY"],
    ["North Carolina", "NC"],
    ["North Dakota", "ND"],
    ["Ohio", "OH"],
    ["Oklahoma", "OK"],
    ["Oregon", "OR"],
    ["Pennsylvania", "PA"],
    ["Rhode Island", "RI"],
    ["South Carolina", "SC"],
    ["South Dakota", "SD"],
    ["Tennessee", "TN"],
    ["Texas", "TX"],
    ["Utah", "UT"],
    ["Vermont", "VT"],
    ["Virginia", "VA"],
    ["Washington", "WA"],
    ["West Virginia", "WV"],
    ["Wisconsin", "WI"],
    ["Wyoming", "WY"],
    ["Puerto Rico", "PR"],
    ["Guam", "GU"],
    ["United States Virgin Islands", "VI"],
    ["American Samoa", "AS"],
    ["Northern Mariana Islands", "MP"],
  ].map(([name, code]) => [name.toLowerCase(), code]),
);
const text = (value) => (typeof value === "string" ? value.trim() : "");

export function normalizeSuggestions(data, places = false) {
  const suggestions = new Map();
  for (const feature of Array.isArray(data?.features) ? data.features : []) {
    const p = feature?.properties || {};
    const house = text(p.housenumber),
      road = text(p.street);
    const city =
      text(p.city) ||
      text(p.town) ||
      text(p.village) ||
      text(p.locality) ||
      (places ? text(p.name) : "");
    const rawState = text(p.state);
    const state =
      STATE_CODES[rawState.toLowerCase()] ||
      (/^[A-Z]{2}$/.test(rawState) ? rawState : "");
    const providerZip = text(p.postcode);
    if (!plausibleZip(state, providerZip)) continue;
    const zip = "";
    if (
      text(p.countrycode).toUpperCase() !== "US" ||
      (!places && (!house || !road)) ||
      !city ||
      !state
    )
      continue;
    const street = [house, road].filter(Boolean).join(" ");
    const label = places
      ? [...new Set([text(p.name), street, city, state].filter(Boolean))].join(
          ", ",
        )
      : `${street}, ${city}, ${state}${zip ? ` ${zip}` : ""}`;
    const coordinates = feature.geometry?.coordinates;
    const lng = Number.isFinite(coordinates?.[0]) ? coordinates[0] : null;
    const lat = Number.isFinite(coordinates?.[1]) ? coordinates[1] : null;
    const key = (places ? label : `${street},${city},${state}`).toLowerCase();
    if (!suggestions.has(key))
      suggestions.set(key, { label, street, city, state, zip, lat, lng });
    if (suggestions.size === 5) break;
  }
  return [...suggestions.values()];
}

export function normalizeProviderResults(
  data,
  provider,
  query,
  bias,
  places = false,
) {
  const partial = parseAddressQuery(query);
  const { base, unit } = splitAddress(partial?.line1 || query),
    q = normalizeAddress(base),
    house = q.match(/^\d+[a-z]?(?:-\d+)?\b/)?.[0],
    streetQuery = normalizeAddress(base.split(",")[0]).replace(
      /^\d+[a-z]?(?:-\d+)?\s*/,
      "",
    );
  const rows =
    provider === "geoapify"
      ? data?.results || []
      : (data?.features || []).map((f) => ({
          ...f.properties,
          lon: f.geometry?.coordinates?.[0],
          lat: f.geometry?.coordinates?.[1],
        }));
  const result = [];
  for (const p of rows) {
    const country = String(p.country_code || p.countrycode || "").toUpperCase(),
      number = String(p.housenumber || ""),
      street = p.street || "",
      city =
        p.city ||
        p.town ||
        p.village ||
        p.locality ||
        (places ? p.name : "") ||
        "",
      state =
        STATE_CODES[String(p.state || "").toLowerCase()] ||
        String(p.state_code || p.state || "").toUpperCase(),
      zip = String(p.postcode || "");
    const confidence =
      provider === "geoapify"
        ? Number(p.rank?.confidence || 0)
        : number && street
          ? 0.75
          : 0.5;
    if (
      country !== "US" ||
      !city ||
      !/^[A-Z]{2}$/.test(state) ||
      !validBias({ lat: p.lat, lng: p.lon })
    )
      continue;
    if (
      house &&
      (!number ||
        !street ||
        confidence < 0.6 ||
        (provider === "geoapify" &&
          !["building", "address"].includes(p.result_type)))
    )
      continue;
    if (!plausibleZip(state, zip)) continue;
    if (
      !house &&
      !places &&
      provider === "geoapify" &&
      !["street", "city"].includes(p.result_type)
    )
      continue;
    if (!house && !places && number) continue;
    const streetNormalized = normalizeAddress(street);
    if (
      house &&
      (number.toLowerCase() !== house ||
        (!streetNormalized.startsWith(streetQuery) &&
          !streetQuery.startsWith(streetNormalized + " ") &&
          streetQuery !== streetNormalized))
    )
      continue;
    const line1 =
      [number, street].filter(Boolean).join(" ") +
      (unit && number ? " Apt " + unit : "");
    const v = {
      line1,
      street: line1,
      city,
      state,
      providerZip: /^\d{5}(?:-\d{4})?$/.test(zip) ? zip : "",
      zip: "",
      lat: p.lat,
      lng: p.lon,
      confidence,
      matchType: p.rank?.match_type || null,
      provider,
      resultType: house ? "address" : street ? "street" : "city",
      verified: false,
    };
    if (partial && !matchesAddressQuery(partial, v)) continue;
    v.label = addressLabel(v);
    v.prefix = normalizeAddress(street).startsWith(streetQuery);
    v.houseMatch = number.toLowerCase() === house;
    v.distance = validBias(bias)
      ? Math.hypot(
          (v.lng - bias.lng) * Math.cos((bias.lat * Math.PI) / 180),
          v.lat - bias.lat,
        )
      : 0;
    result.push(v);
  }
  result.sort(
    (a, b) =>
      Number(b.prefix) - Number(a.prefix) ||
      Number(b.houseMatch) - Number(a.houseMatch) ||
      b.confidence - a.confidence ||
      a.distance - b.distance,
  );
  const seen = new Set();
  return result
    .filter((p) => {
      const key = normalizeAddress(p.label);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6)
    .map(({ prefix, houseMatch, distance, ...p }) => p);
}

export function createAutocompleteProvider({
  fetchImpl = fetch,
  now = Date.now,
  places = false,
  provider = process.env.AUTOCOMPLETE_PROVIDER || "auto",
  apiKey = process.env.GEOAPIFY_API_KEY,
  claim = claimGeoapify,
  knownSale = recentListings,
  fixtureMode = config.useFixtures,
} = {}) {
  const cache = new Map(),
    inFlight = new Map();
  return async (query, bias) => {
    const sample = fixtureMode
      ? savedExamples[query.toLowerCase().trim()] || fixtureCandidates(query)
      : [];
    if (sample.length) return sample;
    const { base, unit } = splitAddress(query),
      normalized = normalizeAddress(base),
      key = JSON.stringify([
        normalized,
        unit,
        validBias(bias) ? [bias.lat.toFixed(2), bias.lng.toFixed(2)] : null,
        places,
      ]);
    if (cache.get(key)?.until > now()) { trace("autocomplete-cache", { hit: true }); return cache.get(key).value; }
    if (inFlight.has(key)) { trace("autocomplete-cache", { coalesced: true }); return inFlight.get(key); }
    trace("autocomplete-cache", { hit: false });
    const task = (async () => {
      let results = [];
      let answered = false;
      async function call(source) {
        const u = new URL(
          source === "geoapify"
            ? "https://api.geoapify.com/v1/geocode/autocomplete"
            : "https://photon.komoot.io/api/",
        );
        u.search = new URLSearchParams(
          source === "geoapify"
            ? {
                text: normalized,
                filter: "countrycode:us",
                limit: "12",
                lang: "en",
                format: "json",
                apiKey,
                ...(validBias(bias)
                  ? { bias: `proximity:${bias.lng},${bias.lat}` }
                  : {}),
              }
            : {
                q: normalized,
                limit: "12",
                lang: "en",
                countrycode: "US",
                ...(validBias(bias)
                  ? { lat: String(bias.lat), lon: String(bias.lng) }
                  : {}),
                ...(/^\d/.test(normalized) ? { layer: "house" } : {}),
              },
        );
        const r = await fetchImpl(u, { signal: AbortSignal.timeout(5000) });
        trace("autocomplete-provider", { provider: source, status: r.status });
        if (!r.ok) throw Error("Provider unavailable");
        answered = true;
        return normalizeProviderResults(
          await r.json(),
          source,
          query,
          bias,
          places,
        );
      }
      if (provider !== "photon" && apiKey && apiKey !== "your_key_here")
        try {
          if (await claim()) results = await call("geoapify");
        } catch { trace("autocomplete-provider-error", { provider: "geoapify", reason: "unavailable or timeout" }); }
      if (!results.length)
        try {
          results = await call("photon");
        } catch { trace("autocomplete-provider-error", { provider: "photon", reason: "unavailable or timeout" }); }
      trace("provider-candidates", { candidates: results });
      results = await Promise.all(
        results.map(async (p) => ({
          ...p,
          forSale:
            p.resultType === "address" && (await knownSale(p)).length > 0,
        })),
      );
      // Sale badges only break ties in address relevance, never replace address matches.
      const street = normalizeAddress(base.split(",")[0]).replace(
        /^\d+[a-z]?(?:-\d+)?\s*/,
        "",
      );
      const prefix = (p) =>
          normalizeAddress(p.line1)
            .replace(/^\d+[a-z]?(?:-\d+)?\s*/, "")
            .startsWith(street),
        house = (p) =>
          normalizeAddress(p.line1).split(" ")[0] === normalized.split(" ")[0];
      results.sort(
        (a, b) =>
          Number(prefix(b)) - Number(prefix(a)) ||
          Number(house(b)) - Number(house(a)) ||
          Number(b.forSale) - Number(a.forSale),
      );
      if (!answered) {
        Object.defineProperty(results, "unavailable", { value: true });
        trace("autocomplete-error", { reason: "all enabled geocoders unavailable" });
        return results;
      }
      for (const [k, v] of cache) if (v.until <= now()) cache.delete(k);
      if (cache.size >= 1000) cache.delete(cache.keys().next().value);
      cache.set(key, { value: results, until: now() + 600000 });
      return results;
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, task);
    return task;
  };
}

// Separate administrative-place search: address suggestions above retain their contract.
export function createPlacesProvider({ fetchImpl=fetch, apiKey=process.env.GEOAPIFY_API_KEY, claim=claimGeoapify, now=Date.now, administrativeOnly=true, cacheFile=join(serverDirectory,'.cache',administrativeOnly?'places.json':'place-points.json') }={}) {
  const cache=new Map(),inFlight=new Map();
  let loaded=false,saveQueue=Promise.resolve();
  return async function places(query, budget={calls:0,deadline:now()+2200}) {
    if(!loaded){loaded=true;if(cacheFile)try{const saved=JSON.parse(await readFile(cacheFile,'utf8'));for(const[k,v]of Object.entries(saved).slice(0,1000))if(v.until>now()&&Array.isArray(v.value))cache.set(k,v);}catch{}}
    const key=query.toLowerCase().trim();
    if(cache.get(key)?.until>now())return cache.get(key).value;
    if(inFlight.has(key))return inFlight.get(key);
    const task=(async()=>{
      for(const provider of apiKey&&apiKey!=='your_key_here'?['geoapify','photon']:['photon']) {
        if(budget.calls>=3||now()>=budget.deadline)break;
        if(provider==='geoapify'&&!(await claim()))continue;
        budget.calls++;
        try {
          const url=new URL(provider==='geoapify'?'https://api.geoapify.com/v1/geocode/autocomplete':'https://photon.komoot.io/api/');
          url.search=new URLSearchParams(provider==='geoapify'?{text:query,filter:'countrycode:us',...(administrativeOnly?{type:'locality'}:{}),limit:'5',format:'json',apiKey}:{q:query,countrycode:'US',limit:'5',lang:'en'});
          const response=await fetchImpl(url,{signal:AbortSignal.timeout(Math.max(1,Math.min(3000,budget.deadline-now())))});
          if(!response.ok)continue;
          const data=await response.json();
          const rows=provider==='geoapify'?data.results||[]:(data.features||[]).map(f=>({...f.properties,lon:f.geometry?.coordinates?.[0],lat:f.geometry?.coordinates?.[1]}));
          const values=rows.flatMap(p=>{
            const country=String(p.country_code||p.countrycode||'').toLowerCase();
            const state=STATE_CODES[String(p.state||'').toLowerCase()]||p.state_code||p.state;
            if(country!=='us'||!/^([A-Z]{2})$/.test(state||'')||!validBias({lat:p.lat,lng:p.lon}))return [];
            const type=p.result_type||p.osm_value;
            if(administrativeOnly&&provider==='geoapify'&&!['city','suburb','district','postcode','county'].includes(type))return [];
            if(administrativeOnly&&provider==='photon'&&!['city','town','village','suburb','neighbourhood','quarter','district','county','administrative','postcode'].includes(type))return [];
            const area=p.city||p.town||p.village||p.county||p.name;
            if(!area)return [];
            const zip=/^\d{5}$/.test(query)?query:null;
            return [{label:zip||`${p.name||[p.housenumber,p.street,area].filter(Boolean).join(', ')}, ${state}`,city:area,state,lat:p.lat,lng:p.lon,resultType:type,provider}];
          }).slice(0,5);
          if(values.length){if(cache.size>=1000)cache.delete(cache.keys().next().value);cache.set(key,{until:now()+30*86400000,value:values});
            if(cacheFile){saveQueue=saveQueue.catch(()=>{}).then(async()=>{await mkdir(dirname(cacheFile),{recursive:true});await writeFile(cacheFile+'.tmp',JSON.stringify(Object.fromEntries(cache)),{mode:0o600});await rename(cacheFile+'.tmp',cacheFile);});saveQueue.catch(()=>{});}
            return values;}
        }catch{/* Bounded fallback; no URLs, keys or raw provider failures in logs. */}
      }
      return [];
    })().finally(()=>inFlight.delete(key));
    inFlight.set(key,task);return task;
  };
}
