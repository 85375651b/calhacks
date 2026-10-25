import test from "node:test";
import assert from "node:assert/strict";
import { adaptResult, actorInput, safeKey } from "../floorplan/actorAdapter.js";
import { createJobManager, TTL } from "../floorplan/jobs.js";
import { readFile } from "node:fs/promises";
const address = "134 Athens St, San Francisco, CA 94112",
  body = { homeId: "a", address, listingUrls: [] };
const memory = () => {
  const d = {};
  return { read: async () => structuredClone(d), mutate: async (f) => f(d) };
};
const row = {
  normalizedAddress: address,
  status: "found",
  floorPlans: [
    {
      key: "plan.png",
      contentType: "image/png",
      confidence: 1,
      source: "Zillow",
      sourceUrl: "https://zillow.com/",
    },
  ],
  facts: { beds: 3 },
};
test("adapter maps real keys, facts, missing fields and statuses; strips unsafe source links", () => {
  const r = adaptResult(row, "store", address);
  assert.equal(r.plans[0].kvKey, "plan.png");
  assert.equal(r.plans[0].width, null);
  assert.equal(r.listingFacts.beds, 3);
  assert.deepEqual(r.plans[0].detectedLabels, []);
  for (const status of [
    "found",
    "listing_found_no_floor_plan",
    "no_listing_found",
    "blocked",
    "invalid_address",
    "error",
  ])
    assert.equal(adaptResult({ status }, "store", address).status, status);
  assert.equal(adaptResult(null, "store", address).status, "error");
  assert.ok(!safeKey("../secret"));
  assert.ok(!safeKey("a/b"));
  assert.ok(safeKey("plan_01.png"));
  const input = actorInput(address, [
    "http://localhost",
    "https://example.com",
    "https://www.zillow.com/home",
  ]);
  assert.equal(input.listingUrls.length, 1);
  assert.equal(input.useVisionCheck, false);
  assert.equal(input.maxFloorPlansPerAddress, 4);
});
function setup(extra = {}) {
  let runs = 0,
    aborts = 0;
  const api = {
    start: async () => {
      runs++;
      return { id: "run", status: "RUNNING" };
    },
    poll: async () => ({
      id: "run",
      status: "SUCCEEDED",
      defaultDatasetId: "dataset",
      defaultKeyValueStoreId: "store",
    }),
    items: async () => [row],
    file: async (store, key) => {
      assert.equal(store, "store");
      return Buffer.from(key);
    },
    abort: async () => {
      aborts++;
    },
  };
  return {
    manager: createJobManager({
      api,
      cache: memory(),
      claimGlobal: async () => {},
      claimPerClient: async () => {},
      claimShared: async () => {},
      fixtureMode: () => false,
      enabled: () => true,
      storePlans: async (plans, download) => {
        for (const p of plans) await download(p);
        return plans.map(() => ({ assetId: "a" }));
      },
      ...extra,
    }),
    counts: () => ({ runs, aborts }),
    api,
  };
}
test("jobs dedupe concurrent starts, cache found results, isolate clients", async () => {
  const { manager: m, counts } = setup();
  const [a, b] = await Promise.all([m.start(body, "x"), m.start(body, "y")]);
  assert.equal(a.jobId, b.jobId);
  await m.settled(a.jobId);
  assert.equal(m.get(a.jobId, "x").status, "ready");
  assert.equal(counts().runs, 1);
  assert.equal((await m.start(body, "z")).cached, true);
  assert.throws(() => m.get(a.jobId, "stranger"));
});
test("caps and disabled/fixtures paths never start paid runs", async () => {
  for (const extra of [
    {
      claimGlobal: async () => {
        throw Error("cap");
      },
    },
    { enabled: () => false },
    { fixtureMode: () => true, sample: async () => [{ assetId: "sample" }] },
  ]) {
    const { manager: m, counts } = setup(extra);
    const j = await m.start(body, "a");
    await m.settled(j.jobId);
    assert.equal(counts().runs, 0);
    assert.ok(
      ["capped", "disabled", "ready"].includes(m.get(j.jobId, "a").status),
    );
  }
  assert.equal(TTL.ready, 30 * 86400000);
});
test("foreign store and unsafe keys are never downloaded", async () => {
  let downloaded = 0;
  const { manager: m } = setup({
    api: {
      start: async () => ({
        id: "r",
        status: "SUCCEEDED",
        defaultDatasetId: "d",
        defaultKeyValueStoreId: "ours",
      }),
      items: async () => [
        {
          ...row,
          floorPlans: [
            { key: "x.png", kvStoreId: "foreign" },
            { key: "../x", kvStoreId: "ours" },
          ],
        },
      ],
      file: async () => {
        downloaded++;
      },
    },
    storePlans: async (p, download) => {
      for (const v of p) await download(v);
      return [];
    },
  });
  const j = await m.start(body, "a");
  await m.settled(j.jobId);
  assert.equal(downloaded, 0);
  assert.equal(m.get(j.jobId, "a").status, "not_found");
});
test("only last waiter cancels and aborts the shared run", async () => {
  let release,
    aborts = 0;
  const { manager: m } = setup({
    api: {
      start: async () => ({ id: "r", status: "RUNNING" }),
      poll: () => new Promise((r) => (release = r)),
      abort: async () => aborts++,
    },
  });
  const a = await m.start(body, "x");
  const b = await m.start(body, "y");
  await new Promise((r) => setImmediate(r));
  await m.cancel(a.jobId, "x");
  assert.equal(aborts, 0);
  await m.cancel(b.jobId, "y");
  assert.equal(aborts, 1);
  release({ status: "ABORTED" });
  await m.settled(a.jobId);
});
test("saved real output and status fixtures normalize without trusting missing fields", async () => {
  const row = JSON.parse(
    await readFile(
      new URL("../fixtures/floorplan-actor-found.json", import.meta.url),
      "utf8",
    ),
  );
  const result = adaptResult(row, "own-store", address);
  assert.equal(result.status, "found");
  assert.equal(result.plans[0].kvKey, "sample-floorplan.png");
  assert.equal(result.plans[0].width, null);
  assert.equal(result.plans[0].kvStoreId, "own-store");
  const statuses = JSON.parse(
    await readFile(
      new URL("../fixtures/floorplan-statuses.json", import.meta.url),
      "utf8",
    ),
  );
  for (const r of Object.values(statuses))
    if (r?.status) assert.equal(adaptResult(r, "s", address).status, r.status);
});
test("cache expires at each TTL, missing assets rerun, and errors never cache", async () => {
  for (const [status, expected] of [
    ["found", "ready"],
    ["blocked", "blocked"],
    ["no_listing_found", "not_found"],
    ["error", "error"],
  ]) {
    let time = 1000,
      runs = 0;
    const { manager: m } = setup({
      now: () => time,
      api: {
        start: async () => {
          runs++;
          return {
            id: "r",
            status: "SUCCEEDED",
            defaultDatasetId: "d",
            defaultKeyValueStoreId: "store",
          };
        },
        items: async () => [{ ...row, status }],
        file: async () => Buffer.from("x"),
      },
    });
    let j = await m.start(body, "a");
    await m.settled(j.jobId);
    assert.equal(m.get(j.jobId, "a").status, expected);
    j = await m.start(body, "a");
    await m.settled(j.jobId);
    assert.equal(j.cached, status !== "error");
    if (status !== "error") {
      time += TTL[expected] + 1;
      j = await m.start(body, "a");
      await m.settled(j.jobId);
      assert.equal(j.cached, false);
    }
    assert.equal(runs, 2);
  }
  const { manager: m, counts } = setup({ resultAvailable: async () => false });
  let j = await m.start(body, "a");
  await m.settled(j.jobId);
  j = await m.start(body, "a");
  await m.settled(j.jobId);
  assert.equal(counts().runs, 2);
});
test("timeout aborts provider polling and per-client/shared caps prevent starts", async () => {
  let aborts = 0;
  const { manager: m } = setup({
    deadlineMs: () => 10,
    api: {
      start: async () => ({ id: "r", status: "RUNNING" }),
      poll: async (id, signal) =>
        new Promise((resolve, reject) =>
          signal.addEventListener("abort", () => reject(Error("aborted")), {
            once: true,
          }),
        ),
      abort: async () => {
        aborts++;
      },
    },
  });
  const j = await m.start(body, "a");
  await m.settled(j.jobId);
  assert.equal(aborts, 1);
  assert.equal(m.get(j.jobId, "a").status, "error");
  assert.match(m.get(j.jobId, "a").message, /timed out/);
  for (const key of ["claimPerClient", "claimShared"]) {
    const { manager, counts } = setup({
      [key]: async () => {
        throw Error();
      },
    });
    const j = await manager.start(body, "a");
    await manager.settled(j.jobId);
    assert.equal(manager.get(j.jobId, "a").status, "capped");
    assert.equal(counts().runs, 0);
  }
});
