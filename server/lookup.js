import { readFile } from 'node:fs/promises';
import { normalizeProperty } from './normalize.js';
import { normalizeAddress } from './cache.js';
import { LookupError } from './errors.js';

function validateAddress(address) {
  if (typeof address !== 'string' || !address.trim() || address.length > 300 || /[\x00-\x1f]/.test(address)) {
    throw new LookupError(400, 'INVALID_ADDRESS', 'Enter a US street address, including city and state (up to 300 characters).');
  }
  return address.trim().replace(/\s+/g, ' ');
}

export async function loadFixtures() {
  const read = async name => JSON.parse(await readFile(new URL(`./fixtures/${name}.json`, import.meta.url), 'utf8'));
  const [avm, listings, properties, metadata] = await Promise.all(['avm', 'listings', 'properties', 'metadata'].map(read));
  return { avm, listings, properties, metadata };
}

export function createLookup({ request, cache, useFixtures = false, fixtures }) {
  const inFlight = new Map();
  let cooldown = null;
  async function fetchProperty(address) {
    const [avmResult, listingResult] = await Promise.allSettled([
      request('/avm/value', address),
      request('/listings/sale', address, { status: 'Active' }),
    ]);
    const failures = [avmResult, listingResult].filter(result => result.status === 'rejected');
    if (failures.length) {
      const failure = failures.find(result => result.reason.status === 429)?.reason || failures[0].reason;
      // Avoid duplicate charges from automatic UI retries or multiple tabs during provider failures.
      if ([429, 503].includes(failure.status)) cooldown = { error: failure, until: Date.now() + 30000 };
      throw failure;
    }
    const avm = avmResult.value;
    const listings = listingResult.value;
    if (avm !== null && (typeof avm !== 'object' || Array.isArray(avm)) || listings !== null && !Array.isArray(listings)) {
      throw new LookupError(502, 'UPSTREAM_ERROR', 'The property data service returned an unexpected response.');
    }
    let properties = null;
    const sources = ['RentCast sale listings']; // Used to establish active/not-listed status, even for an empty result.
    if (avm) sources.push('RentCast AVM');
    if (!avm?.subjectProperty?.formattedAddress) {
      properties = await request('/properties', address);
      if (Array.isArray(properties) && properties.length) sources.unshift('RentCast property records');
    }
    const hasProperty = avm?.subjectProperty?.formattedAddress || avm?.price != null || properties?.length || listings?.some(item => item.status === 'Active');
    if (!hasProperty) throw new LookupError(404, 'NOT_FOUND', 'No property records were found for that address. Check the spelling and include the ZIP code.');
    return normalizeProperty({ address, avm, listings, properties, sources });
  }
  return async rawAddress => {
    const address = validateAddress(rawAddress);
    if (useFixtures) {
      // Fixture address is preserved so saved data is never presented as a match to arbitrary input.
      return normalizeProperty({ ...fixtures, address: fixtures.metadata.address, sources: ['RentCast sale listings', 'RentCast AVM'], sampleData: true });
    }
    const cached = await cache.get(address);
    if (cached) return cached;
    const key = normalizeAddress(address);
    if (inFlight.has(key)) return inFlight.get(key);
    if (cooldown?.until > Date.now()) throw cooldown.error;
    const pending = fetchProperty(address).then(async result => { await cache.set(address, result); return result; }).finally(() => inFlight.delete(key));
    inFlight.set(key, pending);
    return pending;
  };
}
