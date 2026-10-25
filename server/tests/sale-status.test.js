import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeListingStatus,
  saleStatus,
  visibleListings,
} from "../search/status.js";
import { createSearch } from "../search/index.js";
import { createApp } from "../app.js";
test("observed source statuses and contradictory sale signals are normalized conservatively", () => {
  for (const [source, raw, status] of [
    ["Zillow", "forSale", "for_sale"],
    ["Zillow", "other", "unknown"],
    ["Redfin", "Active", "for_sale"],
    ["Redfin", "Coming Soon", "coming_soon"],
    ["RentCast", "Active", "for_sale"],
    ["RentCast", "Inactive", "off_market"],
    ["Zillow", "PENDING", "pending"],
    ["Redfin", "Active Under Contract", "pending"],
    ["Redfin", "Contingent", "pending"],
    ["Zillow", "SOLD", "sold"],
    ["Zillow", "FOR_RENT", "for_rent"],
    ["Redfin", "Withdrawn", "off_market"],
  ])
    assert.equal(normalizeListingStatus(raw, source), status);
  assert.equal(saleStatus("unknown", "Zillow", {}, true), "for_sale");
  assert.equal(saleStatus("unknown", "Zillow", {}, false), "unknown");
  for (const signals of [
    { soldDate: "2026-01-01" },
    { isPending: true },
    { rentalPrice: 2000 },
    { mlsStatus: "Off Market" },
  ])
    assert.notEqual(saleStatus("Active", "Zillow", signals, true), "for_sale");
  assert.equal(
    visibleListings([{ status: "sold" }, { status: "for_sale" }, {}]).length,
    1,
  );
});
test("mixed fixture search and legacy lookup/enrichment endpoints never expose unavailable home facts", async (t) => {
  const search = createSearch({
    fixtureMode: true,
    cache: async (k, fn) => fn(),
  });
  const result = await search({ location: "Austin, TX", limit: 50 });
  assert.ok(result.hiddenCount >= 3);
  assert.ok(
    result.listings.every((p) => p.status === "for_sale" && p.checkedAt),
  );
  const app = createApp(
    async () => ({
      address: "Private off-market address",
      bedrooms: 8,
      estimate: { price: 999 },
    }),
    {
      enrich: async () => ({
        listingStatus: "SOLD",
        photos: ["private-photo"],
      }),
    },
  );
  const server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  for (const path of ["lookup", "enrich"]) {
    const response = await fetch(
      `http://127.0.0.1:${server.address().port}/api/${path}?address=123`,
    );
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.bedrooms, undefined);
    assert.equal(body.photos, undefined);
    assert.equal(body.estimate, undefined);
  }
});
