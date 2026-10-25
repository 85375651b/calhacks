import {
  createPlacesProvider,
  STATE_CODES,
} from "../providers/autocomplete.js";
import { config } from "../config.js";
import {
  interpretationFor,
  validPlace,
  partialCriteria,
  normalizeText,
  editDistance,
} from "./nlParser.js";
import cities from "./data/topCities.json" with { type: "json" };
import aliases from "./data/placeAliases.json" with { type: "json" };
import fixtures from "../fixtures/places.json" with { type: "json" };
import { legacySamples } from "./data/legacyPlaces.js";

export const samplePlaces = [...legacySamples, ...fixtures, ...cities].filter(
  (p, i, a) => a.findIndex((x) => x.label === p.label) === i,
);
const publicPlace = (p) => ({ label: p.label, lat: p.lat, lng: p.lng });
const clean = (s) =>
  normalizeText(s).replace(/[,]+/g, " ").replace(/\s+/g, " ").trim();
const escapeRE = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const stateCode = (text) =>
  STATE_CODES[clean(text)] ||
  Object.values(STATE_CODES).find((v) => v.toLowerCase() === clean(text));
const names = [
  ...Object.keys(aliases),
  ...new Set(samplePlaces.flatMap((p) => [p.label, p.city]).filter(Boolean)),
].sort((a, b) => b.length - a.length);
const placeProvider = createPlacesProvider(),
  addressProvider = createPlacesProvider({ administrativeOnly: false });

