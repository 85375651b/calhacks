import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCache, CACHE_TTL } from "../cache.js";
import {
  normalizeSuggestions,
  createAutocompleteProvider,
} from "../providers/autocomplete.js";
import { createAutocomplete } from "../autocomplete.js";
import { createApifyClient, resolveZillowUrl } from "../providers/apify.js";
import {
  normalizeEnrichment,
  createEnrichment,
  loadApifyFixtures,
  ENRICHMENT_FAILURE_TTL,
} from "../enrich.js";
import { createApp } from "../app.js";

const fixtures = await loadApifyFixtures();
const feature = (extra = {}) => ({
  properties: {
    countrycode: "US",
    housenumber: "123",
    street: "Main Street",
    city: "Austin",
    state: "Texas",
    postcode: "78701",
    ...extra,
  },
  geometry: { coordinates: [-97.74, 30.27] },
});
async function cacheFor(t, options) {
  const directory = await mkdtemp(join(tmpdir(), "propertylens-phase3-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "apify.json");
  return { file, cache: createCache(file, options) };
}

test("Photon normalization requires a US house, formats state, drops duplicates, caps at five", () => {
  const data = normalizeSuggestions({
    features: [
      feature(),
      feature({ postcode: "78702" }),
      feature({ countrycode: "CA" }),
      feature({ housenumber: "" }),
      feature({ street: "" }),
      ...Array.from({ length: 8 }, (_, i) =>
        feature({ housenumber: String(200 + i) }),
      ),
    ],
  });
  assert.equal(data.length, 5);
  assert.deepEqual(data[0], {
    label: "123 Main Street, Austin, TX",
    street: "123 Main Street",
    city: "Austin",
    state: "TX",
    zip: "",
    lat: 30.27,
    lng: -97.74,
  });
});

test("Photon requests US houses with a timeout; normalized-query cache lasts ten minutes", async () => {
  let calls = 0,
    time = 0;
  const provider = createAutocompleteProvider({
    now: () => time,
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url.searchParams.get("countrycode"), "US");
      assert.equal(url.searchParams.get("layer"), "house");
      assert.equal(url.searchParams.get("lang"), "en");
      assert.equal(url.searchParams.get("limit"), "5");
      assert.ok(options.signal);
      return Response.json({ features: [feature()] });
    },
  });
  const [a, b] = await Promise.all([
    provider("123 Main"),
    provider(" 123 MAIN "),
  ]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  time = 600000;
  await provider("123 main");
  assert.equal(calls, 2);
  const failed = createAutocompleteProvider({
    fetchImpl: async () => {
      throw new Error("offline");
    },
  });
  assert.deepEqual(await failed("123 Main"), []);
});

test("autocomplete validates query and limits each IP to 30 requests per minute", async () => {
  let time = 0,
    calls = 0;
  const autocomplete = createAutocomplete({
    now: () => time,
    provider: async () => {
      calls++;
      return [];
    },
  });
  await assert.rejects(autocomplete("12", "a"), { status: 400 });
  assert.equal(calls, 0);
  for (let i = 0; i < 30; i++) await autocomplete("123", "a");
  await assert.rejects(autocomplete("123", "a"), { status: 429 });
  await autocomplete("123", "b");
  time = 60000;
  await autocomplete("123", "a");
  assert.equal(calls, 32);
});

test("actual Apify fixture normalizes observed fields without inventing missing photo/history data", () => {
  const result = normalizeEnrichment(fixtures.items);
  assert.equal(result.zestimate, fixtures.items[0].zestimate);
  assert.equal(result.brokerage, fixtures.items[0].brokerageName);
  assert.deepEqual(result.photos, []);
  assert.deepEqual(result.priceHistory, []);
  assert.equal(result.usingFixtures, false);
  assert.deepEqual(result.sources, ["Zillow data via Apify"]);
});

test("optional image/history fields are bounded, sorted, and normalized safely", () => {
  const row = {
    ...fixtures.items[0],
    image: "https://photos.zillowstatic.com/fp/example.jpg",
    description: "x".repeat(500),
    priceHistory: [
      { date: null, price: NaN, event: null },
      ...Array.from({ length: 8 }, (_, i) => ({
        date: `2024-01-${String(i + 1).padStart(2, "0")}`,
        price: 100 + i,
        event: "Price change",
      })),
    ],
  };
  const result = normalizeEnrichment([row]);
  assert.equal(result.priceHistory.length, 5);
  assert.equal(result.priceHistory[0].date, "2024-01-08");
  assert.ok(result.description.length <= 300);
  assert.equal(result.photos.length, 1);
  const missing = normalizeEnrichment([
    {
      zpid: "1",
      url: "javascript:alert(1)",
      image: "https://evil.example/image",
      zestimate: NaN,
    },
  ]);
  assert.equal(missing.zillowUrl, null);
  assert.equal(missing.zestimate, null);
  assert.deepEqual(missing.photos, []);
  assert.throws(() => normalizeEnrichment([]), { status: 404 });
});

test("enrichment coalesces concurrent calls and persists the 24h result across restarts", async (t) => {
  let calls = 0,
    time = 1000;
  const { cache, file } = await cacheFor(t, { now: () => time });
  const request = async () => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return fixtures.items;
  };
  const enrich = createEnrichment({ request, cache, token: "test-only" });
  const [a, b] = await Promise.all([
    enrich(fixtures.metadata.address),
    enrich(` ${fixtures.metadata.address.toUpperCase()} `),
  ]);
  assert.deepEqual(a, b);
  assert.equal(calls, 1);
  const restarted = createEnrichment({
    request,
    cache: createCache(file, { now: () => time }),
    token: "test-only",
  });
  await restarted(fixtures.metadata.address);
  assert.equal(calls, 1);
  time += CACHE_TTL;
  await restarted(fixtures.metadata.address);
  assert.equal(calls, 2);
});

