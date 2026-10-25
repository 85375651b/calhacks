import { visibleListings } from "./status.js";
import { randomUUID } from "node:crypto";
import { commuteBatch } from "../providers/commute.js";
import { haversineMiles, hasCoordinates } from "./spatial.js";
export const bounded = (value, fallback, max) =>
  Math.max(1, Math.min(max, Math.floor(Number(value) || fallback)));
export const candidateLimit = () =>
  bounded(process.env.COMMUTE_SEARCH_LIMIT, 30, 50);
export const verifyLimit = () =>
  bounded(process.env.COMMUTE_VERIFY_LIMIT, 8, 12);
export function pruneCommute(listings, constraint) {
  const located = listings
    .filter(hasCoordinates)
    .map((p) => ({
      ...p,
      workDistanceMiles: haversineMiles(p, constraint.work),
    }));
  const within = located
    .filter((p) => p.workDistanceMiles <= constraint.maxMinutes)
    .sort((a, b) => a.workDistanceMiles - b.workDistanceMiles);
  return {
    within,
    excluded: located.length - within.length,
    missing: listings.filter((p) => !hasCoordinates(p)),
  };
}
export function groupCommutes(rows, maxMinutes) {
  return {
    verified: rows.filter(
      (p) =>
        Number.isFinite(p.commute?.minutes) && p.commute.minutes <= maxMinutes,
    ),
    over: rows.filter(
      (p) =>
        Number.isFinite(p.commute?.minutes) && p.commute.minutes > maxMinutes,
    ),
    unchecked: rows.filter((p) => !Number.isFinite(p.commute?.minutes)),
  };
}
export function createCommuteSearch({
  batch = commuteBatch,
  now = Date.now,
  limit = verifyLimit,
} = {}) {
  const sessions = new Map(),
    active = new Set();
  function snapshot(s) {
    const groups = groupCommutes(s.rows, s.constraint.maxMinutes),
      checked = groups.verified.length + groups.over.length;
    return {
      listings: visibleListings(s.rows),
      commute: {
        token: s.token,
        maxMinutes: s.constraint.maxMinutes,
        departAt: s.constraint.departAt,
        totalWithin: s.totalWithin,
        checked,
        under: groups.verified.length,
        over: groups.over.length,
        unchecked: groups.unchecked.length,
        remaining: s.rows.filter(
          (p) => hasCoordinates(p) && !p.commute?.attempted,
        ).length,
        batchSize: limit(),
        excluded: s.excluded,
        missing: s.missing,
        error: s.error,
        usingFixtures: s.usingFixtures,
      },
    };
  }
  async function verify(s) {
    const selected = s.rows
      .filter((p) => hasCoordinates(p) && !p.commute?.attempted)
      .slice(0, bounded(limit(), 8, 12));
    if (!selected.length) return snapshot(s);
    let results;
    try {
      results = await batch(
        selected.map((p) => ({
          lat: p.lat,
          lng: p.lng,
          workLat: s.constraint.work.lat,
          workLng: s.constraint.work.lng,
          departAt: s.constraint.departAt,
        })),
      );
    } catch {
      results = selected.map(() => ({
        error:
          "Commute provider unavailable or hourly cap reached. Try again later.",
      }));
    }
    selected.forEach((p, i) => {
      const r = results[i] || { error: "No route returned" };
      p.commute = {
        ...r,
        attempted: true,
        departAt: s.constraint.departAt,
        maxMinutes: s.constraint.maxMinutes,
      };
      if (r.error) s.error = r.error;
    });
    return snapshot(s);
  }
  async function exclusive(client, fn) {
    if (active.has(client))
      throw new Error("A commute batch is already running for this browser.");
    active.add(client);
    try {
      return await fn();
    } finally {
      active.delete(client);
    }
  }
  return {
    start: (rows, constraint, client, usingFixtures = false) =>
      exclusive(client, async () => {
        for (const [k, s] of sessions) if (s.until <= now()) sessions.delete(k);
        if (sessions.size >= 300) sessions.delete(sessions.keys().next().value);
        const pruned = pruneCommute(rows, constraint);
        const s = {
          token: randomUUID(),
          client,
          constraint,
          rows: [
            ...pruned.within,
            ...pruned.missing.map((p) => ({
              ...p,
              commute: {
                error: usingFixtures
                  ? "Commute not verified (sample data)"
                  : "Coordinates unavailable",
                attempted: true,
              },
            })),
          ],
          totalWithin: pruned.within.length,
          excluded: pruned.excluded,
          missing: pruned.missing.length,
          until: now() + 3600000,
          error: null,
          usingFixtures,
        };
        sessions.set(s.token, s);
        return verify(s);
      }),
    more: (token, client) =>
      exclusive(client, async () => {
        const s = sessions.get(token);
        if (!s || s.client !== client || s.until <= now())
          throw new Error(
            "This commute search expired. Run your search again.",
          );
        return verify(s);
      }),
  };
}
export const commuteSearch = createCommuteSearch();
