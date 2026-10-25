import test from 'node:test';
import assert from 'node:assert/strict';
import { extractListing } from '../src/extract.js';
import { imageUrl, listingIdentity } from '../src/common.js';
import { matchesAddress } from '../src/address.js';
const address = '134 Athens St, San Francisco, CA 94112';
const zillow = 'https://www.zillow.com/homedetails/134-Athens-St-San-Francisco-CA-94112/15168051_zpid/';
const redfin = 'https://www.redfin.com/CA/San-Francisco/134-Athens-St-94112/home/1768548';
const z = (hash, size) => `https://photos.zillowstatic.com/fp/${hash}-cc_ft_${size}.jpg`;
const a = 'a'.repeat(32), b = 'b'.repeat(32), c = 'c'.repeat(32);
const script = (data) => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(data)}</script>`;
const propertyAddress = { streetAddress: '134 Athens St', city: 'San Francisco', state: 'CA', zipcode: '94112' };

test('Zillow nested string cache yields primary gallery, best sizes and no nearby homes', () => {
    const property = { zpid: 15168051, address: propertyAddress, photoCount: 2, responsivePhotos: [
        { caption: 'Living room', mixedSources: { jpeg: [{ url: z(a, 384), width: 384 }, { url: z(a, 1536), width: 1536 }], webp: [{ url: z(a, 768), width: 768 }] } },
        { mixedSources: { jpeg: [{ url: z(b, 1536), width: 1536 }] } },
    ], similarHomes: [{ zpid: 999, responsivePhotos: [{ url: z(c, 1536) }] }] };
    const html = script({ props: { pageProps: { componentProps: { zpid: 15168051, gdpClientCache: JSON.stringify({ query: { property } }) } } } });
    const result = extractListing({ html, url: zillow, expectedAddress: address });
    assert.equal(result.status, 'found');
    assert.equal(result.addressVerified, true);
    assert.equal(result.declaredImageCount, 2);
    assert.deepEqual(result.images.map((i) => i.url), [z(a, 1536), z(b, 1536)]);
    assert.equal(result.images[0].caption, 'Living room');
});
test('Redfin captured listing JSON extracts full photo URLs and rejects unrelated property IDs', () => {
    const first = 'https://ssl.cdn-redfin.com/photo/8/bigphoto/123/123_0.jpg';
    const second = 'https://ssl.cdn-redfin.com/photo/8/bigphoto/123/123_1.jpg';
    const networkJson = [{ payload: { propertyId: 1768548, address: propertyAddress, photos: { photoUrls: [
        { fullScreenPhotoUrl: first, thumbnailPhotoUrl: 'https://ssl.cdn-redfin.com/photo/8/mbphoto/123/123_0.jpg' },
        { fullScreenPhotoUrl: second },
    ] }, nearbyHomes: [{ propertyId: 777, photos: ['https://ssl.cdn-redfin.com/photo/8/bigphoto/777/other.jpg'] }] } }];
    const result = extractListing({ html: '', url: redfin, expectedAddress: address, networkJson });
    assert.equal(result.status, 'found');
    assert.deepEqual(result.images.map((i) => i.url), [first, second]);
});
test('wrong street number or unit is not accepted and empty pages do not pass address validation', () => {
    const html = script({ property: { zpid: 15168051, address: { ...propertyAddress, streetAddress: '138 Athens St' }, photos: [z(a, 1536)] } });
    assert.equal(extractListing({ html, url: zillow, expectedAddress: address }).status, 'address_mismatch');
    assert.equal(extractListing({ html: '<title>Search results</title>', url: zillow, expectedAddress: address }).status, 'unverified');
    assert.equal(matchesAddress(address, '134 Athens Street, San Francisco, California 94112'), true);
    assert.equal(matchesAddress(address, '134 Athens St #2, San Francisco, CA 94112'), false);
});
test('DOM fallback is gallery-scoped and uses srcset; og:image is marked cover only', () => {
    const html = `<title>${address}</title><div data-testid="photo-gallery"><img src="${z(a, 384)}" srcset="${z(a, 384)} 384w, ${z(a, 1536)} 1536w" alt="Kitchen"></div>
        <div class="similar-homes"><div class="photo-container"><img src="${z(b, 1536)}"></div></div><img src="${z(c, 1536)}">`;
    const result = extractListing({ html, url: zillow, expectedAddress: address });
    assert.deepEqual(result.images.map((i) => i.url), [z(a, 1536)]);
    assert.equal(result.images[0].provenance, 'gallery-dom');
    const cover = extractListing({ html: `<meta property="og:image" content="${z(a, 1536)}">`, url: zillow });
    assert.equal(cover.images[0].provenance, 'listing-cover-only');
    assert.equal(cover.declaredImageCount, null);
});
test('canonical identity changes, foreign hosts, agent images and invalid listing URLs are rejected', () => {
    assert.equal(extractListing({ html: `<link rel="canonical" href="${zillow.replace('15168051_zpid', '15168052_zpid')}">`, url: zillow }).status, 'address_mismatch');
    assert.equal(listingIdentity('https://www.zillow.com.evil.test/homedetails/home/123_zpid/'), null);
    assert.equal(listingIdentity('https://www.redfin.com/city/1/homes'), null);
    assert.equal(imageUrl('https://example.com/house.jpg'), null);
    assert.equal(imageUrl('http://127.0.0.1/private'), null);
    assert.equal(imageUrl('https://photos.zillowstatic.com/agent/avatar.jpg'), null);
});