export function generatePlaceCandidates(parsed) {
  const runs = parsed.leftover?.length
    ? parsed.leftover
    : parsed.criteria.location
      ? [{ text: parsed.criteria.location, start: 0, end: 0 }]
      : [];
  return [...runs].sort((a, b) => b.text.length - a.text.length).slice(0, 3);
}
function builtIn(query) {
  const q = clean(query),
    alias = aliases[q];
  if (alias?.region)
    return {
      method: "alias",
      region: alias.region
        .map((label) => samplePlaces.find((p) => p.label === label))
        .filter(Boolean),
    };
  if (alias) {
    const base = samplePlaces.find((p) => p.label === alias.place);
    return {
      method: "alias",
      hits: base
        ? [{ ...base, ...alias, label: alias.label || base.label }]
        : [],
    };
  }
  if (/^\d{5}$/.test(q) && !samplePlaces.some((p) => p.label === q))
    return { method: "zip", hits: [{ label: q, zip: q }] };
  const exact = samplePlaces.filter((p) => clean(p.label) === q);
  const hits = exact.length
    ? exact
    : samplePlaces.filter(
        (p) =>
          p.label === `${p.city}, ${p.state}` &&
          (clean(p.city || "") === q ||
            clean(
              `${p.city} ${Object.keys(STATE_CODES).find((k) => STATE_CODES[k] === p.state) || ""}`,
            ) === q),
      );
  if (hits.length) return { method: "built-in", hits: hits.slice(0, 5) };
  const named = legacySamples.filter(
    (p) =>
      clean(p.label).startsWith(q + " ") &&
      /\d|googleplex|uc berkeley/i.test(q),
  );
  if (named.length) return { method: "built-in", hits: named };
  if (stateCode(q)) return { method: "state", state: stateCode(q), hits: [] };
  const qualified = q.match(/^(.*?)\s+([a-z]{2}|[a-z]+(?: [a-z]+)?)$/),
    hint = qualified && stateCode(qualified[2]),
    cityText = hint ? qualified[1] : q;
  const distances = [
    ...new Set(samplePlaces.map((p) => p.city).filter(Boolean)),
  ]
    .map((city) => ({ city, d: editDistance(cityText, clean(city)) }))
    .filter(
      (v) =>
        cityText.length >= 5 &&
        v.d <= (cityText.length >= 10 ? 2 : 1) &&
        (!hint ||
          samplePlaces.some((p) => p.city === v.city && p.state === hint)),
    )
    .sort((a, b) => a.d - b.d);
  if (distances.length && (!distances[1] || distances[0].d < distances[1].d))
    return {
      method: "city-spelling",
      correction: distances[0].city,
      hits: samplePlaces
        .filter(
          (p) =>
            p.city === distances[0].city &&
            p.label === `${p.city}, ${p.state}` &&
            (!hint || p.state === hint),
        )
        .slice(0, 5),
    };
  return null;
}
function splitKnown(run) {
  if (builtIn(run.text)) return [{ ...run }];
  const occupied = [],
    matches = [];
  for (const name of names)
    for (const m of run.text.matchAll(
      new RegExp("(?<![a-z0-9])" + escapeRE(name) + "(?![a-z0-9])", "gi"),
    )) {
      if (occupied.some(([a, b]) => m.index < b && m.index + m[0].length > a))
        continue;
      let end = m.index + m[0].length;
      // Keep an explicit state attached to a city match.
      const tail = run.text
        .slice(end)
        .match(/^,?\s+([a-z]{2}|[a-z]+(?: [a-z]+)?)$/i);
      if (tail && stateCode(tail[1])) end = run.text.length;
      occupied.push([m.index, end]);
      matches.push({
        ...run,
        text: run.text.slice(m.index, end),
        start: run.start + m.index,
        end: run.start + end,
        localStart: m.index,
        localEnd: end,
      });
    }
  return matches.length ? matches : [{ ...run }];
}
export function createPlaceResolver({
  provider = placeProvider,
  addressGeocoder = addressProvider,
  fixtureMode = () => config.useFixtures,
  now = Date.now,
} = {}) {
  return async function resolve(parsed, selection, context = {}) {
    if (parsed.intent === "address") return structuredClone(parsed);
    if (parsed.placesResolved && !selection) return structuredClone(parsed);
    const p = structuredClone(parsed),
      budget = context.budget || { calls: 0, deadline: now() + 2200 };
    const trace = [],
      questions = [],
      unrecognized = [],
      hits = [],
      regions = [];
    p.assumptions = p.assumptions || [];
    p.understood = p.understood || [];
    const lookup = async (text, field = "location") => {
      let found = builtIn(text);
      if (
        !found &&
        !fixtureMode() &&
        budget.calls < 3 &&
        now() < budget.deadline
      ) {
        const before = budget.calls;
        // Custom providers are one bounded request. Default providers account for fallback requests themselves.
        const call = field === "location" ? provider : addressGeocoder;
        let timer;
        try {
          const values = await Promise.race([
            call(text, budget),
            new Promise((resolve) => {
              timer = setTimeout(
                () => resolve([]),
                Math.max(1, budget.deadline - now()),
              );
            }),
          ]);
          found = {
            method: "geocoder",
            hits: (values || []).filter(validPlace).slice(0, 5),
          };
        } catch {
          found = { method: "geocoder", hits: [] };
        } finally {
          clearTimeout(timer);
        }
        if (budget.calls === before) budget.calls++;
      }
      found ||= {
        method: fixtureMode() ? "offline-miss" : "unresolved",
        hits: [],
      };
      trace.push({
        text,
        field,
        method: found.method,
        candidates: (found.hits || found.region || []).map(publicPlace),
        ...(found.correction ? { correction: found.correction } : {}),
      });
      return found;
    };
    let chosen;
    if (selection?.field === "location") {
      if (typeof selection.choice === "string")
        chosen = selection.choice.trim().slice(0, 150);
      else {
        const offered =
          parsed.questions?.find((q) => q.field === "location")?.options || [];
        const hit = offered.find(
          (v) =>
            validPlace(selection.choice) &&
            v.label === selection.choice.label &&
            v.lat === selection.choice.lat &&
            v.lng === selection.choice.lng,
        );
        if (!hit)
          throw Error("Invalid place selection. Choose an offered place.");
        chosen = hit.label;
      }
    }
    const runs = chosen
      ? [{ text: chosen, start: 0, end: 0, selected: true }]
      : generatePlaceCandidates(p);
    // Existing resolved location is retained when clarifying work or radius.
    if (selection && selection.field !== "location" && p.criteria.location)
      hits.push({
        label: p.criteria.location,
        city: p.criteria.location.split(",")[0],
        state: p.criteria.location.split(",")[1]?.trim(),
      });
    else
      for (const run of runs) {
        const matched = [];
        for (const candidate of splitKnown(run).slice(0, 3)) {
          const result = await lookup(
            candidate.text,
            candidate.relation === "near" && !builtIn(candidate.text)
              ? "landmark"
              : "location",
          );
          if (result.region) {
            regions.push({ text: candidate.text, options: result.region });
            matched.push(candidate);
            continue;
          }
          if (result.state) {
            questions.push({
              field: "location",
              message: `${candidate.text} is a broad area. Which city should I search?`,
              options: samplePlaces
                .filter((v) => v.state === result.state && !/\d/.test(v.label))
                .slice(0, 5)
                .map(publicPlace),
            });
            matched.push(candidate);
            continue;
          }
          if (result.hits?.length) {
            const unique = result.hits.filter(
              (v, i, a) => a.findIndex((x) => x.label === v.label) === i,
            );
            if (unique.length > 1) {
              questions.push({
                field: "location",
                message: `Which ${candidate.text} did you mean?`,
                options: unique.map(publicPlace),
              });
            } else
              hits.push({
                ...unique[0],
                raw: candidate.text,
                relation: candidate.relation,
                ...(candidate.relation === "near" &&
                result.method === "geocoder" &&
                !["city", "town", "county", "district", "postcode"].includes(
                  unique[0].resultType,
                )
                  ? { landmark: true }
                  : {}),
              });
            matched.push(candidate);
            if (!candidate.selected) {
              p.understood.push({
                start: candidate.start,
                end: candidate.end,
                text: candidate.text,
                kind: "location",
                confidence: result.correction ? 0.9 : 1,
              });
            }
            if (result.correction)
              p.assumptions.push(
                `Read '${candidate.text}' as ${unique[0].label}. Choose another place below if that is not right.`,
              );
          }
        }
        if (!chosen) {
          let remainder = run.text;
          for (const m of matched.sort(
            (a, b) => (b.localStart || 0) - (a.localStart || 0),
          )) {
            const start = m.localStart || 0,
              end = m.localEnd ?? run.text.length;
            remainder =
              remainder.slice(0, start) +
              " ".repeat(end - start) +
              remainder.slice(end);
          }
          const unknown = remainder.trim().replace(/^[,\s]+|[,\s]+$/g, "");
          if (unknown)
            unrecognized.push({
              text: unknown,
              suggestions: [
                "Search it as a keyword",
                "Ignore it",
                "Edit in filters",
              ],
            });
        }
      }
    // A ZIP is sufficient as a search area, even when no centroid is available offline.
    if (!hits.length && runs.length === 1 && /^\d{5}$/.test(runs[0].text)) {
      hits.push({ label: runs[0].text, zip: runs[0].text });
      unrecognized.length = 0;
      trace.push({
        text: runs[0].text,
        method: "zip",
        field: "location",
        candidates: [],
      });
    }
    const distinct = hits.filter(
      (v, i, a) => a.findIndex((x) => x.label === v.label) === i,
    );
    if (regions.length)
      questions.push({
        field: "location",
        message: `Which city in ${regions[0].text} should I search?`,
        options: regions[0].options.map(publicPlace),
      });
    else if (distinct.length > 1)
      questions.push({
        field: "location",
        message: "You mentioned more than one place. Which should I search?",
        options: distinct.filter(validPlace).slice(0, 5).map(publicPlace),
      });
    if (
      distinct.length === 1 &&
      !questions.some((q) => q.field === "location")
    ) {
      const hit = distinct[0];
      p.criteria.location = /^\d{5}$/.test(hit.label)
        ? hit.label
        : hit.city && hit.state
          ? `${hit.city}, ${hit.state}`
          : hit.label;
      p.locationPlace = validPlace(hit) ? publicPlace(hit) : null;
      if (hit.landmark && !p.extras.radius) {
        p.extras.radius = {
          miles: 5,
          centerText: hit.label,
          center: publicPlace(hit),
        };
        p.assumptions.push(
          `Searching within 5 miles of ${hit.label}; the listing search area is ${p.criteria.location}.`,
        );
      } else if (hit.label !== p.criteria.location)
        p.assumptions.push(
          `Search area resolved from ${hit.label} to ${p.criteria.location}.`,
        );
    } else {
      p.criteria.location = "";
      if (!questions.some((q) => q.field === "location")) {
        const options = [];
        if (context.lastLocation) {
          const last = builtIn(context.lastLocation)?.hits;
          if (last?.length === 1) options.push(publicPlace(last[0]));
        }
        if (validPlace(context.savedWork)) {
          const city = samplePlaces.find((v) =>
            clean(context.savedWork.label).includes(clean(v.city || v.label)),
          );
          if (city && !options.some((v) => v.label === city.label))
            options.push(publicPlace(city));
        }
        questions.push({
          field: "location",
          message: "Where should I search?",
          options,
        });
      }
    }
    for (const field of ["work", "radius"]) {
      const extra = field === "work" ? p.extras.commute : p.extras.radius;
      if (!extra) continue;
      const coordKey = field === "work" ? "work" : "center",
        textKey = field === "work" ? "workText" : "centerText";
      if (extra[coordKey] && selection?.field !== field) continue;
      let query = extra[textKey],
        hit;
      if (selection?.field === field) {
        if (typeof selection.choice === "string")
          query = selection.choice.trim().slice(0, 150);
        else {
          const offered =
            parsed.questions?.find((q) => q.field === field)?.options || [];
          hit = offered.find(
            (v) =>
              validPlace(selection.choice) &&
              v.label === selection.choice.label &&
              v.lat === selection.choice.lat &&
              v.lng === selection.choice.lng,
          );
          if (!hit) throw Error("Invalid place selection.");
        }
      }
      if (!hit && query) {
        const result = await lookup(query, field);
        if (result.hits?.length === 1) hit = result.hits[0];
        else
          questions.push({
            field,
            message: `Which ${query} did you mean?`,
            options: (result.hits || []).map(publicPlace),
          });
      }
      if (hit && validPlace(hit)) {
        extra[coordKey] = publicPlace(hit);
        extra[textKey] = hit.label;
      } else if (!questions.some((q) => q.field === field))
        questions.push({
          field,
          message:
            field === "work"
              ? "What is your work address?"
              : "Where should the radius be centered?",
          options: [],
        });
    }
    p.questions = questions.filter(
      (v, i, a) => a.findIndex((q) => q.field === v.field) === i,
    );
    p.unrecognized = chosen
      ? p.unrecognized || []
      : [
          ...unrecognized,
          ...(p.leftover || [])
            .filter(
              (run) =>
                !runs.includes(run) && !runs.some((r) => r.text === run.text),
            )
            .map((run) => ({
              text: run.text,
              suggestions: [
                "Search it as a keyword",
                "Ignore it",
                "Edit in filters",
              ],
            })),
        ];
    p.placeTrace = trace;
    p.placesResolved = true;
    p.criteria = partialCriteria(p.criteria);
    if (fixtureMode())
      p.assumptions.push(
        "Offline mode uses saved place coordinates; listing fixtures are Austin homes regardless of search area.",
      );
    p.assumptions = [...new Set(p.assumptions)];
    p.interpretation = interpretationFor(p.criteria, p.extras);
    p.tokens = p.tokens?.map((t) => ({
      ...t,
      kind:
        p.understood.find(
          (s) => s.kind === "location" && s.start <= t.start && s.end >= t.end,
        )?.kind || t.kind,
    }));
    return p;
  };
}
export const resolvePlaces = createPlaceResolver();
