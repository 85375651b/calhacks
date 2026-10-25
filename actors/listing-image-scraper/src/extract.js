import { load } from 'cheerio';
import { canonicalPhoto, imageUrl, listingIdentity } from './common.js';
import { matchesAddress, objectAddress } from './address.js';

const EXCLUDE = /similar|recommend|nearby|related|comparable|agent|broker|school|map|owner|advert/i;
const GALLERY = /^(responsivePhotos|photos|photoUrls|gallery|galleryImages|propertyPhotos|listingPhotos|image|images)$/i;
function variants(node, base, hint = '', out = [], depth = 0) {
    if (!node || depth > 10) return out;
    if (typeof node === 'string') {
        const url = imageUrl(node, base);
        if (url) out.push({ url, quality: /thumb|small/i.test(hint) ? 100 : /fullScreen|original|large|highRes/i.test(hint) ? 2500 : /bigphoto/i.test(url) ? 1800 : 500 });
        return out;
    }
    if (Array.isArray(node)) { for (const child of node) variants(child, base, hint, out, depth + 1); return out; }
    if (typeof node !== 'object') return out;
    const width = Number(node.width ?? node.w), height = Number(node.height ?? node.h);
    for (const [key, value] of Object.entries(node)) {
        if (EXCLUDE.test(key)) continue;
        const previous = out.length;
        variants(value, base, key, out, depth + 1);
        if (Number.isFinite(width) && width > 0) for (const item of out.slice(previous)) Object.assign(item, { width, height: Number.isFinite(height) ? height : null, quality: width });
    }
    return out;
}
function photoEntries(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
        if (Array.isArray(value.photoUrls)) return value.photoUrls;
        if (Array.isArray(value.photos)) return value.photos;
        const values = Object.values(value);
        if (values.length && values.every((v) => v && typeof v === 'object' && !Array.isArray(v))) return values;
    }
    return [value];
}
export function extractListing({ html, url, expectedAddress = null, networkJson = [] }) {
    const identity = listingIdentity(url);
    if (!identity) return { status: 'address_mismatch', reason: 'Page redirected away from a supported property detail URL.', images: [] };
    const $ = load(html);
    const canonical = $('link[rel="canonical"]').attr('href');
    const canonicalIdentity = canonical && listingIdentity(new URL(canonical, url).href);
    if (canonicalIdentity && (canonicalIdentity.id !== identity.id || canonicalIdentity.provider !== identity.provider))
        return { status: 'address_mismatch', reason: 'Canonical property ID differs from the requested listing.', images: [] };
    const documents = [...networkJson];
    $('script').each((_, element) => {
        const script = $(element), text = script.text().trim();
        if (text.length > 8 * 1024 * 1024 || !text) return;
        if (/json/i.test(script.attr('type') ?? '') || /^[{[]/.test(text)) {
            try { documents.push(JSON.parse(text)); } catch { /* No evaluation of executable scripts. */ }
        }
    });
    const records = [], seen = new WeakSet();
    let visits = 0;
    function scan(value, depth = 0, key = '') {
        if (!value || depth > 18 || ++visits > 100000) return;
        if (typeof value === 'string') {
            if (/gdpClientCache|initialState|preloaded|data|payload/i.test(key) && value.length < 8 * 1024 * 1024 && /^[{[]/.test(value.trim()))
                try { scan(JSON.parse(value), depth + 1); } catch { /* Ignore non-JSON cache entries. */ }
            return;
        }
        if (typeof value !== 'object' || seen.has(value)) return;
        seen.add(value);
        if (Array.isArray(value)) { for (const item of value) scan(item, depth + 1); return; }
        const id = identity.provider === 'zillow' ? value.zpid : value.propertyId ?? value.homeId;
        if (id != null && String(id) !== identity.id) return;
        const address = objectAddress(value);
        const types = [value['@type']].flat().map(String).join(' ');
        if ((id != null && String(id) === identity.id) || (/Residence|House|Apartment|RealEstateListing/.test(types) && address)) {
            records.push({ value, address });
            // A matching outer record may contain another JSON-encoded gallery cache.
            // Continue into it; matching the ID alone does not mean the gallery is here.
        }
        for (const [childKey, child] of Object.entries(value)) if (!EXCLUDE.test(childKey)) scan(child, depth + 1, childKey);
    }
    documents.forEach((doc) => scan(doc));
    const domAddresses = [];
    $('title, h1, [data-testid="home-details-summary-headline"], .homeAddress').each((_, element) => {
        domAddresses.push($(element).text().replace(/\s+/g, ' ').trim());
        if (element.tagName === 'h1') domAddresses.push($(element).text() + ', ' + $(element).next().text());
    });
    const propertyAddresses = records.map((r) => r.address).filter(Boolean);
    const address = propertyAddresses.find((a) => !expectedAddress || matchesAddress(expectedAddress, a))
        ?? domAddresses.find((a) => expectedAddress && matchesAddress(expectedAddress, a)) ?? null;
    if (expectedAddress && (!address || propertyAddresses.some((a) => !matchesAddress(expectedAddress, a))))
        return { status: propertyAddresses.some((a) => !matchesAddress(expectedAddress, a)) ? 'address_mismatch' : 'unverified',
            reason: 'Could not verify the requested street, unit, city and state on this property.', images: [], provider: identity.provider, propertyId: identity.id };
    const photos = [];
    function add(entry, provenance) {
        const best = variants(entry, url).sort((a, b) => b.quality - a.quality)[0];
        if (best) photos.push({ ...best, caption: typeof entry?.caption === 'string' ? entry.caption : typeof entry?.description === 'string' ? entry.description : null, provenance });
    }
    function galleries(value, depth = 0) {
        if (!value || depth > 12 || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
            if (EXCLUDE.test(key)) continue;
            if (GALLERY.test(key)) for (const entry of photoEntries(child)) add(entry, 'property-json');
            else if (typeof child === 'object') galleries(child, depth + 1);
        }
    }
    for (const record of records) galleries(record.value);
    // Fallback is scoped to primary gallery containers, never all page images.
    $('[class*="recommend"], [class*="similar"], [class*="nearby"], aside, footer, nav').remove();
    const selector = '[data-testid="photo-gallery"] img, [data-testid="hdp-photo-gallery"] img, [data-testid="media-stream"] img, .InlinePhotoPreview img, .PhotoSlider img, .photo-container img, .PhotoView img';
    $(selector).each((_, element) => {
        const img = $(element), choices = [];
        for (const value of [img.attr('src'), img.attr('data-src'), img.attr('data-original')]) {
            const photo = imageUrl(value, url); if (photo) choices.push({ url: photo, quality: Number(img.attr('width')) || 500 });
        }
        for (const candidate of (img.attr('srcset') ?? '').split(',')) {
            const [raw, size] = candidate.trim().split(/\s+/), photo = imageUrl(raw, url);
            if (photo) choices.push({ url: photo, quality: parseFloat(size) * (size?.endsWith('x') ? 1000 : 1) || 500 });
        }
        const best = choices.sort((a, b) => b.quality - a.quality)[0];
        if (best) photos.push({ ...best, caption: img.attr('alt') || null, provenance: 'gallery-dom' });
    });
    if (!photos.length) {
        const cover = imageUrl($('meta[property="og:image"]').attr('content'), url);
        if (cover) photos.push({ url: cover, quality: 500, caption: null, provenance: 'listing-cover-only' });
    }
    const unique = new Map();
    for (const photo of photos) {
        const key = canonicalPhoto(photo.url), previous = unique.get(key);
        if (!previous || photo.quality > previous.quality) unique.set(key, photo);
    }
    const declaredImageCount = records.map((r) => Number(r.value.photoCount ?? r.value.photosCount)).find((n) => Number.isFinite(n) && n > 0) ?? null;
    return { status: unique.size ? 'found' : 'not_found', provider: identity.provider, propertyId: identity.id, declaredImageCount,
        listingUrl: identity.url, address: expectedAddress || address, addressVerified: !!expectedAddress && !!address,
        images: [...unique.values()].map(({ quality, ...photo }) => photo) };
}
