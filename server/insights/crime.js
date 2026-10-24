import { moduleHandler } from "./shared.js";
import { runActor } from "../providers/actor.js";
import { ACTORS, CRIME_ACTOR_BUILD } from "../config/apify.js";

export function crimeInput(q) {
  let address = typeof q.address === "string" ? q.address.trim() : "";
  // Older clients send the ZIP as a separate comma-delimited component.
  address = address.replace(/,\s*([A-Za-z]{2}),\s*(\d{5})(?:-\d{4})?$/, ", $1 $2");
  if (address && !address.includes(",") && typeof q.city === "string" && typeof q.state === "string")
    address = [address, q.city.trim(), [q.state.trim(), q.zip].filter(Boolean).join(" ")].join(", ");
  const parts = address.split(",").map((s) => s.trim());
  if (address.length > 500 || parts.length < 3 || parts.some((s) => !s) ||
      !/^[A-Za-z]{2}(?:\s+\d{5}(?:-\d{4})?)?$/.test(parts.at(-1)))
    throw new Error("A full address with street, city, and state is required");
  return { address };
}

const numeric = (v) => typeof v === "number" && Number.isFinite(v) && v >= 0 ? v : null;
export function normalizeCrime(row) {
  if (row?.type !== "address-safety-score" || numeric(row.safetyScore) === null || row.safetyScore > 10)
    throw new Error("Crime data unavailable for this area");
  return {
    source: "Neighborhood Crime Safety via Apify · SpotCrime",
    actorBuild: CRIME_ACTOR_BUILD,
    area: [row.city, row.state].filter(Boolean).join(", ") || null,
    safetyScore: row.safetyScore,
    violentPer100k: numeric(row.violentPer100k),
    population: numeric(row.population),
    nationalGrade: typeof row.nationalGrade === "string" ? row.nationalGrade : null,
    stateGrade: typeof row.stateGrade === "string" ? row.stateGrade : null,
    latestYear: row.latestYear == null ? null : String(row.latestYear),
    note: [typeof row.scoreNote === "string" ? row.scoreNote : "City-level statistics.",
      "City-level data, not a street-level assessment or a prediction of individual safety."].join(" "),
  };
}

export async function loadCrime(params, runner = runActor) {
  try {
    const rows = await runner(ACTORS.crime, crimeInput(params), { build: CRIME_ACTOR_BUILD });
    return normalizeCrime(rows.find((row) => row?.type === "address-safety-score"));
  } catch (e) {
    throw new Error(e.message === "Data temporarily limited" ? e.message : "Crime data unavailable for this area");
  }
}

export const crime = moduleHandler(
  "crime",
  (q) => ({ ...crimeInput(q), zip: q.zip, actor: ACTORS.crime, build: CRIME_ACTOR_BUILD }),
  loadCrime,
);
