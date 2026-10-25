import test from "node:test";
import assert from "node:assert/strict";
import { createAddressLookup } from "../search/address.js";
import { createCensusVerifier } from "../providers/census.js";
import {
  exactAddress,
  normalizeAddress,
  splitAddress,
} from "../../src/lib/search/address.js";
import { normalize } from "../search/listing.js";
import { createApp } from "../app.js";
import { persistentMemo } from "../storage/memo.js";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const p = {
  line1: "123 N Main St",
  city: "Austin",
  state: "TX",
  zip: "78701",
  lat: 30,
  lng: -97,
  label: "123 N Main St, Austin, TX 78701",
};
const raw = (address = "123 North Main Street", status = "Active") => ({
  address,
  city: "Austin",
  state: "TX",
  zipCode: "78701",
  status,
  price: 500000,
});
const direct = async (k, fn) => fn();
const options = {
  claim: async () => true,
  fixtureMode: false,
  enabled: false,
  cache: direct,
  provider: async () => [p],
  verify: async (p) => ({ ...p, verified: true }),
  recent: async () => [],
  request: async () => [],
};
test("exact address matching preserves number, street, ZIP and requested unit", () => {
  assert.equal(normalizeAddress(" 123 N. Main St. "), "123 north main street");
  assert.equal(splitAddress("12 Oak St Apt 3").unit, "3");
  assert.ok(exactAddress(p, raw()));
  assert.ok(!exactAddress(p, raw("124 Main St")));
  assert.ok(
    !exactAddress({ ...p, line1: p.line1 + " #3" }, raw(p.line1 + " Unit 4")),
  );
  assert.ok(exactAddress(p, raw(p.line1 + " Apt 4")));
});
test("cache, RentCast and one Apify fallback return only exact active matches", async () => {
  let calls = 0;
  let lookup = createAddressLookup({
    ...options,
    recent: async () => [normalize(raw(), "RentCast", true)],
    request: async () => {
      throw Error("must not call");
    },
  });
  assert.equal((await lookup({ selected: p })).result, "for_sale");
  lookup = createAddressLookup({
    ...options,
    request: async (path, address, params) => {
      calls++;
      assert.equal(path, "/listings/sale");
      assert.equal(params.status, "Active");
      return [raw(), raw("124 Main St"), raw("123 N Main St Apt 2", "Pending")];
    },
  });
  let v = await lookup({ text: "123 N Main St" });
  assert.equal(v.listings.length, 1);
  assert.equal(calls, 1);
  lookup = createAddressLookup({
    ...options,
    enabled: true,
    runner: async (id, input) => {
      calls++;
      assert.equal(input.listingStatus, "forSale");
      return [raw()];
    },
  });
  assert.equal((await lookup({ selected: p })).result, "for_sale");
  assert.equal(calls, 2);
});
test("negative, unknown, ambiguous and multi-unit states do not leak unavailable facts", async () => {
  const lookup = createAddressLookup({
    ...options,
    request: async () => [raw("123 N Main St", "Sold"), raw("124 N Main St")],
  });
  const v = await lookup({ selected: p });
  assert.equal(v.result, "not_for_sale");
  assert.equal(v.listings, undefined);
  assert.equal(v.price, undefined);
  assert.equal(
    (
      await createAddressLookup({ ...options, provider: async () => [] })({
        text: "unknown",
      })
    ).result,
    "not_found",
  );
  const amb = await createAddressLookup({
    ...options,
    provider: async () => [p, { ...p, city: "Dallas", zip: "75001" }],
  })({ text: "123 N Main St" });
  assert.equal(amb.result, "ambiguous");
  assert.equal(amb.candidates.length, 2);
  const units = await createAddressLookup({
    ...options,
    request: async () => [raw(p.line1 + " Apt 1"), raw(p.line1 + " Apt 2")],
  })({ selected: p });
  assert.equal(units.listings.length, 2);
  assert.match(units.message, /units/);
});
test("Census failure continues unverified; successful standardization is cached for seven days", async () => {
  for (const fetchImpl of [
    async () => {
      throw Error("timeout");
    },
    async () => ({ ok: false }),
  ])
    assert.equal(
      (await createCensusVerifier({ fetchImpl, cache: direct })(p)).verified,
      false,
    );
  let ttl;
  const verify = createCensusVerifier({
    cache: async (k, fn, t) => {
      const v = await fn();
      ttl = t(v);
      return v;
    },
    fetchImpl: async () => ({
      ok: true,
      json: async () => ({
        result: {
          addressMatches: [
            { matchedAddress: p.label, coordinates: { x: -97, y: 30 } },
          ],
        },
      }),
    }),
  });
  assert.equal((await verify(p)).verified, true);
  assert.equal(ttl, 7 * 86400000);
});
test("offline fixture states, input validation and client cap", async () => {
  const lookup = createAddressLookup({ ...options, fixtureMode: true });
  assert.equal(
    (await lookup({ text: "5101 Trail West Dr" })).result,
    "for_sale",
  );
  assert.equal(
    (await lookup({ text: "100 Pending St" })).result,
    "not_for_sale",
  );
  assert.equal((await lookup({ text: "200 Sold St" })).result, "not_for_sale");
  assert.equal((await lookup({ text: "147 Midway Ln" })).result, "ambiguous");
  assert.equal(
    (await lookup({ text: "999 Unknown Street" })).result,
    "not_found",
  );
  await assert.rejects(lookup({ selected: { line1: "123" } }), /complete/);
  for (let i = 0; i < 14; i++) await lookup({ text: "999 Unknown Street" });
  await assert.rejects(lookup({ text: "999 Unknown Street" }), /Too many/);
});
test("persistent positive and negative checks coalesce and expire at one hour", async (t) => {
  const dir = await mkdtemp(join(tmpdir(), "address-cache-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  let time = 100000,
    calls = 0;
  const lookup = createAddressLookup({
    ...options,
    now: () => time,
    cache: persistentMemo(join(dir, "cache.json"), { now: () => time }),
    request: async () => {
      calls++;
      return [raw()];
    },
  });
  const values = await Promise.all([
    lookup({ selected: p }),
    lookup({ selected: p }),
  ]);
  assert.equal(calls, 1);
  assert.deepEqual(values[0], values[1]);
  time += 3599000;
  await lookup({ selected: p });
  assert.equal(calls, 1);
  time += 2000;
  await lookup({ selected: p });
  assert.equal(calls, 2);
  const negative = createAddressLookup({
    ...options,
    cache: persistentMemo(join(dir, "negative.json")),
    request: async () => {
      calls++;
      return [];
    },
  });
  await negative({ selected: p });
  await negative({ selected: p });
  assert.ok(calls >= 3); // Multiple bounded address variants may be tried on a conclusive miss.
});
test("daily cap and disabled Apify avoid external sale requests", async () => {
  const lookup = createAddressLookup({
    ...options,
    claim: async () => false,
    request: () => assert.fail("daily cap must prevent request"),
    runner: () => assert.fail("disabled actor must not run"),
  });
  const v = await lookup({ selected: p });
  assert.equal(v.result, "check_failed");
  assert.deepEqual(v.unavailable, ["RentCast"]);
  assert.equal(v.listings, undefined);
});
test("all public home search routes apply the sale-only boundary; lookup never returns negative facts", async (t) => {
  const mixed = async () => ({
    listings: [
      normalize(raw(), "RentCast", true),
      normalize(raw("123 Main St", "Sold"), "RentCast", true),
    ],
  });
  const app = createApp(undefined, {
    addressLookup: createAddressLookup({ ...options, fixtureMode: true }),
    searchProvider: mixed,
    describedProvider: mixed,
    moreProvider: mixed,
  });
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of [
    "/api/search",
    "/api/search/described",
    "/api/search/commute-more",
    "/api/search/address",
  ]) {
    const r = await fetch(base + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "5101 Trail West Dr" }),
    });
    assert.equal(r.status, 200);
    const v = await r.json();
    assert.ok(v.listings.length);
    assert.ok(v.listings.every((p) => p.status === "for_sale"));
  }
  for (const address of ["100 Pending St", "200 Sold St"]) {
    const v = await (
      await fetch(base + "/api/lookup?" + new URLSearchParams({ address }))
    ).json();
    assert.equal(v.result, "not_for_sale");
    for (const key of ["listings", "price", "photos", "estimate", "bedrooms"])
      assert.equal(v[key], undefined);
  }
  const parsed = await (
    await fetch(base + "/api/search/parse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "147 Midway Ln" }),
    })
  ).json();
  assert.equal(parsed.intent, "address");
  assert.equal(parsed.criteria, undefined);
});
