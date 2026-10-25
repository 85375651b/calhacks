import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { handleUnrecognized } from "../../src/lib/search/describeState.js";
import { parseRules, EXAMPLES } from "../search/nlParser.js";
const parsed = () => ({
  ...parseRules("Austin purple rocket 3 beds"),
  capabilities: { keywords: true },
  unrecognized: [{ text: "purple rocket", suggestions: [] }],
});
test("keyword action preserves criteria and records an explicit choice without mutating saved interpretation", () => {
  const p = parsed(),
    next = handleUnrecognized(p, "purple rocket", "keyword");
  assert.equal(next.criteria.minBeds, 3);
  assert.equal(next.criteria.keywords, "purple rocket");
  assert.equal(next.unrecognized.length, 0);
  assert.equal(p.unrecognized.length, 1);
  assert.ok(next.assumptions.some((s) => s.includes("keyword")));
  const restored = JSON.parse(JSON.stringify(next));
  assert.deepEqual(restored, next);
});
test("ignore action keeps explicit constraints and records dismissed text", () => {
  const p = handleUnrecognized(parsed(), "purple rocket", "ignore");
  assert.equal(p.criteria.minBeds, 3);
  assert.equal(p.criteria.keywords, undefined);
  assert.equal(p.unrecognized.length, 0);
  assert.ok(p.assumptions.some((s) => s.includes("Ignored")));
  assert.throws(
    () =>
      handleUnrecognized(
        { ...parsed(), capabilities: { keywords: false } },
        "purple rocket",
        "keyword",
      ),
    /not supported/,
  );
  assert.throws(
    () => handleUnrecognized(parsed(), "x".repeat(201), "keyword"),
    /too long/,
  );
});
test("examples include bare cities, notations and an exact address", () => {
  assert.ok(EXAMPLES.includes("4 bed los angeles"));
  assert.ok(EXAMPLES.includes("austin tx 3/2 with pool"));
  assert.ok(EXAMPLES.some((s) => /^1600/.test(s)));
});
test("interpretation exposes unknown actions, keyboard questions and restoration without the obsolete message", async () => {
  const component = await readFile(
    new URL("../../src/components/search/DescribeSearch.jsx", import.meta.url),
    "utf8",
  );
  for (const phrase of [
    "Search it as a keyword",
    "Ignore it",
    "Edit in filters",
    "aria-live",
    "lastLocation",
  ])
    assert.ok(component.includes(phrase));
  const obsolete = [
    "Not recognized as a supported filter.",
    "Try a specific field or edit the filters.",
  ].join(" ");
  for (const path of [
    "../search/nlParser.js",
    "../../src/components/search/DescribeSearch.jsx",
    "../search/places.js",
  ])
    assert.ok(
      !(await readFile(new URL(path, import.meta.url), "utf8")).includes(
        obsolete,
      ),
    );
  const home = await readFile(
    new URL("../../src/pages/Home.jsx", import.meta.url),
    "utf8",
  );
  assert.match(home, /parsed: restored\?\.parsed|restored\?\.parsed/);
  assert.match(home, /writeSession\("propertylens.search"/);
});
