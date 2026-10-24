export function listingSnapshot(listing = {}, detail = {}) {
  const merged = { ...listing, ...Object.fromEntries(Object.entries(detail).filter(([, v]) => v != null)) };
  const result = {};
  for (const key of ['id','address','price','beds','baths','sqft','stories','lotSizeSqft','yearBuilt','homeType','photoUrl','lat','lng','zillowUrl','redfinUrl','sources','roomDimensions']) result[key] = merged[key] ?? null;
  return result;
}
export function readSession(key, storage = globalThis.sessionStorage) {
  try { const value = JSON.parse(storage.getItem(key)); return value && Date.now() - value.at < 86400000 ? value.data : null; } catch { return null; }
}
export function writeSession(key, data, storage = globalThis.sessionStorage) {
  try { storage.setItem(key, JSON.stringify({ at: Date.now(), data })); return true; } catch { return false; }
}
export const snapshotKey = id => 'propertylens.home.' + id;
