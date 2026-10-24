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
  cache: createCache(join(serverDirectory, ".cache", "lookups.json")),
  useFixtures: config.useFixtures,
  fixtures,
});
const apifyFixtures =
  config.useFixtures && config.enableApify
    ? await loadApifyFixtures()
    : undefined;
const enrich = createEnrichment({
  request: createApifyClient({ token: config.apifyToken }),
  cache: createCache(join(serverDirectory, ".cache", "apify.json")),
  enabled: config.enableApify,
  token: config.apifyToken,
  useFixtures: config.useFixtures,
  fixtures: apifyFixtures,
});
const autocomplete = createAutocomplete({
  provider: createAutocompleteProvider(),
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
