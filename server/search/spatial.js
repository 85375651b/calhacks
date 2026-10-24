import { validPlace } from './nlParser.js';
export function haversineMiles(a, b) {
  const rad = n => n * Math.PI / 180;
  const v = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 3958.7613 * 2 * Math.asin(Math.sqrt(Math.min(1, v)));
}
export const hasCoordinates = p => Number.isFinite(p.lat) && Math.abs(p.lat) <= 90 && Number.isFinite(p.lng) && Math.abs(p.lng) <= 180;
export function validateExtras(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(k => !['commute','radius','insights','sort'].includes(k))) throw new Error('Invalid search extras');
  const extras = { commute: null, radius: null };
  if (input.radius) {
    const r = input.radius;
    if (!Number.isFinite(r.miles) || r.miles <= 0 || !validPlace(r.center)) throw new Error('Invalid radius: resolve its center first.');
    extras.radius = { miles: Math.min(200, r.miles), center: r.center };
  }
  if (input.commute) {
    const c = input.commute;
    if (!Number.isFinite(c.maxMinutes) || c.maxMinutes <= 0 || !validPlace(c.work)) throw new Error('Invalid commute: resolve your work address first.');
    extras.commute = { maxMinutes: Math.min(180, c.maxMinutes), work: c.work, departAt: /^([01]\d|2[0-3]):[0-5]\d$/.test(c.departAt) ? c.departAt : '08:00' };
  }
  return extras;
}
export function filterRadius(listings, radius) {
  if (!radius) return { listings, excluded: 0, missingCoordinates: 0 };
  const located = listings.filter(hasCoordinates).map(p => ({ ...p, distanceMiles: Math.round(haversineMiles(p, radius.center) * 10) / 10 }));
  const within = located.filter(p => haversineMiles(p, radius.center) <= radius.miles);
  return { listings: within, excluded: located.length - within.length, missingCoordinates: listings.length - located.length };
}
