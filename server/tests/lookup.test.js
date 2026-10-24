import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCache, CACHE_TTL } from "../cache.js";
import { createLookup, loadFixtures } from "../lookup.js";
import { normalizeProperty } from "../normalize.js";
import { createRentCastClient } from "../rentcast.js";
import { createApp } from "../app.js";
import { LookupError } from "../errors.js";

const fixtures = await loadFixtures();
const address = fixtures.metadata.address;
async function temporaryCache(t, options) {
  const directory = await mkdtemp(join(tmpdir(), "propertylens-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = join(directory, "lookups.json");
  return { file, cache: createCache(file, options) };
}
function fakeRequest(calls, overrides = {}) {
  return async (path) => {
    calls.push(path);
    await new Promise((resolve) => setTimeout(resolve, 5));
    return path in overrides
      ? overrides[path]
      : {
          "/avm/value": fixtures.avm,
          "/listings/sale": fixtures.listings,
          "/properties": fixtures.properties,
        }[path];
  };
}

test("real fixture fields normalize; inactive listing is never For sale", () => {
  const data = normalizeProperty({
    ...fixtures,
    address,
    sources: ["RentCast AVM"],
  });
  assert.equal(data.bedrooms, fixtures.avm.subjectProperty.bedrooms);
  assert.equal(data.squareFootage, fixtures.avm.subjectProperty.squareFootage);
  assert.equal(data.estimate.low, fixtures.avm.priceRangeLow);
  assert.equal(data.listing, null);
  assert.equal(data.lastSale.price, null);
  assert.equal(data.lastSale.date, fixtures.avm.subjectProperty.lastSaleDate);
  assert.equal(
    data.pricePerSqft,
    Math.round(fixtures.avm.price / data.squareFootage),
  );
  assert.equal(data.sampleData, false);
});

test("active listing price takes priority; zero bedrooms and fractional bathrooms survive", () => {
  const data = normalizeProperty({
    address,
    avm: {
      price: 300000,
      subjectProperty: { bedrooms: 0, bathrooms: 1.5, squareFootage: 1000 },
    },
    listings: [{ status: "Active", price: 350000, daysOnMarket: 0 }],
    sources: [],
  });
  assert.equal(data.pricePerSqft, 350);
  assert.equal(data.listing.listPrice, 350000);
  assert.equal(data.listing.daysOnMarket, 0);
  assert.equal(data.bedrooms, 0);
  assert.equal(data.bathrooms, 1.5);
});

test("missing, invalid, and zero-area values normalize to null without invalid arithmetic", () => {
  const data = normalizeProperty({
    address,
    avm: {
      price: NaN,
      subjectProperty: {
        bedrooms: "3",
        squareFootage: 0,
        yearBuilt: Infinity,
        lastSaleDate: "not-a-date",
      },
    },
    sources: [],
  });
  assert.equal(data.pricePerSqft, null);
  assert.equal(data.bedrooms, null);
  assert.equal(data.yearBuilt, null);
  assert.equal(data.lastSale, null);
  assert.equal(data.estimate, null);
});

test("parallel duplicate searches, normalized repeats, and server restarts use only one two-endpoint lookup", async (t) => {
  const { cache, file } = await temporaryCache(t);
  const calls = [];
  const lookup = createLookup({ cache, request: fakeRequest(calls) });
  const [first, second] = await Promise.all([
    lookup(address),
    lookup(`  ${address.toUpperCase()}  `),
  ]);
  assert.deepEqual(first, second);
  assert.equal(calls.length, 2);
  assert.deepEqual(await lookup(address.toLowerCase()), first);
  const afterRestart = createLookup({
    cache: createCache(file),
    request: async () => assert.fail("cache miss after restart"),
  });
  assert.deepEqual(await afterRestart(address), first);
  assert.equal(calls.length, 2);
});

test("cache expires after 24 hours", async (t) => {
  let time = 1000;
  const { cache } = await temporaryCache(t, { now: () => time });
  await cache.set(address, { address, sampleData: false });
  time += CACHE_TTL - 1;
  assert.ok(await cache.get(address));
  time += 1;
  assert.equal(await cache.get(address), null);
});

test("fixtures work without a key or cache; retain actual sample address", async () => {
  const lookup = createLookup({
    useFixtures: true,
    fixtures,
    request: () => assert.fail("fixture mode must never call provider"),
  });
  const data = await lookup("123 Different Street, Berkeley, CA");
  assert.equal(data.sampleData, true);
  assert.equal(data.address, fixtures.avm.subjectProperty.formattedAddress);
  assert.equal(data.estimate.price, fixtures.avm.price);
});

test("missing AVM subject falls back to property records and reports exact sources", async (t) => {
  const { cache } = await temporaryCache(t);
  const calls = [];
  const lookup = createLookup({
    cache,
    request: fakeRequest(calls, { "/avm/value": null, "/listings/sale": [] }),
  });
  const data = await lookup(address);
  assert.deepEqual(calls, ["/avm/value", "/listings/sale", "/properties"]);
  assert.deepEqual(data.sources, [
    "RentCast property records",
    "RentCast sale listings",
  ]);
  assert.equal(data.estimate, null);
  assert.equal(data.listing, null);
});

test("no results produce not-found and do not persist success cache", async (t) => {
  const { cache } = await temporaryCache(t);
  const lookup = createLookup({ cache, request: async () => null });
  await assert.rejects(lookup(address), { status: 404, code: "NOT_FOUND" });
  assert.equal(await cache.get(address), null);
});

test("invalid addresses never call the provider", async () => {
  const lookup = createLookup({
    request: () => assert.fail("invalid address sent upstream"),
  });
  for (const invalid of ["", "  ", undefined, ["address"], "x".repeat(301)])
    await assert.rejects(lookup(invalid), { status: 400 });
});

test("provider errors are sanitized and mapped; no response body or credential leaks", async () => {
  const sentinel = "test-only-credential";
  for (const [status, expected] of [
    [400, 404],
    [401, 503],
    [402, 429],
    [403, 503],
    [429, 429],
    [500, 502],
  ]) {
    const request = createRentCastClient({
      apiKey: sentinel,
      fetchImpl: async (url, options) => {
        assert.equal(options.headers["X-Api-Key"], sentinel);
        assert.equal(url.searchParams.get("address"), address);
        return new Response(sentinel, { status });
      },
    });
    await assert.rejects(
      request("/avm/value", address),
      (error) => error.status === expected && !error.message.includes(sentinel),
    );
  }
});

test("listing failures do not incorrectly claim Not currently listed; quota errors cool down", async (t) => {
  const { cache } = await temporaryCache(t);
  let calls = 0;
  const lookup = createLookup({
    cache,
    request: async (path) => {
      calls++;
      if (path === "/listings/sale")
        throw new LookupError(429, "RATE_LIMIT", "Limit reached");
      return fixtures.avm;
    },
  });
  await assert.rejects(lookup(address), { status: 429 });
  await assert.rejects(lookup(address), { status: 429 });
  assert.equal(calls, 2);
  assert.equal(await cache.get(address), null);
});

test("HTTP endpoint validates and sanitizes errors", async (t) => {
  const app = createApp(async (address) => {
    if (address === "failure") throw new Error("private provider details");
    throw new LookupError(404, "NOT_FOUND", "Address not found");
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const base = `http://127.0.0.1:${server.address().port}`;
  const failure = await fetch(`${base}/api/lookup?address=failure`);
  assert.equal(failure.status, 500);
  assert.ok(!(await failure.text()).includes("private"));
  const notFound = await fetch(`${base}/api/lookup?address=missing`);
  assert.equal(notFound.status, 404);
  assert.equal((await notFound.json()).error.code, "NOT_FOUND");
});
