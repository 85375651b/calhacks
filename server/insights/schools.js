import { moduleHandler } from "./shared.js";
import { runActor } from "../providers/actor.js";
import { ACTORS } from "../config/apify.js";
import { siteUrl } from "../search/criteria.js";
import { photo, number, text } from "../search/listing.js";
export function normalizeSchools(row) {
  if (!row) throw new Error("No school data available for this listing");
  const schools = (row.nearbySchools || [])
    .filter((s) => s.type === "Public")
    .slice(0, 20)
    .map((s) => ({
      name: text(s.name),
      level: text(s.level),
      rating:
        typeof s.rating === "number" && s.rating >= 0 && s.rating <= 10
          ? s.rating
          : null,
      grades: text(s.grades),
      distance: number(s.distance),
    }));
  const ratings = schools.filter((s) => s.rating != null);
  return {
    source: "GreatSchools ratings in Zillow data via Apify",
    schools,
    average: ratings.length
      ? Math.round(
          (ratings.reduce((s, r) => s + r.rating, 0) / ratings.length) * 10,
        ) / 10
      : null,
    yearBuilt: number(row.yearBuilt),
    photos: (row.photos || []).map(photo).filter(Boolean).slice(0, 4),
    insuranceEstimate: null,
    note: schools.length
      ? "Nearby public schools; verify attendance boundaries and enrollment directly. Ratings are one limited measure."
      : "No school data available for this listing",
  };
}
export const schools = moduleHandler(
  "schools",
  (q) => {
    if (q.url && (typeof q.url !== "string" || q.url.length > 8000))
      throw new Error("Invalid Zillow URL");
    const url = siteUrl(q.url, "zillow");
    if (q.url && !url) throw new Error("Invalid Zillow URL");
    if (url && !/^\/homedetails\//.test(new URL(url).pathname))
      throw new Error("Use a Zillow property URL");
    const address =
      typeof q.address === "string" ? q.address.trim().slice(0, 300) : "";
    if (!url && !address) throw new Error("A property address is required");
    return { url, address };
  },
  async (p) =>
    normalizeSchools(
      (
        await runActor(ACTORS.schools, {
          ...(p.url
            ? { startUrls: [{ url: p.url }] }
            : { addresses: [p.address] }),
          maxResults: 1,
          includeDetails: true,
          compact: true,
        })
      )[0],
    ),
);
