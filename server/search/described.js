import { search } from './index.js';
import { validateExtras, filterRadius } from './spatial.js';
export function createDescribedSearch({ searchProvider = search } = {}) {
  return async function describedSearch(body) {
    const extras = validateExtras(body?.extras);
    const result = await searchProvider(body.criteria);
    const spatial = filterRadius(result.listings, extras.radius);
    return { ...result, listings: spatial.listings, notes: [...result.notes, ...(extras.radius ? [`Straight-line radius: ${spatial.excluded} homes outside the radius; ${spatial.missingCoordinates} homes excluded because coordinates are unavailable.`] : [])] };
  };
}
export const describedSearch = createDescribedSearch();
