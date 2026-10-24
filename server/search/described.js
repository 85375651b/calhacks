import { search } from './index.js';
import { validateExtras, filterRadius } from './spatial.js';
import { commuteSearch, candidateLimit } from './commute.js';
export function createDescribedSearch({ searchProvider = search, commute = commuteSearch } = {}) {
  return async function describedSearch(body, client = 'anonymous') {
    const extras = validateExtras(body?.extras);
    const result = await searchProvider(extras.commute ? { ...body.criteria, limit: candidateLimit() } : body.criteria);
    const spatial = filterRadius(result.listings, extras.radius);
    const checked = extras.commute ? await commute.start(spatial.listings, extras.commute, client, result.usingFixtures) : { listings: spatial.listings };
    return { ...result, ...checked, notes: [...result.notes, ...(extras.radius ? [`Straight-line radius: ${spatial.excluded} homes outside the radius; ${spatial.missingCoordinates} homes excluded because coordinates are unavailable.`] : [])] };
  };
}
export const describedSearch = createDescribedSearch();
