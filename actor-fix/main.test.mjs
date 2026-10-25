import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

// Compile the actual replacement entry point; mock only the unavailable Actor dependencies.
const result = await build({
  entryPoints: [fileURLToPath(new URL(process.env.ACTOR_TEST_PASTE ? './main-paste.ts' : './src/main.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node20',
  plugins: [{ name: 'actor-test-dependencies', setup(b) {
    b.onResolve({ filter: /^(apify|crawlee|\.\/.*\.js)$/ }, ({ path }) => path === './public-sources.js' ? undefined : ({ path, namespace: 'mock' }));
    b.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => {
      const names = {
        apify: ['Actor', 'Dataset', 'log'], crawlee: ['PlaywrightCrawler', 'RequestList'],
        './address.js': ['normalizeAddress'], './discovery.js': ['discover'], './extract.js': ['extractFromHtml'],
        './http.js': ['fetchPage'], './images.js': ['combinePdf', 'downloadCandidate', 'hammingDistance',
          'heuristicImageScore', 'imageSignals', 'perceptualHash', 'pdfInfo', 'pdfText', 'toPng'],
        './ocr-vision.js': ['runOcr', 'stopOcr', 'visionCheck'],
      }[path];
      if (!names) throw Error('Unexpected import ' + path);
      return { contents: names.map((n) => `export const ${n} = globalThis.__actorFixHarness.${n};`).join('\n') };
    });
  } }],
});
const code = result.outputFiles[0].text;
let sequence = 0;
const address = '134 Athens St, San Francisco, CA 94112';
const listing = 'https://www.realtor.com/realestateandhomes-detail/134-Athens-St';
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function run(input, options = {}) {
  const rows = [], values = {}, calls = { browser: 0, fetch: 0, discover: 0, teardown: 0, exit: null, fetched: [], downloaded: [], searches: [], childAborts: 0, datasetPolls: 0 };
  const html = (body) => ['plans', 'empty'].includes(body)
    ? `<html><head><title>${address}</title></head><body><h1>${address}</h1>${body === 'plans' ? '<div data-test-plans></div>' : ''}</body></html>` : body;
  const h = {
    Actor: {
      init: async () => {}, getInput: async () => input,
      getEnv: () => ({ memoryMbytes: 1024, actorBuildNumber: 'test', ...options.env }),
      createProxyConfiguration: async (value) => { calls.proxy = value; if (options.setupError) throw Error('Proxy unavailable'); return { newUrl: async () => 'http://proxy' }; },
      setValue: async (key, value) => { values[key] = structuredClone(value); },
      exit: async (value) => { calls.exit = value.exitCode; },
      start: async (_, input) => { calls.discover++; calls.searches.push(input.queries); await sleep(options.discoveryMs ?? 1); if (options.searchError) throw Error('Search unavailable'); return { id: 'child-run', defaultDatasetId: 'search' }; },
      call: async () => { throw Error('Must not wait for the entire search Actor run'); },
      apifyClient: {
        dataset: () => ({ listItems: async () => { calls.datasetPolls++; return { items: [{ organicResults: options.neverSearchResults ? [] : options.urls ?? [{ url: listing, title: address }] }] }; } }),
        run: () => ({ get: async () => ({ status: options.searchStatus ?? 'RUNNING' }), abort: async () => { calls.childAborts++; } }),
      },
    },
    Dataset: { pushData: async (value) => { if (options.storageError) throw Error('Storage unavailable'); rows.push(structuredClone(value)); } },
    log: { info() {}, warning() {}, error() {} },
    normalizeAddress: (value) => ({ valid: /^\d/.test(value), normalized: value.trim().replace(/\s+/g, ' '), reason: 'Invalid address' }),
    discover: async () => { calls.discover++; await sleep(options.discoveryMs ?? 1); return { urls: options.urls ?? [{ url: listing, source: 'realtor' }], attempts: [{ source: 'realtor', step: 'discovery', ok: true }] }; },
    fetchPage: async (url) => {
      calls.fetch++; calls.fetched.push(url);
      await sleep(options.fetchDelays?.[url] ?? 0);
      const response = options.pages?.[url] ?? options.page ?? { ok: false, status: 429, error: 'blocked' };
      return { ...response, body: html(response.body ?? '') };
    },
    extractFromHtml: (body, url) => ({ candidates: body.includes('data-test-plans') ? (options.candidates ?? [{ url: 'https://cdn.example/plan.pdf', sourceUrl: url, source: 'webSearch', keywordScore: 1, explicitFloorPlan: true }]) : [] }),
    RequestList: { open: async (_, urls) => ({ url: urls[0] }) },
    PlaywrightCrawler: class {
      constructor(opts) { this.opts = opts; }
      async run() { calls.browser++; await sleep(options.browserMs ?? 0); await this.opts.requestHandler({ response: { status: () => options.browserHtml ? 200 : 403 },
        page: { content: async () => html(options.browserHtml ?? 'denied'), url: () => options.browserUrl ?? this.opts.requestList.url, title: async () => options.browserHtml ? 'House' : 'Access denied' } }); }
      async teardown() { calls.teardown++; }
    },
    downloadCandidate: async (candidate) => {
      calls.downloaded.push(candidate.url);
      await sleep(options.downloadMs ?? 0);
      if (candidate.url.includes('bad')) throw Error('Corrupt image');
      return { body: Buffer.from('pdf bytes'), contentType: 'application/pdf', candidate, sha256: 'unused' };
    },
    pdfInfo: async () => ({ isValid: true, pages: 1 }), pdfText: async () => 'Floor plan',
    stopOcr: async () => {}, runOcr: async () => ({}), visionCheck: async () => null,
    combinePdf: async () => Buffer.from('combined'), toPng: async (v) => v,
    hammingDistance: () => 20, heuristicImageScore: () => 1, imageSignals: async () => ({}), perceptualHash: async () => 'hash',
  };
  globalThis.__actorFixHarness = h;
  await import('data:text/javascript;base64,' + Buffer.from(code + '\n//' + sequence++).toString('base64'));
  return { rows, values, calls };
}

test('blocked listing produces exactly one row, attempts and phase timings', async () => {
  const r = await run({ addresses: [address], debugMode: true });
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].status, 'blocked');
  assert.ok(r.rows[0].attempts.some((a) => a.detail?.includes('429')));
  assert.ok(r.values.OUTPUT.phaseMs.discovery > 0);
  assert.ok('fetch' in r.rows[0].phaseMs);
  assert.equal(r.values.OUTPUT.addressesWritten, 1);
  assert.equal(r.calls.exit, 0);
});
test('discovery is included in the address timeout and cannot write late results', async () => {
  const r = await run({ addresses: [address], perAddressTimeoutSecs: 0.01 }, { discoveryMs: 80 });
  assert.equal(r.rows[0].status, 'timeout');
  await sleep(100);
  assert.equal(r.rows.length, 1);
  assert.equal(r.calls.fetch, 0);
  assert.equal(r.values.OUTPUT.runStatus, 'partial_timeout');
});
test('platform deadline flushes active and queued addresses with headroom', async () => {
  const r = await run({ addresses: [address, '5101 Trail West Dr, Austin, TX', '123 Main St, Austin, TX'],
    listingUrls: [{ url: listing, address }], maxConcurrency: 1 },
    { fetchDelays: { [listing]: 100 }, env: { timeoutAt: new Date(Date.now() + 10030) } });
  assert.equal(r.rows.length, 3);
  assert.ok(r.rows.every((row) => row.status === 'timeout'));
  assert.equal(r.calls.discover, 0);
  assert.equal(r.values.OUTPUT.addressesWritten, 3);
});
test('explicit listing plus its address runs only once and skips discovery', async () => {
  const r = await run({ addresses: [address, address], listingUrls: [{ url: listing, address }] }, { page: { ok: true, status: 200, body: 'plans' } });
  assert.equal(r.rows.length, 1);
  assert.equal(r.calls.discover, 0);
  assert.equal(r.calls.fetch, 1);
});
test('successful HTTP with no images still renders and stores a floor plan', async () => {
  const r = await run({ addresses: address }, { page: { ok: true, status: 200, body: 'empty' }, browserHtml: 'plans' });
  assert.equal(r.rows[0].status, 'found');
  assert.equal(r.calls.browser, 1);
  const plan = r.rows[0].floorPlans[0];
  assert.ok(r.values[plan.kvKey]);
  assert.equal(plan.sha256, createHash('sha256').update('pdf bytes').digest('hex'));
});
test('one corrupt candidate does not discard subsequent floor plans', async () => {
  const r = await run({ listingUrls: { url: listing, address } }, { page: { ok: true, status: 200, body: 'plans' },
    candidates: ['bad', 'plan'].map((name) => ({ url: 'https://cdn.example/' + name + '.pdf', sourceUrl: listing, source: 'realtor', keywordScore: 1, explicitFloorPlan: true })) });
  assert.equal(r.rows[0].status, 'found');
  assert.equal(r.rows[0].floorPlans.length, 1);
  assert.ok(r.rows[0].attempts.some((a) => a.step === 'candidate-error'));
});
test('accepted plans persist without probing unrelated listings', async () => {
  const r = await run({ addresses: address }, { page: { ok: true, status: 200, body: 'plans' }, urls: [
    { url: listing, source: 'realtor' }, { url: 'https://www.zillow.com/homedetails/other', source: 'zillow' },
  ] });
  assert.equal(r.rows[0].status, 'found');
  assert.equal(r.calls.fetch, 1);
});
test('setup failures write errors for every address', async () => {
  const r = await run({ addresses: [address, '5101 Trail West Dr'] }, { setupError: true });
  assert.equal(r.rows.length, 2);
  assert.ok(r.rows.every((row) => row.status === 'error'));
  assert.equal(r.values.OUTPUT.runStatus, 'setup_error');
  assert.equal(r.calls.exit, 1);
});
test('supplied listings receive address timeouts and stop browser work', async () => {
  const r = await run({ listingUrls: [{ url: listing, address }], perAddressTimeoutSecs: 0.02 },
    { page: { ok: true, status: 200, body: 'empty' }, browserMs: 70 });
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].status, 'timeout');
  assert.ok(r.calls.teardown > 0);
  await sleep(80);
  assert.equal(r.rows.length, 1);
});
test('late candidate downloads cannot persist files after timeout', async () => {
  const r = await run({ listingUrls: [{ url: listing, address }], perAddressTimeoutSecs: 0.02 },
    { downloadMs: 80, page: { ok: true, status: 200, body: 'plans' } });
  assert.equal(r.rows[0].status, 'timeout');
  await sleep(100);
  assert.ok(!Object.keys(r.values).some((key) => key.endsWith('.pdf')));
});
test('failed storage is never counted as a written row or successful run', async () => {
  const r = await run({ addresses: [address] }, { storageError: true });
  assert.equal(r.values.OUTPUT.addressesWritten, 0);
  assert.equal(r.values.OUTPUT.runStatus, 'storage_error');
  assert.equal(r.calls.exit, 1);
});
test('invalid and empty input always produce a diagnostic row', async () => {
  for (const input of [{}, { addresses: 'nonsense' }, { listingUrls: 'ftp://invalid' }, { listingUrls: 'https://[' }]) {
    const r = await run(input);
    assert.equal(r.rows.length, 1);
    assert.match(r.rows[0].status, /^invalid_/);
    assert.ok(r.values.OUTPUT.phaseMs.total >= 0);
  }
});
test('debug configuration does not expose credentials or custom proxy URLs', async () => {
  const r = await run({ addresses: address, debugMode: true, openaiApiKey: 'secret-key',
    proxyConfiguration: { proxyUrls: ['http://user:secret@proxy.example'] } });
  const debug = JSON.stringify([r.values.DEBUG_REPORT.effectiveInput, r.values.OUTPUT]);
  assert.ok(!debug.includes('secret'));
  assert.equal(r.values.OUTPUT.proxyMode, 'custom-proxy');
});

