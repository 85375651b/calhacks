import { readFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { createParseService } from "../search/parse.js";
import { createPlaceResolver } from "../search/places.js";
import { parseRules } from "../search/nlParser.js";

const corpus = JSON.parse(
  await readFile(
    new URL("../tests/fixtures/nlCorpus.json", import.meta.url),
    "utf8",
  ),
);
export function subset(actual, expected) {
  if (Array.isArray(expected))
    return JSON.stringify(actual) === JSON.stringify(expected);
  if (expected && typeof expected === "object")
    return Object.entries(expected).every(([k, v]) => subset(actual?.[k], v));
  return actual === expected;
}
export async function measureCorpus() {
  let modelCalls = 0;
  const resolve = createPlaceResolver({
    fixtureMode: () => true,
    provider: async () => {
      throw Error("No network in corpus");
    },
  });
  const parse = createParseService({
    fixtureMode: () => true,
    resolve,
    extract: () => {
      modelCalls++;
      throw Error("No model in corpus");
    },
  });
  const failed = [],
    times = [];
  for (let i = 0; i < corpus.length; i++) {
    const { text, expected: e } = corpus[i],
      start = performance.now();
    let p = await parse({ text }, "corpus-" + i);
    if (p.intent !== "address") p = await resolve(p);
    times.push(performance.now() - start);
    if (
      p.intent !== e.intent ||
      !subset(p.criteria, e.criteria) ||
      !subset(p.extras, e.extras) ||
      (e.locationContains &&
        !p.criteria?.location
          ?.toLowerCase()
          .includes(e.locationContains.toLowerCase())) ||
      (e.questionField &&
        !p.questions?.some((q) => q.field === e.questionField))
    )
      failed.push({
        text,
        expected: e,
        actual: {
          intent: p.intent,
          criteria: p.criteria,
          extras: p.extras,
          questions: p.questions,
        },
      });
  }
  times.sort((a, b) => a - b);
  const rulesTimes = [];
  for (const entry of corpus.filter(
    (c) => c.expected.intent === "description",
  )) {
    const start = performance.now();
    parseRules(entry.text);
    rulesTimes.push(performance.now() - start);
  }
  rulesTimes.sort((a, b) => a - b);
  return {
    total: corpus.length,
    passed: corpus.length - failed.length,
    passRate: Number(
      ((100 * (corpus.length - failed.length)) / corpus.length).toFixed(2),
    ),
    modelCalls,
    rulesP95Ms: rulesTimes[Math.floor(rulesTimes.length * 0.95)],
    p50Ms: times[Math.floor(times.length * 0.5)],
    p95Ms: times[Math.floor(times.length * 0.95)],
    maxMs: times.at(-1),
    failed,
  };
}
if (process.argv[1]?.replaceAll("\\", "/").endsWith("/measureParse.js")) {
  const result = await measureCorpus();
  console.log(
    JSON.stringify(
      process.argv.includes("--failures")
        ? result
        : { ...result, failed: result.failed.map((f) => f.text) },
      null,
      2,
    ),
  );
}
