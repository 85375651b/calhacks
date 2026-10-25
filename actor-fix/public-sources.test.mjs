import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
const compiled = await build({ entryPoints: [fileURLToPath(new URL('./src/public-sources.ts', import.meta.url))],
  bundle: true, write: false, platform: 'node', format: 'esm', target: 'node20' });
const { embeddedPropertyCandidates, verifyAddress, propertyHtml, publicCandidates, tourLinks, isBlocked, searchQueries, sourcePriority } =
  await import('data:text/javascript;base64,' + Buffer.from(compiled.outputFiles[0].text).toString('base64'));
const target = '134 Athens St, San Francisco, CA 94112';
const title = (address) => `<title>${address}</title>`;

test('address matching normalizes street/state and rejects number, city, ZIP and unit mismatches', () => {
  assert.equal(verifyAddress(title('134 Athens Street, San Francisco, California 94112'), target).matched, true);
  assert.equal(verifyAddress(title('iGUIDE 3D Tour for 134 Athens St, San Francisco, CA 94112'), target).matched, true);
  for (const other of ['135 Athens St, San Francisco, CA 94112', '134 Athens Ave, San Francisco, CA 94112',
    '134 Athens St, Oakland, CA 94112', '134 Athens St, San Francisco, CA 94111', '134 Athens St Unit 2, San Francisco, CA 94112'])
    assert.equal(verifyAddress(title(other), target).matched, false, other);
  assert.equal(verifyAddress(title(target), '134 Athens St').matched, false);
  assert.equal(verifyAddress(title('134 Athens St, Apt 2, San Francisco, CA 94112'),
    '134 Athens Street #2, San Francisco, CA 94112').matched, true);
});
test('search snippets, body mentions, related structured listings and agent addresses are not proof', () => {
  const address = { '@type': 'PostalAddress', streetAddress: '134 Athens St', addressLocality: 'San Francisco', addressRegion: 'CA', postalCode: '94112' };
  const json = (data) => `<script type="application/ld+json">${JSON.stringify(data)}</script>`;
  assert.equal(verifyAddress(`<p>${target}</p>`, target).matched, false);
  assert.equal(verifyAddress(json({ '@type': 'ItemList', itemListElement: [{ address }] }), target).matched, false);
  assert.equal(verifyAddress(json({ '@type': 'RealEstateAgent', address }), target).matched, false);
  assert.equal(verifyAddress(json({ '@type': 'SingleFamilyResidence', address }), target).matched, true);
  assert.equal(verifyAddress(title('135 Athens St, San Francisco, CA 94112') + json({ '@type': 'SingleFamilyResidence', address }), target).matched, false);
});
test('recommendations and embedded app state are removed before extracting plans', () => {
  const html = `<main><h1>${target}</h1><section><a href="/plan.pdf">Floor plan</a></section>
    <div class="related-properties"><div><img src="/other-floorplan.jpg"></div></div>
    <aside><a href="/nearby-plan.pdf">Floor plan</a></aside>
    <script>{"url":"/wrong-floorplan.jpg"}</script><img alt="Floor plan upstairs" src="/floor2.png"></main>`;
  const clean = propertyHtml(html);
  assert.ok(!clean.includes('other-floorplan'));
  assert.ok(!clean.includes('nearby-plan'));
  assert.ok(!clean.includes('wrong-floorplan'));
  assert.deepEqual(publicCandidates(clean, 'https://example.com/property').map((c) => c.url),
    ['https://example.com/plan.pdf', 'https://example.com/floor2.png']);
});
test('public iGUIDE links and documented view-alias paths resolve; tour hosts are checked', () => {
  const page = 'https://youriguide.com/property/';
  assert.deepEqual(publicCandidates('<a href="doc/floorplan_imperial.pdf">Download floor plan</a>', page).map((c) => c.url),
    ['https://youriguide.com/property/doc/floorplan_imperial.pdf']);
  assert.deepEqual(tourLinks('<iframe src="https://youriguide.com/house/"></iframe><a href="https://youriguide.com.evil.test/other">Other house</a>', page), ['https://youriguide.com/house/']);
  assert.ok(sourcePriority(page) < sourcePriority('https://www.zillow.com/house'));
  assert.deepEqual(publicCandidates('<h1>Verified property</h1>', page).map((c) => c.url), [
    page + 'doc/floorplan_imperial.pdf', page + 'doc/floorplan_imperial_en.pdf',
  ]);
  assert.equal(publicCandidates('<img alt="Floor plan" src="https://cdn.example/media/opaque-id">', 'https://agent.example/house').length, 1);
});
test('403/429 and challenge pages served as HTTP 200 are recognized', () => {
  for (const status of [401, 403, 429]) assert.equal(isBlocked('', status), true);
  assert.equal(isBlocked('<title>Just a moment...</title>', 200), true);
  assert.equal(isBlocked('<div class="cf-chl-widget"></div>', 200), true);
  assert.equal(isBlocked('<p>Floor plan</p>', 200), false);
  assert.ok(searchQueries(target).some((q) => q.includes('site:youriguide.com')));
});
test('split address headings, unpunctuated titles and broker footers do not reject the right home', () => {
  assert.equal(verifyAddress('<h1>134 Athens St</h1><div>San Francisco, CA 94112</div>', target).matched, true);
  assert.equal(verifyAddress('<title>134 Athens St San Francisco CA 94112</title>', target).matched, true);
  assert.equal(verifyAddress(title(target) + '<footer><address>999 Market St, San Francisco, CA 94103</address></footer>', target).matched, true);
  assert.equal(verifyAddress('<h1>135 Athens St</h1><div>San Francisco, CA 94112</div>', target).matched, false);
});
test('embedded plans are retained only from an explicitly matching property record', () => {
  const script = (record) => `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify(record)}</script>`;
  const property = { address: target, floorPlans: [{ url: 'https://cdn.example/real-plan.png' }],
    related: [{ address: '138 Athens St, San Francisco, CA 94112', floorPlans: ['https://cdn.example/other-plan.png'] }] };
  const html = script({ props: { pageProps: { listing: property } } });
  assert.deepEqual(embeddedPropertyCandidates(html, target, 'https://agent.example/property').map((c) => c.url), ['https://cdn.example/real-plan.png']);
  assert.deepEqual(embeddedPropertyCandidates(script({ props: { floorPlans: ['https://cdn.example/unassociated.png'] } }), target, 'https://agent.example/property'), []);
  assert.deepEqual(embeddedPropertyCandidates(script({ address: '138 Athens St, San Francisco, CA 94112', floorPlans: ['https://cdn.example/wrong.png'] }), target, 'https://agent.example/property'), []);
});