const iguide = 'https://youriguide.com/134_athens_st/';
const photoSite = 'https://photos.example.com/134-athens';
const publicPlan = `<title>${address}</title><h1>${address}</h1><a href="doc/floorplan_imperial.pdf">Download floor plan</a>`;
test('a blocked supplied Realtor URL switches to a discovered iGUIDE and downloads its public PDF', async () => {
  const r = await run({ addresses: [address], listingUrls: [{ url: listing, address }] }, {
    urls: [{ url: iguide, title: address }], pages: { [iguide]: { ok: true, status: 200, body: publicPlan } },
  });
  assert.equal(r.rows[0].status, 'found');
  assert.deepEqual(r.calls.fetched, [listing, iguide]);
  assert.equal(r.calls.browser, 0, 'do not spend browser time retrying a blocked host');
  assert.deepEqual(r.calls.downloaded, [iguide + 'doc/floorplan_imperial.pdf']);
  assert.equal(r.rows[0].floorPlans[0].signals.addressVerified, true);
  assert.equal(r.rows[0].floorPlans[0].signals.providerHost, 'youriguide.com');
  assert.ok(r.rows[0].listingUrls.includes(iguide));
});
test('a slow site times out independently so another property site can finish', async () => {
  const r = await run({ addresses: [address], listingUrls: [{ url: listing, address }], perSiteTimeoutSecs: 0.025 }, {
    urls: [{ url: photoSite, title: address }], fetchDelays: { [listing]: 90 },
    pages: { [photoSite]: { ok: true, status: 200, body: publicPlan } },
  });
  assert.equal(r.rows[0].status, 'found');
  assert.ok(r.rows[0].attempts.some((a) => a.step === 'site-fallback'));
  await sleep(100);
  assert.equal(r.rows.length, 1);
  assert.deepEqual(r.calls.fetched, [listing, photoSite]);
});
test('HTTP 200 challenge pages switch hosts and other URLs on the blocked host are skipped', async () => {
  const alternate = 'https://realtor.com/another-path';
  const r = await run({ listingUrls: [{ url: listing, address }, { url: alternate, address }, { url: photoSite, address }] }, {
    pages: { [listing]: { ok: true, status: 200, body: '<title>Just a moment...</title>' },
      [photoSite]: { ok: true, status: 200, body: publicPlan } },
  });
  assert.equal(r.rows[0].status, 'found');
  assert.deepEqual(r.calls.fetched, [listing, photoSite]);
  assert.ok(r.rows[0].attempts.some((a) => a.step === 'site-skipped'));
});
test('a similar address is rejected even when the search title claims the correct house', async () => {
  const wrong = 'https://www.homevisit.com/property/135-athens';
  const r = await run({ addresses: address }, { urls: [{ url: wrong, title: address }, { url: photoSite, title: address }],
    pages: { [wrong]: { ok: true, status: 200, body: publicPlan.replaceAll('134 Athens', '135 Athens') },
      [photoSite]: { ok: true, status: 200, body: publicPlan } } });
  assert.equal(r.rows[0].status, 'found');
  assert.ok(r.rows[0].attempts.some((a) => a.step === 'address-match' && !a.ok));
  assert.equal(r.calls.downloaded.length, 1);
  assert.ok(r.calls.downloaded[0].startsWith('https://photos.example.com/'));
});
test('a verified property can lead to an independently verified linked tour', async () => {
  const r = await run({ listingUrls: [{ url: photoSite, address }] }, { pages: {
    [photoSite]: { ok: true, status: 200, body: `<title>${address}</title><iframe src="${iguide}"></iframe>` },
    [iguide]: { ok: true, status: 200, body: publicPlan },
  } });
  assert.equal(r.rows[0].status, 'found');
  assert.deepEqual(r.calls.fetched, [photoSite, iguide]);
  assert.equal(r.calls.discover, 0);
});
test('all mismatching pages produce a diagnostic result without downloading any images', async () => {
  const r = await run({ addresses: address }, { urls: [{ url: iguide, title: address }],
    page: { ok: true, status: 200, body: publicPlan.replaceAll('134 Athens', '135 Athens') } });
  assert.equal(r.rows[0].status, 'listing_found_no_floor_plan');
  assert.equal(r.calls.downloaded.length, 0);
});
test('search failures remain visible and still produce one result', async () => {
  const r = await run({ addresses: address }, { searchError: true });
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].status, 'no_listing_found');
  assert.ok(r.rows[0].attempts.some((a) => a.step === 'search' && !a.ok));
});
test('large searchTimeoutSecs cannot consume the full run; late child startup is aborted', async () => {
  const r = await run({ addresses: address, maxRunSecs: 1, perAddressTimeoutSecs: 0.2, searchTimeoutSecs: 300 }, { discoveryMs: 100 });
  assert.equal(r.rows[0].status, 'timeout');
  assert.equal(r.values.OUTPUT.effectiveInput.searchTimeoutSecs, 30);
  assert.ok(r.values.OUTPUT.phaseMs.discovery < 180);
  assert.ok(r.rows[0].attempts.some((a) => a.step === 'search-start'));
  assert.ok(r.values.OUTPUT.elapsedMs < 900);
  assert.equal(r.rows[0].implementationVersion, 'public-fallback-0.2.3-streaming-search');
  await sleep(120);
  assert.equal(r.calls.childAborts, 1);
});
test('search returns its first available batch while child run is still running', async () => {
  const r = await run({ addresses: address }, { searchStatus: 'RUNNING',
    page: { ok: true, status: 200, body: publicPlan } });
  assert.equal(r.rows[0].status, 'found');
  assert.equal(r.calls.childAborts, 1);
  assert.equal(r.calls.datasetPolls, 1);
  assert.ok(r.rows[0].attempts.some((a) => a.step === 'search-results'));
});
test('nearby houses from the actual search result pattern do not consume fetches', async () => {
  const wrong = 'https://www.zillow.com/homedetails/138-Athens-St-San-Francisco-CA-94112/15168052_zpid/';
  const r = await run({ addresses: address }, { urls: [{ url: wrong }, { url: listing }],
    page: { ok: true, status: 200, body: publicPlan } });
  assert.equal(r.rows[0].status, 'found');
  assert.deepEqual(r.calls.fetched, [listing]);
  assert.ok(r.rows[0].attempts.some((a) => a.step === 'url-address-filter'));
});
test('a matching plan in property JSON survives script-state sanitization', async () => {
  const body = `<title>${address}</title><script type="application/json">${JSON.stringify({ props: { listing: {
    address, floorPlans: [{ url: 'https://cdn.example/verified-plan.pdf' }],
    similarProperties: [{ address: '138 Athens St, San Francisco, CA 94112', floorPlans: [{ url: 'https://cdn.example/wrong-plan.pdf' }] }],
  } } })}</script>`;
  const r = await run({ listingUrls: [{ url: photoSite, address }] }, { page: { ok: true, status: 200, body } });
  assert.equal(r.rows[0].status, 'found');
  assert.deepEqual(r.calls.downloaded, ['https://cdn.example/verified-plan.pdf']);
  assert.equal(r.calls.browser, 0);
});
test('bare URLs need a full address and the site count stays bounded', async () => {
  const bare = await run({ listingUrls: iguide });
  assert.equal(bare.rows[0].status, 'invalid_address');
  assert.equal(bare.calls.fetch, 0);
  const capped = await run({ addresses: address, maxSitesPerAddress: 1 }, { urls: [{ url: listing }, { url: iguide }] });
  assert.equal(capped.calls.fetch, 1);
});
test('paste-ready main contains the current helper and entry point', () => {
  const main = readFileSync(new URL('./src/main.ts', import.meta.url), 'utf8').replace(/^import .* from '\.\/public-sources\.js';\r?\n/m, '');
  const helper = readFileSync(new URL('./src/public-sources.ts', import.meta.url), 'utf8').replace(/^export /gm, '');
  const split = main.indexOf('interface Input');
  const normalizeNewlines = (text) => text.replace(/\r\n/g, '\n');
  assert.equal(normalizeNewlines(readFileSync(new URL('./main-paste.ts', import.meta.url), 'utf8')), normalizeNewlines(main.slice(0, split) + helper + '\n\n' + main.slice(split)));
});
