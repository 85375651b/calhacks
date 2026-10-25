import { listingIdentity } from './common.js';
const bounded = (v, d, lo, hi) => typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.floor(v))) : d;
export function normalizeInput(value) {
    const input = value && typeof value === 'object' ? value : {};
    const jobs = [], byKey = new Map();
    const add = (address, listing, error) => {
        const key = address ? 'address:' + address.toLowerCase().replace(/\s+/g, ' ').trim() : listing ? listing.provider + ':' + listing.id : 'invalid:' + jobs.length;
        let job = byKey.get(key);
        if (!job) { job = { key, address: address || null, listings: [], error, index: jobs.length + 1 }; jobs.push(job); byKey.set(key, job); }
        if (listing && !job.listings.some((l) => l.provider === listing.provider && l.id === listing.id)) job.listings.push(listing);
    };
    const addresses = Array.isArray(input.addresses) ? input.addresses : typeof input.addresses === 'string' ? input.addresses.split(/\n|;/) : [];
    for (const raw of addresses) if (typeof raw === 'string' && raw.trim()) add(raw.trim());
    const urls = input.listingUrls ?? input.startUrls ?? [];
    for (const entry of Array.isArray(urls) ? urls : [urls]) {
        const raw = typeof entry === 'string' ? entry : entry?.url;
        const address = typeof entry?.address === 'string' ? entry.address.trim() : '';
        const listing = listingIdentity(raw);
        if (listing) add(address, listing);
        else add('', null, 'Provide a Zillow /homedetails/.../<id>_zpid/ or Redfin /.../home/<id> HTTPS URL.');
    }
    return {
        jobs: jobs.slice(0, 25), truncatedInputs: Math.max(0, jobs.length - 25),
        enabledSources: Array.isArray(input.enabledSources) ? input.enabledSources.filter((p) => ['zillow', 'redfin'].includes(p)) : ['zillow', 'redfin'],
        downloadImages: input.downloadImages !== false, useBrowserFallback: input.useBrowserFallback !== false,
        allowAddressSearch: input.allowAddressSearch !== false,
        maxImages: bounded(input.maxImagesPerListing, 50, 1, 200),
        maxConcurrency: bounded(input.maxConcurrency, 1, 1, 2),
        domainGapMs: bounded(input.minDomainDelaySecs, 3, 1, 30) * 1000,
        requestMs: bounded(input.requestTimeoutSecs, 15, 3, 45) * 1000,
        listingMs: bounded(input.perListingTimeoutSecs, 90, 10, 300) * 1000,
        searchMs: bounded(input.searchTimeoutSecs, 15, 3, 30) * 1000,
        runMs: bounded(input.maxRunSecs, 180, 15, 3600) * 1000,
        maxImageBytes: bounded(input.maxImageMbytes, 10, 1, 25) * 1024 * 1024,
        proxyConfiguration: input.proxyConfiguration ?? { useApifyProxy: true, apifyProxyGroups: ['RESIDENTIAL'] },
    };
}
