import test from "node:test";
import assert from "node:assert/strict";
import census from "../fixtures/census-live-match.json" with { type: "json" };
import { createCensusVerifier } from "../providers/census.js";
import { fastSuggestion, verifiedRows } from "../../src/lib/search/suggestions.js";
import { normalizeProviderResults } from "../providers/autocomplete.js";
import fixtures from "../fixtures/address-pipeline.json" with { type: "json" };
const p = { line1: "1600 Pennsylvania Ave NW", city: "Washington", state: "DC", zip: "20001", lat: 38.9, lng: -77 };
test("saved Geoapify and Census no-match fixtures stay ZIP-free", async () => {
  const rows = normalizeProviderResults(fixtures.geoapify, "geoapify", "123 N Main Ln");
  assert.equal(rows[0].providerZip, "78701");
  assert.equal(rows[0].zip, "");
  const verify = createCensusVerifier({ cache: async (_, fn) => fn(), fetchImpl: async () => ({ ok: true, status: 200, json: async () => fixtures.censusNoMatch }) });
  const result = await verify(rows[0]);
  assert.equal(result.verified, false);
  assert.equal(result.zip, "");
});
test("Census corrects wrong provider ZIP and verifies candidates without a ZIP", async () => {
  const verify = createCensusVerifier({ cache: async (_, fn) => fn(), fetchImpl: async u => {
    assert.doesNotMatch(u.searchParams.get("address"), /20001/);
    assert.equal(u.searchParams.get("benchmark"), "Public_AR_Current");
    return { ok: true, status: 200, json: async () => census };
  }});
  for (const zip of ["20001", ""]) {
    const result = await verify({ ...p, zip });
    assert.equal(result.verified, true);
    assert.equal(result.zip, "20500");
  }
});
test("fast and unverified suggestions never display ZIP; verification never reorders or edits text", () => {
  const rows = [p, { ...p, line1: "1601 Pennsylvania Ave NW" }].map(fastSuggestion);
  assert.ok(rows.every(p => !p.zip && !/\d{5}/.test(p.label)));
  const verified = verifiedRows(rows, [{ originalLabel: rows[0].label, verified: true, zip: "20500", standardized: "Census address" }]);
  assert.equal(verified[0].line1, rows[0].line1);
  assert.equal(verified[1], rows[1]);
  assert.match(verified[0].label, /20500/);
  assert.equal(verifiedRows(rows, [{ originalLabel: "stale", verified: true, zip: "20500" }])[0], rows[0]);
});
test("reject impossible state prefix; discard malformed postcodes", () => {
  const row = { country_code: "us", housenumber: "123", street: "Main St", city: "Austin", state_code: "TX", lat: 30, lon: -97, result_type: "building", rank: { confidence: 0.9 } };
  assert.equal(normalizeProviderResults({ results: [{ ...row, postcode: "90001" }] }, "geoapify", "123 Main St").length, 0);
  const result = normalizeProviderResults({ results: [{ ...row, postcode: "123" }] }, "geoapify", "123 Main St");
  assert.equal(result[0].zip, "");
  assert.equal(result[0].providerZip, "");
});
