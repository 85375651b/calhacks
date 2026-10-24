import test from "node:test";
import assert from "node:assert/strict";
import { crimeInput, normalizeCrime, loadCrime } from "../insights/crime.js";
import { sanitizeListing } from "../storage/favorites.js";

const observed = {
  type: "address-safety-score", city: "Vernon Hills", state: "IL",
  safetyScore: 9.5, violentPer100k: 70.3, population: 27046,
  nationalGrade: "A1/10", stateGrade: "B4/10", latestYear: "2025",
  scoreNote: "Relative scale across 214 cities in IL: safest = 10, most dangerous = 0. City-level, not street-level.",
};

test("crime uses full addresses and accepts legacy comma-separated ZIP formatting", () => {
  for (const input of [
    { address: "123 Main St, Vernon Hills, IL 60061" },
    { address: "123 Main St, Vernon Hills, IL, 60061" },
    { address: "123 Main St", city: "Vernon Hills", state: "IL", zip: "60061" },
  ]) assert.deepEqual(crimeInput(input), { address: "123 Main St, Vernon Hills, IL 60061" });
  for (const input of [{ zip: "60061" }, { address: "" }, { address: "123 Main St, IL" }])
    assert.throws(() => crimeInput(input), /full address/);
});

test("crime maps the verified actor output, preserving zero and missing values", () => {
  const data = normalizeCrime(observed);
  assert.equal(data.safetyScore, 9.5);
  assert.match(data.note, /Relative scale across 214 cities in IL/);
  assert.equal(data.violentPer100k, 70.3);
  assert.equal(data.area, "Vernon Hills, IL");
  assert.equal(data.nationalGrade, "A1/10");
  assert.equal(data.latestYear, "2025");
  const zero = normalizeCrime({ ...observed, safetyScore: 0, violentPer100k: 0 });
  assert.equal(zero.safetyScore, 0);
  assert.equal(zero.violentPer100k, 0);
  assert.equal(normalizeCrime({ type: "address-safety-score", safetyScore: 5 }).violentPer100k, null);
  for (const row of [undefined, { type: "not-covered" }, { type: "error" },
    { ...observed, safetyScore: 11 }, { ...observed, safetyScore: null },
    { overall_crime_grade: "A" }]) assert.throws(() => normalizeCrime(row), /unavailable/);
});

test("crime calls only the replacement actor and pins its address-based build", async () => {
  const result = await loadCrime({ address: "123 Main St, Vernon Hills, IL 60061" }, async (id, input, options) => {
    assert.equal(id, "QMw7eHkWvgqxhnd0C");
    assert.deepEqual(input, { address: "123 Main St, Vernon Hills, IL 60061" });
    assert.equal(options.build, "0.7.1");
    return [observed];
  });
  assert.equal(result.safetyScore, 9.5);
  for (const rows of [[], [{ type: "not-covered" }]])
    await assert.rejects(loadCrime({ address: "123 Main St, Vernon Hills, IL 60061" }, async () => rows), /unavailable/);
  await assert.rejects(loadCrime({ address: "123 Main St, Vernon Hills, IL 60061" }, async () => { throw new Error("Data temporarily limited"); }), /Data temporarily limited/);
});

test("favorites preserve new crime fields and discard old crime snapshots", () => {
  const listing = { id: "a".repeat(24), address: "123 Main St", snapshots: { crime: normalizeCrime(observed) } };
  const saved = sanitizeListing(listing).snapshots.crime;
  assert.equal(saved.safetyScore, 9.5);
  assert.equal(saved.violentPer100k, 70.3);
  assert.equal(saved.nationalGrade, "A1/10");
  assert.equal(saved.latestYear, "2025");
  listing.snapshots.crime = { source: "CrimeGrade via Apify", overall: "A" };
  assert.equal(sanitizeListing(listing).snapshots.crime, undefined);
});
