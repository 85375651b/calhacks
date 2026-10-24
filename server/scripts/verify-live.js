// Opt-in live verification. Uses the same persistent cache as the development server.
// A cold run normally spends two RentCast requests. Repeats use the 24-hour cache.
import assert from "node:assert/strict";
import { join } from "node:path";
import { config, serverDirectory } from "../config.js";
import { createCache } from "../cache.js";
import { createRentCastClient } from "../rentcast.js";
import { createLookup } from "../lookup.js";
import { createApp } from "../app.js";

const address = process.argv[2] || "5500 Grand Lake Dr, San Antonio, TX, 78244";
let upstreamCalls = 0;
const client = createRentCastClient({
  apiKey: config.apiKey,
  fetchImpl: (...args) => {
    upstreamCalls++;
    return fetch(...args);
  },
});
const lookup = createLookup({
  request: client,
  cache: createCache(join(serverDirectory, ".cache", "lookups.json")),
});
const server = createApp(lookup).listen(0, "127.0.0.1");
await new Promise((resolve) => server.once("listening", resolve));
try {
  const base = `http://127.0.0.1:${server.address().port}/api/lookup?`;
  const first = await fetch(base + new URLSearchParams({ address }));
  assert.equal(first.status, 200, "Live lookup should succeed");
  const data = await first.json();
  assert.equal(data.sampleData, false);
  assert.ok(data.address && data.sources.length);
  const initialCalls = upstreamCalls;
  const repeat = await fetch(
    base + new URLSearchParams({ address: `  ${address.toUpperCase()}  ` }),
  );
  assert.equal(repeat.status, 200);
  assert.deepEqual(await repeat.json(), data);
  assert.equal(
    upstreamCalls,
    initialCalls,
    "Repeat search must not use provider quota",
  );
  console.log(
    JSON.stringify(
      {
        address: data.address,
        sampleData: data.sampleData,
        price: data.listing?.listPrice ?? data.estimate?.price,
        bedrooms: data.bedrooms,
        squareFootage: data.squareFootage,
        sources: data.sources,
        firstLookupUpstreamCalls: initialCalls,
        repeatLookupUpstreamCalls: upstreamCalls - initialCalls,
      },
      null,
      2,
    ),
  );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
