import test from "node:test";
import assert from "node:assert/strict";
import {
  overlaps,
  doorBox,
  fitMessage,
} from "../../src/lib/planner/collisions.js";
import {
  catalog,
  resolveName,
  parseDimensions,
  toInches,
} from "../../src/lib/planner/catalog.js";
import { pushHistory, undo, redo } from "../../src/lib/planner/history.js";
test("SAT detects rotated intersections, touching edges and separated rectangles", () => {
  const a = { xIn: 0, zIn: 0, widthIn: 60, depthIn: 20 };
  assert.ok(overlaps(a, { ...a, xIn: 20, rotationDeg: 45 }));
  assert.ok(!overlaps(a, { ...a, xIn: 60 }));
  assert.ok(!overlaps(a, { ...a, zIn: 100, rotationDeg: 45 }));
  assert.ok(overlaps(a, doorBox({ x: 0, z: 0, widthIn: 32, axis: "x" })));
  assert.match(fitMessage(a, { widthIn: 50, depthIn: 50 }), /larger/);
});
test("catalog and explicit units resolve common furniture", () => {
  assert.equal(catalog.length, 30);
  assert.equal(resolveName("queen bed").widthIn, 64);
  assert.equal(resolveName("grey 3 seater sofa").widthIn, 84);
  assert.equal(resolveName("desk 60x30").depthIn, 30);
  assert.equal(toInches(25.4, "mm"), 1);
  assert.deepEqual(parseDimensions("Dimensions 152.4 x 76.2 x 76.2 cm"), {
    widthIn: 60,
    depthIn: 30,
    heightIn: 30,
  });
});
test("history retains fifty steps and redo is cleared by new edit", () => {
  let h = { past: [], present: 0, future: [] };
  for (let i = 1; i <= 60; i++) h = pushHistory(h, i);
  assert.equal(h.past.length, 50);
  assert.equal(undo(h).present, 59);
  assert.equal(redo(undo(h)).present, 60);
  assert.equal(pushHistory(undo(h), 99).future.length, 0);
});
