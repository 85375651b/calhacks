import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { wallObstacles, furnitureObstacles, move, overlapsAny } from "./collide.js";
import { computeFootprint, pickStart } from "./footprint.js";
import { importFloorPlan } from "../planner/importFloorPlan.js";

const R = 0.8;
// One 20 ft wall along x at z = 0 with a door (x 4..7) and a window (x 12..16).
const floor = importFloorPlan({ units: "feet", walls: [{ id: 0, x1: 0, y1: 0, x2: 20, y2: 0, thickness: 0.4 }],
  openings: [{ wall: 0, type: "door", position: 5.5, width: 3 }, { wall: 0, type: "window", position: 14, width: 4 }] }).floors[0];
const walls = wallObstacles(floor);
const walk = (x, z, dx, dz, boxes = walls, steps = 300) => {
  for (let i = 0; i < steps; i++) [x, z] = move(x, z, dx / steps, dz / steps, R, boxes);
  return [x, z];
};

test("solid wall stops the player at radius distance", () => {
  const [, z] = walk(1.5, 3, 0, -6);
  assert.ok(z >= 0.2 + R - 1e-6 && z < 0.2 + R + 0.05, `z=${z}`);
});
test("window is solid", () => {
  const [, z] = walk(14, 3, 0, -6);
  assert.ok(z > 0.9, `z=${z}`);
});
test("door gap is passable", () => {
  const [, z] = walk(5.5, 3, 0, -6);
  assert.ok(z < -2.5, `z=${z}`);
});
test("slides along a wall when walking diagonally into it", () => {
  const [x, z] = walk(1, 3, 2, -6);
  assert.ok(x > 2.5, `x=${x}`); // kept the x component instead of stopping dead
  assert.ok(z > 0.9, `z=${z}`);
});
test("one big step can't tunnel through a thin wall", () => {
  const [, z] = move(1.5, 1.2, 0, -3, R, walls);
  assert.ok(z > 0, `z=${z}`);
});
test("furniture footprint blocks, honouring rotation", () => {
  const table = furnitureObstacles([{ size_ft: [4, 2.5, 1], position: [10, 0, 10], rotation_deg: 90 }]);
  // Rotated 90 deg the 4 ft side runs along z, so approaching along -x stops at 10 + 0.5 + R.
  const [x] = walk(14, 10, -6, 0, table);
  assert.ok(Math.abs(x - (10.5 + R)) < 0.05, `x=${x}`);
  const [, z] = walk(10, 14, 0, -6, table);
  assert.ok(Math.abs(z - (12 + R)) < 0.05, `z=${z}`);
});

test("plan1: start point is clear and random walks never end inside a wall", () => {
  const url = new URL("../../../floorplan/cubicasa5k/plan1_clean.json", import.meta.url);
  if (!fs.existsSync(url)) return;
  const plan = importFloorPlan(JSON.parse(fs.readFileSync(url))).floors[0];
  const boxes = wallObstacles(plan);
  const fp = computeFootprint(plan);
  assert.equal(fp.leaked, false);
  let [x, z] = pickStart(fp, boxes, R);
  assert.ok(!overlapsAny(x, z, R, boxes));
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let leg = 0; leg < 200; leg++) {
    const a = rand() * Math.PI * 2;
    for (let i = 0; i < 60; i++) [x, z] = move(x, z, Math.cos(a) * 0.067, Math.sin(a) * 0.067, R, boxes);
    assert.ok(!overlapsAny(x, z, R - 0.02, boxes), `stuck in wall at ${x},${z}`);
  }
});
