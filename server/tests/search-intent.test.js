import test from "node:test";
import assert from "node:assert/strict";
import { classifyIntent } from "../../src/lib/search/intent.js";
import { parseRules } from "../search/nlParser.js";
import { createParseService } from "../search/parse.js";
const addresses = [
  "147 midway lane",
  "147 Midway Ln, Springfield, IL 62704",
  "1600 Pennsylvania Ave NW",
  "350 5th Ave apt 12",
  "147 Midway",
  "100 n main",
  "100 S Main St",
  "123 E Oak Rd",
  "12 W Pine Drive",
  "123 North Main Street",
  "42 South Elm Avenue",
  "7 East Lake Boulevard",
  "8 West Lake Court",
  "9 Cedar Way",
  "10 Ash Place",
  "11 Lake Terrace",
  "12 Oak Circle",
  "13 State Highway",
  "14 Lake Parkway",
  "15 Cedar Trail",
  "123 main st 3 beds",
  "  147   MIDWAY  LANE  ",
  "123 Main St.",
  "350 5TH AVE #12",
  "12 Oak St Unit 3",
  "12 Oak St Ste 3",
  "1600 pennsylvania avenue nw washington dc 20500",
  "1 First St, Seattle, WA",
  "101 1st Ave",
  "22 2nd Street",
  "33 3rd Road",
  "44 4th Ln",
  "55 5th Ave",
  "123B Main Street",
  "100-102 Main Street",
  "123 Home Rd",
  "123 Pool Lane",
  "123 House Ave",
];
const descriptions = [
  "4 bed house in los angeles under 1.5m",
  "10 acre lot in texas",
  "500 sqft studio",
  "2 beds under 600k",
  "3 bd 2 ba in Austin",
  "4 bedroom house",
  "3 bathroom home",
  "2 car garage",
  "3 story townhouse",
  "house in Los Angeles",
  "condo under 1.5M",
  "home with pool",
  "no HOA in Seattle",
  "under $500k",
  "between 400k and 700k",
  "near schools in Austin",
  "commute under 30 minutes",
  "1500 square feet",
  "2 baths above 800k",
  "studio in New York",
  "pool and garage",
  "new construction in Dallas",
  "pending homes in Boston",
  "coming soon in Miami",
  "recently sold homes",
  "townhouse in Portland",
  "4 BED HOUSE IN LOS ANGELES",
  "  house   in   austin ",
  "1 million max in LA",
  "2 homes near work",
  "3 condos in Seattle",
  "500k in Austin",
  "4.5 baths",
  "min 3 bedrooms",
  "in Seattle",
  "listings below 700k",
];
for (const [intent, rows] of [
  ["address", addresses],
  ["description", descriptions],
])
  for (const text of rows)
    test(`intent ${intent}: ${text}`, () =>
      assert.equal(classifyIntent(text).intent, intent));
test("mixed address text is separated and uncertain bare addresses remain candidates", () => {
  assert.equal(classifyIntent("123 Main St 3 beds").addressText, "123 Main St");
  assert.equal(classifyIntent("123 Main St 3 beds").ignoredText, "3 beds");
  assert.ok(classifyIntent("147 Midway").confidence < 0.9);
});
test("description acceptance variants work without a network or model", () => {
  for (const price of [
    "1.5m",
    "1.5M",
    "$1.5 million",
    "1.5mil",
    "1,500,000",
    "1500k",
  ]) {
    const p = parseRules(`4 bed house in  los   angeles under ${price}`);
    assert.equal(p.criteria.location, "Los Angeles, CA");
    assert.equal(p.criteria.maxPrice, 1500000, price);
    assert.equal(p.criteria.minBeds, 4);
    assert.deepEqual(p.criteria.homeTypes, ["house"]);
    assert.ok(p.assumptions.some((a) => a.includes("4 or more")));
  }
});
test("confident address and description parsing never call the language model", async () => {
  const parse = createParseService({
    fixtureMode: () => false,
    extract: () => assert.fail("no model needed"),
  });
  const a = await parse({ text: "147 midway lane" });
  assert.equal(a.intent, "address");
  assert.equal(a.criteria, undefined);
  const d = await parse({ text: "4 bed house in los angeles under 1.5m" });
  assert.equal(d.intent, "description");
  assert.equal(d.criteria.maxPrice, 1500000);
});
