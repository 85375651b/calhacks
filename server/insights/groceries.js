import { moduleHandler, coords } from "./shared.js";
import { runActor } from "../providers/actor.js";
import { ACTORS } from "../config/apify.js";
export function haversine(a, b) {
  const rad = (x) => (x * Math.PI) / 180,
    dlat = rad(b.lat - a.lat),
    dlng = rad(b.lng - a.lng);
  return (
    3958.7613 *
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin(dlat / 2) ** 2 +
          Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dlng / 2) ** 2,
      ),
    )
  );
}
const GROCERY_PATTERN = /grocery|supermarket|food market|produce|greengrocer/i;
export async function groceryProvider(p) {
  const items = await runActor(
    ACTORS.groceries,
    {
      searchStringsArray: ["grocery store"],
      customGeolocation: {
        type: "Point",
        coordinates: [p.lng, p.lat],
        radiusKm: 5,
      },
      maxCrawledPlacesPerSearch: 20,
      language: "en",
      skipClosedPlaces: true,
      scrapePlaceDetailPage: false,
    },
    { limit: 20 },
  );
  const seen = new Set();
  const rows = items
    .map((r) => {
      const lat = Number(r.location?.lat),
        lng = Number(r.location?.lng),
        categories = [r.categoryName, ...(r.categories || [])].filter(Boolean);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if (r.permanentlyClosed || r.temporarilyClosed) return null;
      if (categories.length && !categories.some((c) => GROCERY_PATTERN.test(c)))
        return null;
      return {
        name: r.title || "Unnamed grocery store",
        brand: null,
        address: r.address || null,
        miles: Math.round(haversine(p, { lat, lng }) * 100) / 100,
        lat,
        lng,
        rating: Number.isFinite(r.totalScore) ? r.totalScore : null,
        url: r.url || null,
      };
    })
    .filter((r) => {
      if (!r) return false;
      const k = r.name.toLowerCase() + r.lat.toFixed(3) + r.lng.toFixed(3);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  if (!rows.length) throw new Error("No grocery stores found nearby");
  return {
    source: "Google Maps via Apify",
    stores: rows.sort((a, b) => a.miles - b.miles).slice(0, 5),
    note: "Distances are straight-line miles, not driving or walking routes.",
  };
}
export const groceries = moduleHandler(
  "groceries",
  (q) => {
    const p = coords(q);
    return { lat: Number(p.lat.toFixed(3)), lng: Number(p.lng.toFixed(3)) };
  },
  groceryProvider,
  { ttl: 7 * 86400000 },
);
