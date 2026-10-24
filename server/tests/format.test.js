import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCurrency,
  formatNumber,
  formatArea,
  formatDate,
} from "../../src/lib/format.js";

test("formatters handle unavailable values and do not stringify null or NaN", () => {
  for (const value of [null, undefined, NaN, Infinity, ""]) {
    assert.equal(formatCurrency(value), "N/A");
    assert.equal(formatNumber(value), "N/A");
    assert.equal(formatArea(value), "N/A");
    assert.equal(formatDate(value), "N/A");
  }
  assert.equal(formatNumber(0), "0");
  assert.equal(formatNumber(1.5), "1.5");
  assert.equal(formatCurrency(450000), "$450,000");
  assert.equal(formatArea(1850), "1,850 sq ft");
  assert.equal(formatDate("2024-11-18T00:00:00.000Z"), "Nov 18, 2024");
});
