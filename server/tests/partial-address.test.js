import test from "node:test";
import assert from "node:assert/strict";
import { createAddressLookup } from "../search/address.js";
import { createCensusResolver } from "../providers/census.js";
import { normalizeProviderResults } from "../providers/autocomplete.js";
import { normalize } from "../search/listing.js";
import { createApp } from "../app.js";
import { parseAddressQuery, parseAddressText, matchesAddressQuery } from "../../src/lib/search/address.js";
import census from "../fixtures/census-partial-match.json" with { type: "json" };
const direct = async (_, fn) => fn();
const raw = { addressLine1: "16305 Almaden Dr", city: "Austin", state: "TX", zipCode: "78717", status: "Active", price: 635000 };
const home = normalize(raw, "RentCast", true);
const options = { fixtureMode: false, enabled: false, cache: direct, claim: async () => true, recent: async () => [],
  resolve: async () => [], provider: async () => [], verify: async p => p, request: async () => [raw] };
const resolver = () => createCensusResolver({ cache: direct, fetchImpl: async u => {
  assert.equal(u.searchParams.get("address"), "16305 Almaden Dr, Austin");
  assert.equal(u.searchParams.get("benchmark"), "Public_AR_Current");
  return { ok: true, status: 200, json: async () => census };
}});
for (const text of ["16305 Almaden Dr, Austin", "16305 Almaden Dr Austin", "16305 almaden drive austin"]) {
  test(`street and city resolve through the endpoint without state or ZIP: ${text}`, async t => {
    const lookup = createAddressLookup({ ...options, resolve: createCensusResolver({ cache: direct,
      fetchImpl: async () => ({ ok: true, status: 200, json: async () => census }) }),
      provider: () => assert.fail("a Census match does not need autocomplete"),
      verify: () => assert.fail("do not verify a Census result twice"),
      request: async (_, address) => { assert.match(address, /AUSTIN, TX 78717/); return [raw]; },
    });
    const server = createApp(undefined, { addressLookup: lookup }).listen(0, "127.0.0.1");
    await new Promise(resolve => server.once("listening", resolve));
    t.after(() => { server.closeAllConnections(); server.close(); });
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/search/address`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text }) });
    const v = await response.json();
    assert.equal(v.result, "for_sale");
    assert.equal(v.address.state, "TX");
    assert.equal(v.address.zip, "78717");
    assert.equal(v.listings[0].address, raw.addressLine1);
  });
}
test("partial parsing separates street, multiword city, units and directionals without inventing locality", () => {
  for (const [text, line1, city] of [
    ["5101 Trail West Dr Austin", "5101 Trail West Dr", "Austin"],
    ["147 Midway Ln Los Angeles", "147 Midway Ln", "Los Angeles"],
    ["1600 Pennsylvania Ave NW Washington", "1600 Pennsylvania Ave NW", "Washington"],
    ["1601 Faro Dr Apt 1303 Austin", "1601 Faro Dr Apt 1303", "Austin"],
    ["16305 Almaden, Austin", "16305 Almaden", "Austin"],
  ]) {
    const p = parseAddressQuery(text);
    assert.equal(p.line1, line1);
    assert.equal(p.city, city);
    assert.equal(p.state, "");
    assert.equal(p.zip, "");
  }
  assert.equal(parseAddressText("5101 Trail West Dr Austin TX").line1, "5101 Trail West Dr");
  assert.equal(parseAddressText("5101 Trail West Dr Austin TX").city, "Austin");
});
test("recent listing cache fills missing address components and honors the typed city", async () => {
  const lookup = createAddressLookup({ ...options, recent: async () => [home, { ...home, city: "Dallas" }],
    resolve: () => assert.fail("cached listings do not require geocoding"),
    request: () => assert.fail("cached listings do not require a paid request"),
  });
  for (const text of ["16305 Almaden Dr Austin", "16305 Almaden Dr, Austin", "16305 Almaden, Austin"]) {
    const v = await lookup({ text });
    assert.equal(v.result, "for_sale");
    assert.ok(v.listings.every(p => p.city === "Austin"));
    assert.equal(v.address.standardized.match(/Austin/g).length, 1);
  }
  const v = await lookup({ text: "16305 Almaden Dr Austin", selected: { line1: "999 Wrong St", city: "Dallas", state: "TX" } });
  assert.equal(v.result, "for_sale");
  assert.equal(v.address.city, "Austin");
});
test("fixtures respect city when state and ZIP are omitted; street-only ambiguity stays explicit", async () => {
  const lookup = createAddressLookup({ ...options, fixtureMode: true });
  for (const text of ["147 Midway Ln, Los Angeles", "147 Midway Ln Los Angeles"]) {
    const v = await lookup({ text });
    assert.equal(v.result, "for_sale");
    assert.equal(v.listings[0].city, "Los Angeles");
  }
  assert.equal((await lookup({ text: "147 Midway Ln" })).result, "ambiguous");
});
test("autocomplete filters other cities and never treats city text as part of the street", () => {
  const row = { country_code: "us", housenumber: "147", street: "Midway Lane", state_code: "CA", city: "Los Angeles", postcode: "90001", lat: 34, lon: -118, result_type: "building", rank: { confidence: 0.9 } };
  const rows = normalizeProviderResults({ results: [row, { ...row, city: "Springfield", state_code: "IL", postcode: "62704" }] }, "geoapify", "147 Midway Ln Los Angeles");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].city, "Los Angeles");
  assert.equal(rows[0].zip, "");
});
test("forward Census resolution is cached for seven days, preserves house identity, and reports failures", async () => {
  const rows = await resolver()("16305 Almaden Dr, Austin");
  assert.equal(rows[0].state, "TX");
  assert.equal(rows[0].verified, true);
  assert.ok(!matchesAddressQuery(parseAddressQuery("16306 Almaden Dr, Austin"), rows[0]));
  assert.ok(!matchesAddressQuery(parseAddressQuery("16305 Almaden Dr, Dallas"), rows[0]));
  let ttl;
  const resolve = createCensusResolver({ cache: async (_, fn, duration) => { const v = await fn(); ttl = duration(v); return v; },
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => census }) });
  await resolve("16305 Almaden Dr, Austin");
  assert.equal(ttl, 7 * 86400000);
  const fail = createCensusResolver({ cache: direct, fetchImpl: async () => { throw Error("timeout"); } });
  assert.equal((await fail("16305 Almaden Dr, Austin")).unavailable, true);
  const v = await createAddressLookup({ ...options, resolve: fail })({ text: "16305 Almaden Dr, Austin" });
  assert.equal(v.result, "check_failed");
});
test("autocomplete can still resolve a partial address when Census is unavailable", async () => {
  const candidate = { line1: raw.addressLine1, city: raw.city, state: raw.state, zip: "", lat: 30, lng: -97 };
  const lookup = createAddressLookup({ ...options, resolve: async () => { throw Error("timeout"); }, provider: async () => [candidate] });
  assert.equal((await lookup({ text: "16305 Almaden Dr, Austin" })).result, "for_sale");
});
