import { claimRun } from "./providers/actor.js";
import { join } from "node:path";
import { config, serverDirectory } from "./config.js";
import { createCache } from "./cache.js";
import { createRentCastClient } from "./rentcast.js";
import { createLookup, loadFixtures } from "./lookup.js";
import { createApp } from "./app.js";
import { createAutocompleteProvider } from "./providers/autocomplete.js";
import { createAutocomplete } from "./autocomplete.js";
import { createApifyClient } from "./providers/apify.js";
import { createEnrichment, loadApifyFixtures } from "./enrich.js";

const fixtures = config.useFixtures ? await loadFixtures() : undefined;
const lookup = createLookup({
  request: createRentCastClient({ apiKey: config.apiKey }),
  cache: createCache(join(serverDirectory, ".cache", "lookups-sale-v1.json"), {ttl:3600000}),
  useFixtures: config.useFixtures,
  fixtures,
});
const apifyFixtures =
  config.useFixtures && config.enableApify
    ? await loadApifyFixtures()
    : undefined;
const enrich = createEnrichment({
  request: createApifyClient({ token: config.apifyToken, beforeRun: claimRun }),
  cache: createCache(join(serverDirectory, ".cache", "apify.json")),
  enabled: config.enableApify,
  token: config.apifyToken,
  useFixtures: config.useFixtures,
  fixtures: apifyFixtures,
});
const autocomplete = createAutocomplete({
  provider: config.useFixtures
    ? async (query) =>
        [
          {
            label: "5101 Trail West Dr, Austin, TX 78735",
            street: "5101 Trail West Dr",
            city: "Austin",
            state: "TX",
            zip: "78735",
            lat: 30.2513564,
            lng: -97.8332445,
          },
          {
            label: "1601 Faro Dr APT 1303, Austin, TX 78741",
            street: "1601 Faro Dr APT 1303",
            city: "Austin",
            state: "TX",
            zip: "78741",
            lat: 30.23,
            lng: -97.716,
          },
          {
            label: "Austin downtown workplace (sample)",
            street: "Congress Avenue",
            city: "Austin",
            state: "TX",
            zip: "78701",
            lat: 30.2672,
            lng: -97.7431,
          },
        ].filter((p) => p.label.toLowerCase().includes(query.toLowerCase()))
    : createAutocompleteProvider(),
});
if (!config.enableApify)
  console.log("Zillow enrichment disabled by ENABLE_APIFY=false.");
else if (
  !config.useFixtures &&
  (!config.apifyToken || config.apifyToken === "your_token_here")
)
  console.log(
    "Zillow enrichment unavailable: add APIFY_TOKEN to server/.env and restart to enable it.",
  );
const server = createApp(lookup, { autocomplete, enrich }).listen(
  config.port,
  "127.0.0.1",
  () => {
    console.log(
      `Property API: http://127.0.0.1:${config.port} (${config.useFixtures ? "saved fixtures; no quota used" : "live RentCast with 24h cache"})`,
    );
  },
);
server.on("error", (error) => {
  console.error(
    error.code === "EADDRINUSE"
      ? "API port is in use. Stop the other server or change PORT."
      : "Could not start the API server.",
  );
  process.exitCode = 1;
});
