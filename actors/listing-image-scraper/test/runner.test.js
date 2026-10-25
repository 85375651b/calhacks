import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeInput } from '../src/input.js';
import { runJobs } from '../src/runner.js';
import { createPacer, pause } from '../src/common.js';
const address = '134 Athens St, San Francisco, CA 94112';
const zillow = 'https://www.zillow.com/homedetails/134-Athens-St-San-Francisco-CA-94112/15168051_zpid/';
const redfin = 'https://www.redfin.com/CA/San-Francisco/134-Athens-St-94112/home/1768548';
const image = { url: 'https://photos.zillowstatic.com/fp/' + 'a'.repeat(32) + '-cc_ft_1536.jpg', provenance: 'property-json' };
const input = { listingUrls: [{ url: zillow, address }, { url: redfin, address }], allowAddressSearch: false };
const good = { status: 'found', images: [image], address, addressVerified: true, declaredImageCount: 1 };
async function setup(raw = input, services = {}, extra = {}) {
    const rows = [], files = [], fetched = [];
    const config = { ...normalizeInput(raw), ...extra };
    const summary = await runJobs(config, {
        fetchListing: async (listing) => { fetched.push(listing.provider); return listing.provider === 'zillow' ? { status: 'blocked', images: [] } : good; },
        downloadImage: async () => ({ body: Buffer.from('image-bytes'), contentType: 'image/jpeg' }),
        discover: async () => [], ...services,
    }, { save: async (key, body) => files.push({ key, body }), write: async (row) => rows.push(structuredClone(row)) }, extra.platformTimeout ?? Infinity);
    return { rows, files, fetched, summary };
}
test('blocked Zillow switches to supplied Redfin and emits one saved result for the address', async () => {
    const r = await setup();
    assert.deepEqual(r.fetched, ['zillow', 'redfin']);
    assert.equal(r.rows.length, 1);
    assert.equal(r.rows[0].status, 'found');
    assert.equal(r.rows[0].savedImageCount, 1);
    assert.equal(r.rows[0].galleryComplete, true);
    assert.equal(r.files.length, 1);
    assert.match(r.rows[0].images[0].sha256, /^[a-f0-9]{64}$/);
});
test('URL-only mode returns metadata without downloading when disabled', async () => {
    const r = await setup({ listingUrls: [redfin], downloadImages: false }, { downloadImage: () => { throw Error('Unexpected download'); } });
    assert.equal(r.rows[0].status, 'found');
    assert.equal(r.rows[0].images[0].downloadStatus, 'not_requested');
    assert.equal(r.files.length, 0);
});
test('failed image downloads preserve photo URLs and report partial output', async () => {
    const r = await setup(input, { downloadImage: async () => { throw Error('Image HTTP 429; Retry-After: 60'); } });
    assert.equal(r.rows[0].status, 'partial');
    assert.equal(r.rows[0].images[0].url, image.url);
    assert.equal(r.rows[0].images[0].downloadStatus, 'failed');
});
test('global deadline includes queued properties and ignores late fetch results', async () => {
    const r = await setup({ listingUrls: [zillow, redfin], allowAddressSearch: false }, {
        fetchListing: async () => { await new Promise((r) => setTimeout(r, 70)); return good; },
    }, { runMs: 15, listingMs: 500 });
    assert.equal(r.rows.length, 2);
    assert.ok(r.rows.every((row) => row.status === 'timeout'));
    assert.equal(r.files.length, 0);
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(r.rows.length, 2);
});
test('timeouts retain already-discovered photo URLs without starting late writes', async () => {
    const r = await setup({ listingUrls: [redfin] }, { downloadImage: async () => {
        await new Promise((resolve) => setTimeout(resolve, 60)); return { body: Buffer.from('late'), contentType: 'image/jpeg' };
    } }, { listingMs: 15 });
    assert.equal(r.rows[0].status, 'partial');
    assert.equal(r.rows[0].images[0].downloadStatus, 'skipped_timeout');
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.equal(r.files.length, 0);
});
test('invalid input is visible, duplicates merge, limits clamp and storage failures propagate', async () => {
    assert.equal(normalizeInput({ ...input, addresses: [address], listingUrls: [...input.listingUrls, input.listingUrls[0]] }).jobs.length, 1);
    assert.equal(normalizeInput({ searchTimeoutSecs: 300 }).searchMs, 30000);
    const empty = await setup({}); assert.equal(empty.rows[0].status, 'invalid_input'); assert.equal(empty.summary.written, 1);
    const bad = await setup({ listingUrls: ['http://localhost'] }); assert.equal(bad.rows[0].status, 'invalid_input');
    await assert.rejects(runJobs(normalizeInput({ listingUrls: [redfin], downloadImages: false }),
        { fetchListing: async () => good }, { write: async () => { throw Error('Dataset unavailable'); } }), /Dataset unavailable/);
});
test('discovery cannot exhaust the property budget and is optional', async () => {
    const r = await setup({ addresses: [address] }, { discover: async (_, signal) => { await pause(100, signal); return []; } }, { listingMs: 80 });
    assert.equal(r.rows[0].status, 'timeout');
    assert.ok(r.rows[0].elapsedMs < 75);
    const off = await setup({ addresses: [address], allowAddressSearch: false }, { discover: () => { throw Error('Must not search'); } });
    assert.equal(off.rows[0].status, 'not_found');
});
test('per-host pacing spaces listing requests and can be cancelled', async () => {
    const pace = createPacer(), controller = new AbortController(), started = Date.now();
    await pace('www.zillow.com', 30, controller.signal);
    await pace('www.zillow.com', 30, controller.signal);
    assert.ok(Date.now() - started >= 25);
    const waiting = pace('www.zillow.com', 30, controller.signal);
    controller.abort(Error('Stop'));
    await assert.rejects(waiting, /Stop/);
});
