import test from "node:test";
import assert from "node:assert/strict";
import corpus from "./fixtures/nlCorpus.json" with { type: "json" };
import { measureCorpus } from "../scripts/measureParse.js";
import { parseRules } from "../search/nlParser.js";
import { classifyIntent } from "../../src/lib/search/intent.js";
test("236 labeled queries, including 40 exact addresses, meet rules-only accuracy and performance targets", async () => {
  assert.ok(corpus.length >= 200);
  assert.ok(corpus.filter((c) => c.expected.intent === "address").length >= 40);
  const result = await measureCorpus();
  assert.ok(result.passRate >= 95, JSON.stringify(result.failed));
  assert.equal(result.modelCalls, 0);
  assert.ok(result.rulesP95Ms < 100);
  assert.ok(result.p95Ms < 2500);
});
test("screenshot shorthand and number-leading descriptions stay descriptions; addresses route first", () => {
  for (const text of [
    "3bed san francisco, <1 million dollars",
    "4 bed los angeles",
    "10 acre lot in texas",
    "3 bd 2 ba la",
    "4 bdrm austin",
    "3 bedroms austin",
    "700 to 900k in Austin",
  ])
    assert.equal(classifyIntent(text).intent, "description", text);
  const p = parseRules("3bed san francisco, <1 million dollars");
  assert.equal(p.criteria.minBeds, 3);
  assert.equal(p.criteria.maxPrice, 1000000);
  for (const c of corpus.filter((c) => c.expected.intent === "address"))
    assert.equal(classifyIntent(c.text).intent, "address", c.text);
});
