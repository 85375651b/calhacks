import { createAutocompleteProvider } from "../providers/autocomplete.js";
import { config } from "../config.js";
import {
  interpretationFor,
  validPlace,
  partialCriteria,
  normalizeText,
} from "./nlParser.js";
const geocode = createAutocompleteProvider({ places: true });
// Explicit offline gazetteer. No fabricated geocoding for unknown places.
export const samplePlaces = [
  {
    label: "Los Angeles, CA",
    city: "Los Angeles",
    state: "CA",
    lat: 34.0522,
    lng: -118.2437,
  },
  {
    label: "Austin, TX",
    city: "Austin",
    state: "TX",
    lat: 30.2672,
    lng: -97.7431,
  },
  {
    label: "San Francisco, CA",
    city: "San Francisco",
    state: "CA",
    lat: 37.7749,
    lng: -122.4194,
  },
  {
    label: "San Jose, CA",
    city: "San Jose",
    state: "CA",
    lat: 37.3382,
    lng: -121.8863,
  },
  {
    label: "Seattle, WA",
    city: "Seattle",
    state: "WA",
    lat: 47.6062,
    lng: -122.3321,
  },
  {
    label: "Berkeley, CA",
    city: "Berkeley",
    state: "CA",
    lat: 37.8715,
    lng: -122.273,
  },
  {
    label: "Downtown Oakland, CA",
    city: "Oakland",
    state: "CA",
    lat: 37.8044,
    lng: -122.2712,
  },
  {
    label: "1 Market St, San Francisco, CA",
    city: "San Francisco",
    state: "CA",
    lat: 37.7936,
    lng: -122.3958,
  },
  {
    label: "Googleplex, Mountain View, CA",
    city: "Mountain View",
    state: "CA",
    lat: 37.422,
    lng: -122.0841,
  },
  {
    label: "UC Berkeley, Berkeley, CA",
    city: "Berkeley",
    state: "CA",
    lat: 37.8719,
    lng: -122.2585,
  },
  {
    label: "Portland, OR",
    city: "Portland",
    state: "OR",
    lat: 45.5152,
    lng: -122.6784,
  },
  {
    label: "Portland, ME",
    city: "Portland",
    state: "ME",
    lat: 43.6591,
    lng: -70.2568,
  },
  {
    label: "Springfield, IL",
    city: "Springfield",
    state: "IL",
    lat: 39.7817,
    lng: -89.6501,
  },
  {
    label: "Springfield, MA",
    city: "Springfield",
    state: "MA",
    lat: 42.1015,
    lng: -72.5898,
  },
  { label: "78704", city: "Austin", state: "TX", lat: 30.2457, lng: -97.7688 },
];
const publicPlace = (p) => ({ label: p.label, lat: p.lat, lng: p.lng });
export function createPlaceResolver({
  provider = geocode,
  fixtureMode = () => config.useFixtures,
} = {}) {
  async function candidates(text) {
    if (!text) return [];
    if (!fixtureMode())
      return (await provider(text)).filter(validPlace).slice(0, 5);
    const q = normalizeText(text);
    const exact = samplePlaces.filter((p) => normalizeText(p.label) === q);
    if (exact.length) return exact;
    return samplePlaces
      .filter((p) => normalizeText(p.label).startsWith(q + ","))
      .slice(0, 5);
  }
  return async function resolve(parsed, selection) {
    const p = structuredClone(parsed);
    p.questions = [];
    for (const field of ["location", "work", "radius"]) {
      const extra =
        field === "work"
          ? p.extras.commute
          : field === "radius"
            ? p.extras.radius
            : null;
      if (field !== "location" && !extra) continue;
      const coordKey = field === "work" ? "work" : "center";
      if (extra?.[coordKey] && selection?.field !== field) continue;
      let text =
        field === "location"
          ? p.criteria.location
          : field === "work"
            ? extra.workText
            : extra.centerText;
      let hit, hits;
      if (selection?.field === field) {
        if (typeof selection.choice === "string")
          text = selection.choice.trim().slice(0, 150);
        else if (validPlace(selection.choice)) {
          // A selection must be one of the offered candidates, never an arbitrary coordinate injection.
          const offered =
            parsed.questions?.find((q) => q.field === field)?.options || [];
          hit = offered.find(
            (v) =>
              v.label === selection.choice.label &&
              v.lat === selection.choice.lat &&
              v.lng === selection.choice.lng,
          );
          if (!hit)
            throw new Error(
              "Invalid place selection. Choose an offered place.",
            );
        } else throw new Error("Invalid place selection.");
      }
      if (!hit) {
        hits = await candidates(text);
        const cities = new Set(hits.map((v) => `${v.city}, ${v.state}`));
        const namedAddress = /\d+\s+\w|googleplex|uc berkeley/i.test(text);
        const qualified = /,\s*[a-z]{2}\b|^\d{5}$/i.test(text);
        const knownAmbiguous = /^(portland|springfield)$/i.test(text.trim());
        if (
          hits.length &&
          (namedAddress ||
            qualified ||
            (!knownAmbiguous &&
              (field === "location" ? cities.size === 1 : hits.length === 1)))
        )
          hit = hits[0];
      }
      if (!hit) {
        p.questions.push({
          field,
          message: !text
            ? field === "work"
              ? "What is your work address?"
              : "Which city, state or ZIP should we search?"
            : hits?.length
              ? `Which ${text} did you mean?`
              : `Could not find “${text}”. Enter a city and state or full US address.`,
          options: (hits || []).map(publicPlace),
        });
        continue;
      }
      if (field === "location") {
        p.criteria.location = /^\d{5}$/.test(text)
          ? text
          : hit.city && hit.state
            ? `${hit.city}, ${hit.state}`
            : hit.label;
        if (hit.label !== p.criteria.location)
          p.assumptions.push(
            `Search area resolved from ${hit.label} to ${p.criteria.location}.`,
          );
      } else {
        extra[coordKey] = publicPlace(hit);
        if (field === "work") extra.workText = hit.label;
        else extra.centerText = hit.label;
      }
    }
    p.criteria = partialCriteria(p.criteria);
    if (fixtureMode())
      p.assumptions = [
        ...new Set([
          ...p.assumptions,
          "Sample place coordinates used in offline mode; listings are saved Austin homes, independent of your location.",
        ]),
      ];
    p.interpretation = interpretationFor(p.criteria, p.extras);
    return p;
  };
}
export const resolvePlaces = createPlaceResolver();
