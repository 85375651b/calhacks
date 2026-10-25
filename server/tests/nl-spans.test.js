import test from "node:test";
import assert from "node:assert/strict";
import {
  parseRules,
  normalizeWithOffsets,
  editDistance,
} from "../search/nlParser.js";
for (const [text, expected] of [
  ["four bedroms <1 million dollars", { minBeds: 4, maxPrice: 1000000 }],
  [
    "3bd/2ba 8000 sqft lot HOA under 300",
    { minBeds: 3, minBaths: 2, minLotSize: 8000, maxHoa: 300 },
  ],
  ["1.8k sf 2-3 beds", { minSqft: 1800, minBeds: 2, maxBeds: 3 }],
  ["750-900k", { minPrice: 750000, maxPrice: 900000 }],
  ["700 to 900k", { minPrice: 700000, maxPrice: 900000 }],
  ["under 600", { maxPrice: 600000 }],
  ["90210 2 bed", { location: "90210", minBeds: 2 }],
  ["under 90210", { maxPrice: 90210 }],
  ["3+ beds 2 ba", { minBeds: 3, minBaths: 2 }],
  ["3 or more bedrooms", { minBeds: 3 }],
])
  test("span extraction " + text, () => {
    const p = parseRules(text);
    for (const [k, v] of Object.entries(expected))
      assert.deepEqual(p.criteria[k], v);
  });
test("original Unicode offsets survive spelling, number words and whitespace normalization", () => {
  const text = "  Four  bedroms ≤ $1.5M in Los Angeles";
  const p = parseRules(text);
  for (const s of p.understood)
    assert.equal(text.slice(s.start, s.end), s.text);
  for (let i = 1; i < p.understood.length; i++)
    assert.ok(p.understood[i - 1].end <= p.understood[i].start);
  assert.equal(p.criteria.minBeds, 4);
  assert.equal(p.criteria.maxPrice, 1500000);
  assert.ok(p.assumptions.some((s) => s.includes("bedroms")));
  assert.equal(normalizeWithOffsets("A  ≥  B").normalized, "a >= b");
  assert.equal(editDistance("bedroms", "bedrooms"), 1);
});
test("leftovers retain exact spans and do not masquerade as unsupported filters", () => {
  const p = parseRules("3 beds purple rocket under 900k");
  assert.equal(p.leftover[0].text, "purple rocket");
  assert.deepEqual(p.notApplied, []);
  assert.ok(p.unrecognized.some((x) => x.text === "purple rocket"));
  assert.equal(p.criteria.minBeds, 3);
  assert.equal(p.criteria.maxPrice, 900000);
});
test("number scopes do not overlap", () => {
  const p = parseRules(
    "3 beds 2 baths 2000 sqft HOA under 300 under 900k in 90210",
  );
  assert.equal(p.criteria.minBeds, 3);
  assert.equal(p.criteria.minBaths, 2);
  assert.equal(p.criteria.minSqft, 2000);
  assert.equal(p.criteria.maxHoa, 300);
  assert.equal(p.criteria.maxPrice, 900000);
  assert.equal(p.criteria.location, "90210");
});
