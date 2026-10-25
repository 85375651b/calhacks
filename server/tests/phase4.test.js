import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { validateCriteria, siteUrl } from "../search/criteria.js";
import {
  normalize,
  mergeListings,
  postFilter,
  unapplied,
} from "../search/listing.js";
import * as zillow from "../search/adapters/zillow.js";
import * as redfin from "../search/adapters/redfin.js";
import { createSearch, rentcastParams } from "../search/index.js";
import { persistentMemo } from "../storage/memo.js";
import { createFavorites, sanitizeListing } from "../storage/favorites.js";
import { nextTuesday, normalizeTrip } from "../providers/commute.js";
import { normalizeSchools } from "../insights/schools.js";
import { normalizeHazards } from "../insights/hazards.js";
import { haversine } from "../insights/groceries.js";
import { insightHandlers } from "../insights/index.js";
import { config } from "../config.js";
const raw = {
  address: "123 Main Street #2",
  city: "Austin",
  state: "TX",
  zip: "78704",
  price: 500000,
  beds: 3,
  baths: 2,
  sqFt: 1500,
  latitude: 30.25,
  longitude: -97.75,
  url: "https://www.redfin.com/TX/Austin/example/home/1",
};
const noCache = async (_key, fn) => fn();
async function temp(t) {
  const dir = await mkdtemp(join(tmpdir(), "propertylens-v4-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  return dir;
}
test("canonical validation clamps bounds, rejects invalid enums/URLs and clears any", () => {
  const c = validateCriteria({
    location: " Austin, TX ",
    minPrice: -1,
    maxPrice: 1e12,
    minBaths: 1.5,
    stories: "",
    pool: true,
    limit: 1000,
    views: ["water", "water"],
  });
  assert.equal(c.limit, 50);
  assert.equal(c.minPrice, 0);
  assert.equal(c.maxPrice, 1e8);
  assert.equal(c.stories, undefined);
  assert.deepEqual(c.views, ["water"]);
  for (const input of [
    { location: "x", status: "rent" },
    { location: "x", minBeds: {} },
    { location: "x", sources: [] },
    { location: "x", minPrice: 9, maxPrice: 2 },
    { searchUrl: "https://zillow.com.evil.test/" },
    { searchUrl: "https://zillow.com@evil.test/" },
    { searchUrl: "http://zillow.com/" },
    { searchUrl: "https://www.redfin.com:8080/" },
  ])
    assert.throws(() => validateCriteria(input));
  assert.equal(
    siteUrl("https://www.zillow.com/austin-tx/", "zillow"),
    "https://www.zillow.com/austin-tx/",
  );
});
test("adapters send only documented fields and URL overrides omit form filters", () => {
  const c = validateCriteria({
    location: "Austin, TX",
    minBeds: 3,
    exactBeds: true,
    minBaths: 1.5,
    pool: true,
    noHoa: true,
    maxSqft: 3000,
    views: ["water"],
  });
  const z = zillow.buildInput(c);
  assert.equal(z.maxBeds, 3);
  assert.equal(z.maxHoaFee, 0);
  assert.equal(z.minBaths, 1.5);
  assert.equal(z.includeDetails, false);
  const r = redfin.buildInput(c);
  assert.equal(r.maxSqFt, 3000);
  assert.equal(r.maxHOA, undefined);
  assert(unapplied(c, redfin.supportedFilters).includes("pool"));
  assert.deepEqual(
    zillow.buildInput({ ...c, searchUrl: "https://www.zillow.com/austin-tx/" }),
    {
      maxResults: 12,
      includeDetails: false,
      compact: true,
      listingStatus: "forSale",
      searchUrls: [{ url: "https://www.zillow.com/austin-tx/" }],
    },
  );
  assert.equal(
    redfin.buildInput({
      ...c,
      searchUrl: "https://www.redfin.com/city/30818/TX/Austin",
    }).minBeds,
    undefined,
  );
});
test("merge standardizes street and unit while keeping separate units and both URLs", () => {
  const a = normalize(raw, "Redfin"),
    b = normalize(
      {
        ...raw,
        address: "123 Main St Apt 2, Austin, TX 78704",
        propertyUrl: "https://www.zillow.com/homedetails/1_zpid/",
        yearBuilt: 1999,
      },
      "Zillow",
    );
  const merged = mergeListings([
    a,
    b,
    normalize({ ...raw, address: "123 Main St Unit 3" }, "Redfin"),
  ]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged[0].sources, ["Redfin", "Zillow"]);
  assert.equal(merged[0].yearBuilt, 1999);
  assert(merged[0].redfinUrl && merged[0].zillowUrl);
});
test("post-filters never discard missing fields", () => {
  assert(
    postFilter(
      { price: null, beds: null, sqft: null, hoaMonthly: null, homeType: null },
      { minPrice: 500000, minBeds: 4, noHoa: true, homeTypes: ["house"] },
    ),
  );
  assert(!postFilter({ price: 200000 }, { minPrice: 400000 }));
  assert(!postFilter({ beds: 4 }, { minBeds: 3, exactBeds: true }));
  assert(!postFilter({ stories: 1 }, { stories: "multi" }));
  assert(!postFilter({ hoaMonthly: 20 }, { noHoa: true }));
});
test("one source failure preserves success and never calls fallback or unchecked sources", async () => {
  const calls = [];
  const search = createSearch({
    fixtureMode: false,
    cache: noCache,
    runner: async (id) => {
      calls.push(id);
      if (id.includes("TopApi")) throw new Error("timed out");
      return [raw];
    },
    fallbackProvider: () => {
      throw new Error("must not fallback");
    },
    geocode: () => [],
  });
  const r = await search({ location: "Austin, TX" });
  assert.equal(r.listings.length, 1);
  assert.equal(r.sourceErrors.Zillow, "timed out");
  calls.length = 0;
  await search({ location: "Austin, TX", sources: ["Redfin"] });
  assert.equal(calls.length, 1);
  assert(calls[0].includes("redfin"));
});
test("both failures use labeled fallback; valid empty results do not", async () => {
  let fallback = 0;
  const search = createSearch({
    fixtureMode: false,
    cache: noCache,
    runner: async () => {
      throw new Error("no");
    },
    fallbackProvider: async () => {
      fallback++;
      return [normalize({...raw,status:"Active"}, "RentCast")];
    },
    geocode: () => [],
  });
  const r = await search({ location: "Austin, TX" });
  assert.equal(fallback, 1);
  assert.deepEqual(r.listings[0].sources, ["RentCast"]);
  assert.equal(r.listings[0].photoUrl, null);
  assert.equal(Object.keys(r.sourceErrors).length, 2);
  const empty = createSearch({
    fixtureMode: false,
    cache: noCache,
    runner: async () => [],
    fallbackProvider: () => assert.fail(),
  });
  assert.equal((await empty({ location: "Austin, TX" })).listings.length, 0);
});
test("RentCast fallback uses documented range and location fields", () => {
  assert.deepEqual(
    rentcastParams(
      validateCriteria({
        location: "78704",
        minBeds: 3,
        minPrice: 300000,
        maxPrice: 600000,
        homeTypes: ["house"],
      }),
    ),
    {
      limit: "12",
      status: "Active",
      zipCode: "78704",
      bedrooms: "3:",
      price: "300000:600000",
      propertyType: "Single Family",
    },
  );
});
test("persistent memo coalesces requests, survives restart and expires failures in five minutes", async (t) => {
  const dir = await temp(t),
    file = join(dir, "cache.json");
  let now = 1000,
    calls = 0;
  const cache = persistentMemo(file, { now: () => now }),
    fn = async () => {
      calls++;
      return { ok: true };
    };
  await Promise.all([cache("key", fn, 1000), cache("key", fn, 1000)]);
  assert.equal(calls, 1);
  const restarted = persistentMemo(file, { now: () => now });
  await restarted("key", fn);
  assert.equal(calls, 1);
  now += 1001;
  await restarted("key", fn);
  assert.equal(calls, 2);
  const fail = async () => {
    calls++;
    throw new Error("unavailable");
  };
  await assert.rejects(cache("failure", fail));
  await assert.rejects(cache("failure", fail));
  assert.equal(calls, 3);
  now += 300001;
  await assert.rejects(cache("failure", fail));
  assert.equal(calls, 4);
});
test("favorite writes serialize across concurrent adds, cap at five, persist and isolate clients", async (t) => {
  const file = join(await temp(t), "data", "favorites.json"),
    store = createFavorites(file),
    id = randomUUID(),
    other = randomUUID();
  const listings = Array.from({ length: 6 }, (_, i) =>
    normalize({ ...raw, address: i + 1 + " Main St" }, "Redfin"),
  );
  const results = await Promise.allSettled(
    listings.map((p) => store.add(id, p)),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 5);
  assert.equal((await store.list(id)).length, 5);
  assert.equal((await store.list(other)).length, 0);
  const restarted = createFavorites(file);
  assert.equal((await restarted.list(id)).length, 5);
  await restarted.remove(id, listings[0].id);
  await restarted.add(id, listings[5]);
  assert.equal((await restarted.list(id)).length, 5);
  assert.throws(() => store.add("bad", listings[0]));
  assert.equal(JSON.parse(await readFile(file, "utf8"))[id].length, 5);
});
test("favorites whitelist fields, links, image hosts and snapshot structures", () => {
  const p = sanitizeListing({
    ...normalize(raw, "Redfin"),
    zillowUrl: "javascript:alert(1)",
    photoUrl: "https://evil.test/pixel",
    secret: "should not persist",
    snapshots: {
      schools: {
        source: "test",
        schools: [{ name: "Test", rating: 7, grades: "K-5" }],
        photos: ["https://evil.test/a"],
        token: "no",
      },
    },
  });
  assert.equal(p.zillowUrl, null);
  assert.equal(p.photoUrl, null);
  assert.equal(p.secret, undefined);
  assert.equal(p.snapshots.schools.token, undefined);
  assert.deepEqual(p.snapshots.schools.photos, []);
  assert.equal(p.snapshots.schools.schools[0].rating, 7);
});
test("next Tuesday uses home-local calendar across DST and excludes today", () => {
  assert.deepEqual(
    nextTuesday(30.25, -97.75, new Date("2026-10-24T12:00:00Z")),
    { date: "2026-10-27", timezone: "America/Chicago" },
  );
  assert.equal(
    nextTuesday(30.25, -97.75, new Date("2026-10-27T12:00:00Z")).date,
    "2026-11-03",
  );
  assert.equal(
    normalizeTrip({
      status: "OK",
      durationInTrafficSeconds: 2100,
      distanceMeters: 1609.344,
    }).minutes,
    35,
  );
  assert.throws(() => normalizeTrip({ status: "NO_ROUTE" }));
});
test("insight normalizers preserve missing data and geography; distance is straight-line", () => {
  assert.throws(() =>
    normalizeHazards({ risk_rating: "Low", resolution_used: "county" }),
  );
  const s = normalizeSchools({
    nearbySchools: [
      { name: "Public", type: "Public", rating: 8 },
      { name: "Private", type: "Private", rating: 10 },
      { name: "Missing", type: "Public" },
    ],
  });
  assert.equal(s.average, 8);
  assert.equal(s.schools.length, 2);
  assert.equal(s.schools[1].rating, null);
  assert(
    Math.abs(haversine({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }) - 69.09) < 0.1,
  );
});
test("all five insight fixtures and search work with fetch disabled and no keys", async () => {
  const original = { ...config },
    fetchBefore = global.fetch;
  config.useFixtures = true;
  config.apifyToken = "";
  config.apiKey = "";
  global.fetch = () => {
    throw new Error("unexpected external request");
  };
  try {
    const search = createSearch({ fixtureMode: true, cache: noCache });
    const r = await search({
      location: "Austin, TX",
      maxPrice: 900000,
      minBeds: 2,
    });
    assert(r.listings.every((p) => p.status === "for_sale"));
    for (const [k, handler] of Object.entries(insightHandlers)) {
      const d = await handler({
        zip: "78735",
        city: "Austin",
        state: "TX",
        lat: "30.251",
        lng: "-97.833",
        workLat: "30.2672",
        workLng: "-97.7431",
        address: "5101 Trail West Dr",
        listingId: r.listings[0].id,
      });
      assert.equal(d.usingFixtures, true, k);
      assert(d.source, k);
    }
  } finally {
    Object.assign(config, original);
    global.fetch = fetchBefore;
  }
});
import { createRunGuard } from "../providers/actor.js";
test("global actor guard serializes reservations and survives restart until the rolling hour expires", async (t) => {
  const file = join(await temp(t), "budget.json");
  let now = 10000000;
  const guard = createRunGuard(file, { now: () => now, max: 2 });
  const r = await Promise.allSettled([guard(), guard(), guard()]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 2);
  const restarted = createRunGuard(file, { now: () => now, max: 2 });
  await assert.rejects(restarted(), /Data temporarily limited/);
  now += 3600001;
  await restarted();
});
