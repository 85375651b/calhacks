import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  createConverterRegistry,
  NotImplementedError,
} from "../floorplan/converters/index.js";
import { createFloorPlanRouter } from "../floorplan/routes.js";
import { validateHouseModel } from "../../src/lib/planner/validateHouseModel.js";
import { resolvePlannerHouse } from "../../src/lib/planner/planHouse.js";
import { generateHouse } from "../../src/lib/planner/houseGenerator.js";
import { layout } from "../storage/planner.js";
import { wallSegments, warningsFor } from "../../src/lib/planner/collisions.js";
const assetId = "b".repeat(32),
  asset = {
    assetId,
    widthPx: 1200,
    heightPx: 900,
    pngPath: "synthetic-test-only.png",
    floorLabel: "Level 1",
    detectedLabels: [],
  };
const model = {
  source: "floorplan",
  estimated: false,
  ceilingHeightIn: 96,
  floors: [
    {
      level: 0,
      widthIn: 600,
      depthIn: 450,
      rooms: [
        {
          id: "living",
          name: "Living",
          type: "living",
          x: 0,
          z: 0,
          widthIn: 600,
          depthIn: 450,
        },
      ],
      doors: [
        {
          id: "front",
          roomIds: ["living"],
          exterior: true,
          x: 300,
          z: 450,
          widthIn: 36,
          axis: "x",
        },
      ],
      windows: [
        {
          id: "window",
          roomId: "living",
          x: 200,
          z: 0,
          widthIn: 48,
          axis: "x",
        },
      ],
    },
  ],
};
const calibration = {
  p1: { x: 0, y: 0 },
  p2: { x: 200, y: 0 },
  realLengthIn: 100,
  pixelsPerInch: 2,
};
test("fake converter model passes shared validation, persistence and planner selection with real collision geometry", async () => {
  const registry = createConverterRegistry({
    fake: {
      imageBased: true,
      convert: async () => ({
        houseModel: model,
        confidence: 0.8,
        warnings: ["Verify dimensions"],
      }),
    },
  });
  const result = await registry.convert("fake", {
    asset,
    calibration,
    ceilingHeightIn: 96,
  });
  const saved = layout(
    {
      placements: [],
      floorPlan: {
        mode: "plan",
        plans: [{ assetId, levelIndex: 0, calibration }],
        convertedHouseModel: { ...result.houseModel, untrusted: "strip" },
        houseModelSource: "fake",
      },
    },
    "test",
  );
  const selected = resolvePlannerHouse(generateHouse({}), saved.floorPlan, [
    asset,
  ]);
  assert.equal(selected.source, "floorplan");
  assert.equal(selected.estimated, false);
  assert.ok(wallSegments(selected.floors[0]).length > 0);
  assert.equal(selected.untrusted, undefined);
  assert.ok(
    warningsFor(
      [
        {
          id: "chair",
          name: "Chair",
          category: "chair",
          xIn: 300,
          zIn: 440,
          widthIn: 36,
          depthIn: 36,
        },
      ],
      selected.floors[0],
    ).some((w) => w.type === "door"),
  );
  await assert.rejects(() => registry.convert("auto", {}), NotImplementedError);
  const estimated = await registry.convert("estimated-layout", {
    listingFacts: { beds: 2 },
    ceilingHeightIn: 108,
  });
  assert.equal(estimated.houseModel.estimated, true);
  assert.equal(estimated.houseModel.ceilingHeightIn, 108);
  for (const bad of [
    { ...model, floors: [] },
    { ...model, ceilingHeightIn: Infinity },
    {
      ...model,
      floors: [
        {
          ...model.floors[0],
          rooms: [{ ...model.floors[0].rooms[0], widthIn: NaN }],
        },
      ],
    },
  ])
    assert.throws(() => validateHouseModel(bad));
});
test("convert endpoint returns 501 stub, validates calibration and protects upload ownership", async () => {
  const app = express();
  app.use(express.json({ limit: "200kb" }));
  app.use(
    "/api/planner/floorplan",
    createFloorPlanRouter({
      assets: {
        get: async (id, client) => {
          if (
            id !== assetId ||
            client !== "12345678-1234-4234-8234-123456789abc"
          )
            throw Error();
          return asset;
        },
      },
    }),
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  const base = `http://127.0.0.1:${server.address().port}/api/planner/floorplan/${assetId}/convert`;
  const send = (body, client = "12345678-1234-4234-8234-123456789abc") =>
    fetch(base, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Client-Id": client },
      body: JSON.stringify(body),
    });
  try {
    let r = await send({ calibration });
    assert.equal(r.status, 501);
    assert.equal((await r.json()).status, "not_implemented");
    r = await send({ calibration, converter: "estimated-layout" });
    assert.equal(r.status, 200);
    assert.equal((await r.json()).houseModel.source, "estimated");
    assert.equal(
      (await send({ calibration: { pixelsPerInch: 2 } })).status,
      400,
    );
    assert.equal(
      (await send({ calibration }, "22345678-1234-4234-8234-123456789abc"))
        .status,
      400,
    );
  } finally {
    server.closeAllConnections();
    await new Promise((r) => server.close(r));
  }
});
