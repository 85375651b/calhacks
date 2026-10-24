// Photon API: https://github.com/komoot/photon/blob/master/docs/api-v1.md
const STATE_CODES = Object.fromEntries(
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

export function normalizeSuggestions(data) {
  const suggestions = new Map();
  for (const feature of Array.isArray(data?.features) ? data.features : []) {
    const p = feature?.properties || {};
    const house = text(p.housenumber),
      road = text(p.street);
    const city =
      text(p.city) || text(p.town) || text(p.village) || text(p.locality);
    const rawState = text(p.state);
    const state =
      STATE_CODES[rawState.toLowerCase()] ||
      (/^[A-Z]{2}$/.test(rawState) ? rawState : "");
    const zip = text(p.postcode);
    if (
      text(p.countrycode).toUpperCase() !== "US" ||
      !house ||
      !road ||
      !city ||
      !state
    )
      continue;
    const street = `${house} ${road}`;
    const label = `${street}, ${city}, ${state}${zip ? ` ${zip}` : ""}`;
    const coordinates = feature.geometry?.coordinates;
    const lng = Number.isFinite(coordinates?.[0]) ? coordinates[0] : null;
    const lat = Number.isFinite(coordinates?.[1]) ? coordinates[1] : null;
    const key = `${street},${city},${state}`.toLowerCase();
    if (!suggestions.has(key))
      suggestions.set(key, { label, street, city, state, zip, lat, lng });
    if (suggestions.size === 5) break;
  }
  return [...suggestions.values()];
}

export function createAutocompleteProvider({
  fetchImpl = fetch,
  now = Date.now,
} = {}) {
  const cache = new Map(),
    inFlight = new Map();
  return async (query) => {
    const key = query.trim().toLowerCase();
    const cached = cache.get(key);
    if (cached?.expiresAt > now()) return cached.results;
    if (inFlight.has(key)) return inFlight.get(key);
    const pending = (async () => {
      let results = [];
      try {
        const url = new URL("https://photon.komoot.io/api/");
        url.search = new URLSearchParams({
          q: query.trim(),
          limit: "5",
          lang: "en",
          countrycode: "US",
          layer: "house",
        }).toString();
        const response = await fetchImpl(url, {
          signal: AbortSignal.timeout(5000),
        });
        if (response.ok) results = normalizeSuggestions(await response.json());
      } catch {
        /* Suggestions are optional; typed search remains available. */
      }
      for (const [queryKey, entry] of cache)
        if (entry.expiresAt <= now()) cache.delete(queryKey);
      if (cache.size >= 500) cache.delete(cache.keys().next().value);
      cache.set(key, { results, expiresAt: now() + 10 * 60 * 1000 });
      return results;
    })().finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  };
}