test("enrichment caches sanitized failures for only five minutes, including restarts", async (t) => {
  let calls = 0,
    time = 1000;
  const { cache, file } = await cacheFor(t, { now: () => time });
  const request = async () => {
    calls++;
    throw new Error("private provider body");
  };
  const enrich = createEnrichment({ request, cache, token: "test-only" });
  await assert.rejects(enrich("123 Main St, Austin, TX"), {
    status: 502,
    message: "Zillow data unavailable right now",
  });
  const restarted = createEnrichment({
    request,
    cache: createCache(file, { now: () => time }),
    token: "test-only",
  });
  await assert.rejects(restarted("123 MAIN ST, AUSTIN, TX"));
  assert.equal(calls, 1);
  time += ENRICHMENT_FAILURE_TTL;
  await assert.rejects(restarted("123 Main St, Austin, TX"));
  assert.equal(calls, 2);
});

test("no token and disabled mode skip the actor; fixtures require no key and do not touch live cache", async () => {
  const request = () => assert.fail("must not call actor");
  await assert.rejects(createEnrichment({ request })("123 Main"), {
    status: 503,
  });
  await assert.rejects(
    createEnrichment({ request, token: "test-only", enabled: false })(
      "123 Main",
    ),
    { status: 503 },
  );
  const result = await createEnrichment({
    request,
    useFixtures: true,
    fixtures,
  })("123 Different Street");
  assert.equal(result.usingFixtures, true);
  assert.equal(result.fixtureAddress, fixtures.metadata.address);
});

test("Apify uses Bearer auth only, one-item limits, bounded timeouts, and safe error messages", async () => {
  const listingUrl = fixtures.items[0].url;
  const client = createApifyClient({
    token: "test-only-token",
    resolveUrl: async () => listingUrl,
    fetchImpl: async (url, options) => {
      assert.equal(url.searchParams.has("token"), false);
      assert.equal(url.searchParams.get("maxItems"), "1");
      assert.equal(url.searchParams.get("timeout"), "55");
      assert.equal(options.headers.Authorization, "Bearer test-only-token");
      assert.ok(options.signal);
      const input = JSON.parse(options.body);
      assert.equal(input.maxItems, 1);
      assert.equal(input.startUrls[0].url, listingUrl);
      assert.equal(input.fetchDetails, true);
      return Response.json(fixtures.items);
    },
  });
  assert.deepEqual(await client(fixtures.metadata.address), fixtures.items);
  const failed = createApifyClient({
    token: "test-only-token",
    resolveUrl: async () => listingUrl,
    fetchImpl: async () => new Response("test-only-token", { status: 403 }),
  });
  await assert.rejects(failed("123 Main"), {
    status: 502,
    message: "Zillow data unavailable right now",
  });
  await assert.rejects(
    resolveZillowUrl("123 Main", async () => ({
      ok: true,
      url: "https://evil.example/homedetails/x/1_zpid/",
    })),
    { status: 404 },
  );
});

test("lookup responds independently while enrichment is still pending; API errors do not leak", async (t) => {
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const app = createApp(
    async () => ({ address: "123 Main", listing: { status: "Active" } }),
    {
      enrich: () => pending,
      autocomplete: async () => [],
    },
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        release({});
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const enrichment = fetch(
    `${base}/api/enrich?address=5500%20Grand%20Lake%20Dr,%20San%20Antonio,%20TX%2078244`,
  );
  const lookup = await fetch(`${base}/api/lookup?address=123`);
  assert.equal(lookup.status, 200);
  assert.equal((await lookup.json()).address, "123 Main");
  release({
    ...normalizeEnrichment(fixtures.items),
    listingStatus: "FOR_SALE",
    status: "for_sale",
  });
  assert.equal((await enrichment).status, 200);
});
