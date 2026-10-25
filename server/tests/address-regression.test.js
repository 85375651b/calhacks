import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { addressKey, exactAddress, parseAddressText, addressLabel } from "../../src/lib/search/address.js";
import { shouldRetryAddress, shouldRetryDescription } from "../../src/lib/search/intent.js";
import { createAddressLookup } from "../search/address.js";
import { createSearch } from "../search/index.js";
import { createApp } from "../app.js";
import { persistentMemo } from "../storage/memo.js";
import { normalize } from "../search/listing.js";
const direct = async (_, fn) => fn();
const p = { line1: "123 N Main Ln", city: "Austin", state: "TX", zip: "78701", lat: 30, lng: -97 };
const raw = (status = "Active") => ({ addressLine1: "123 North Main Lane", city: "Austin", state: "TX", zipCode: "78702", status, price: 500000 });
const options = { fixtureMode: false, enabled: false, cache: direct, claim: async () => true, recent: async () => [], provider: async () => [p], verify: async p => ({ ...p, verified: true, standardized: addressLabel(p) }), request: async () => [raw()] };
const suffixes = [["St", "Street"], ["Ave", "Avenue"], ["Ln", "Lane"], ["Rd", "Road"], ["Dr", "Drive"], ["Blvd", "Boulevard"], ["Ct", "Court"], ["Cir", "Circle"], ["Pkwy", "Parkway"], ["Hwy", "Highway"], ["Trl", "Trail"], ["Way", "Way"], ["Pl", "Place"]];
for (const [short, long] of suffixes) for (const [dir, full] of [["N", "North"], ["S", "South"], ["E", "East"], ["W", "West"], ["NW", "Northwest"]]) {
  test(`addressKey: ${dir} Main ${short} canonicalizes punctuation, case, suffix, direction and unit`, () => {
    assert.equal(addressKey(`123 ${dir}. Main ${short}. #4`), addressKey(`123 ${full} MAIN ${long} Apt 4`));
    assert.equal(addressKey(`123 ${dir} Main ${short}, Unit 4, Austin, TX 99999`), addressKey(`123 ${full} Main ${long} Ste 4`));
  });
}
test("ordinals, locality, house numbers, unit scopes and distance", () => {
  assert.equal(addressKey("12 Fifth Ave"), addressKey("12 5th Avenue"));
  assert.equal(addressKey("123 Main St, Austin, TX 99999"), addressKey("123 Main Street, Austin, TX 78701"));
  assert.ok(exactAddress(p, normalize(raw(), "RentCast", true)));
  assert.ok(!exactAddress(p, { ...normalize(raw(), "RentCast", true), address: "124 North Main Lane" }));
  assert.ok(!exactAddress(p, { ...normalize(raw(), "RentCast", true), city: "Dallas" }));
  assert.ok(exactAddress(p, { ...normalize(raw(), "RentCast", true), city: "Other", lat: 30.0001, lng: -97 }));
  assert.ok(!exactAddress(p, { ...normalize(raw(), "RentCast", true), city: "Other", lat: 31, lng: -97 }));
  assert.equal(parseAddressText("5101 Trail West Dr"), null);
});
test("complete typed text wins over stale selection; wrong ZIP matches listing and reports discrepancy", async () => {
  const calls = [];
  const lookup = createAddressLookup({ ...options, request: async (_, address) => { calls.push(address); return [raw()]; }});
  const v = await lookup({ text: "123 N Main Ln, Austin, TX 99999", selected: { ...p, line1: "999 Wrong Rd" } });
  assert.equal(calls[0], "123 N Main Ln, Austin, TX 99999");
  assert.equal(v.result, "for_sale");
  assert.equal(v.listings[0].zip, "78702");
  assert.match(v.listings[0].zipNote, /99999.*78702/);
});
test("errors/timeouts/caps never become cached negatives; conclusive positive can survive Census failure", async t => {
  const dir = await mkdtemp(join(tmpdir(), "address-regression-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const code of ["429", "500", "timeout", "cap"]) {
    let calls = 0;
    const lookup = createAddressLookup({ ...options, cache: persistentMemo(join(dir, code + ".json")), request: async () => { calls++; throw Object.assign(Error("secret should not be traced"), { code }); } });
    for (let n = 0; n < 2; n++) {
      const v = await lookup({ selected: p, debug: true });
      assert.equal(v.result, "check_failed");
      assert.equal(v.reasonCode, "SOURCE_UNAVAILABLE");
      assert.equal(v.listings, undefined);
      assert.doesNotMatch(JSON.stringify(v), /secret should/);
    }
    assert.equal(calls, 2);
  }
  const v = await createAddressLookup({ ...options, verify: async p => ({ ...p, verified: false, verificationUnavailable: true }) })({ selected: p });
  assert.equal(v.result, "for_sale");
  const fail = await createAddressLookup({ ...options, verify: async p => ({ ...p, verified: false, verificationUnavailable: true }), request: async () => [] })({ selected: p });
  assert.equal(fail.result, "check_failed");
  for (const source of ["geocoder", "Apify"]) {
    const v = await createAddressLookup({ ...options, provider: async () => { if (source === "geocoder") throw Error(); return [p]; }, request: async () => [], enabled: source === "Apify", runner: async () => { throw Error(); } })({ text: "123 N Main Ln" });
    assert.equal(v.result, "check_failed");
  }
});
test("request variants, radius fallback, one bounded Apify run and in-flight dedupe", async () => {
  const variants = [];
  let actors = 0;
  const lookup = createAddressLookup({ ...options, enabled: true, request: async (_, address, params) => { variants.push({ address, params }); return []; }, runner: async () => { actors++; return [raw()]; } });
  const results = await Promise.all([lookup({ selected: p }), lookup({ selected: p })]);
  assert.equal(actors, 1);
  assert.ok(results.every(v => v.result === "for_sale"));
  assert.ok(variants.length <= 5);
  const radius = variants.find(v => v.params.radius);
  assert.equal(radius.params.latitude, "30");
  assert.equal(radius.params.longitude, "-97");
  assert.equal(radius.address, undefined);
});
test("pending, sold, coming soon, rentals stay private; unknown sale-query status remains visible", async () => {
  for (const status of ["Pending", "Sold", "Coming Soon", "For Rent"]) {
    const v = await createAddressLookup({ ...options, request: async () => [raw(status)] })({ selected: p });
    assert.equal(v.result, "not_for_sale");
    assert.equal(v.listings, undefined);
  }
  assert.equal((await createAddressLookup({ ...options, request: async () => [raw("NewObservedSaleStatus")] })({ selected: p })).result, "for_sale");
});
test("intent safety nets are bounded in both directions", () => {
  assert.equal(shouldRetryAddress("find 123 Main Street in Austin"), true);
  assert.equal(shouldRetryAddress("3 beds under 500k"), false);
  assert.equal(shouldRetryDescription("123 Main Street under 500k in Austin"), true);
  assert.equal(shouldRetryDescription("123 Main Street, Austin, TX 78701"), false);
});
test("every displayed fixture round-trips through HTTP in typed variants and ignores criteria filters", async t => {
  const found = await createSearch({ fixtureMode: true, cache: direct })({ location: "Austin, TX", limit: 50 });
  assert.ok(found.listings.length > 0);
  const app = createApp(undefined, { addressLookup: createAddressLookup({ ...options, fixtureMode: true }) });
  const server = app.listen(0, "127.0.0.1");
  await new Promise(resolve => server.once("listening", resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  let i = 0;
  for (const listing of found.listings) {
    const full = listing.address.includes(",") ? listing.address : addressLabel({ ...listing, line1: listing.address });
    const variants = [full, full.toLowerCase(), full.replace(/\b\d{5}(?:-\d{4})?\s*$/, ""), full.replace(/\b\d{5}(?:-\d{4})?\s*$/, "99999"), full.replace(/\bLn\b/gi, "Lane").replace(/\bDr\b/gi, "Drive")];
    for (const text of variants) {
      const response = await fetch(`http://127.0.0.1:${server.address().port}/api/search/address`, { method: "POST", headers: { "Content-Type": "application/json", "X-Client-Id": "roundtrip-" + i++ }, body: JSON.stringify({ text, criteria: { maxPrice: 1, minBeds: 20, homeTypes: ["land"], sources: [], radius: 0, commute: 1, hidden: true } }) });
      const v = await response.json();
      assert.equal(v.result, "for_sale", text + " " + JSON.stringify(v));
      assert.ok(v.listings.some(p => exactAddress({ ...listing, line1: listing.address }, p)), text);
    }
  }
  const ui = await readFile(new URL("../../src/components/search/AddressResults.jsx", import.meta.url), "utf8");
  assert.doesNotMatch(ui, /postFilter|criteria|commuteLimit|hiddenGroups/);
});
