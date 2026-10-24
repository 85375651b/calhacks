// Explicit one-off paid run; never retries or overwrites the saved response.
import { access, writeFile } from "node:fs/promises";
import { config } from "../config.js";
import { createApifyClient, APIFY_ACTOR_ID } from "../providers/apify.js";

const file = new URL("../fixtures/apify-sample.json", import.meta.url);
try {
  await access(file);
  console.error(
    "Apify fixture already exists; refusing to spend credits again.",
  );
  process.exit(1);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const address = process.argv[2] || "5500 Grand Lake Dr, San Antonio, TX 78244";
try {
  const data = await createApifyClient({ token: config.apifyToken })(address);
  const raw = JSON.stringify(data, null, 2);
  if (
    [config.apiKey, config.apifyToken].some(
      (secret) => secret && raw.includes(secret),
    )
  )
    throw new Error("Credential in response; refusing to save.");
  await writeFile(file, raw + "\n", { flag: "wx" });
  await writeFile(
    new URL("../fixtures/apify-metadata.json", import.meta.url),
    JSON.stringify(
      {
        address,
        actorId: APIFY_ACTOR_ID,
        capturedAt: new Date().toISOString(),
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(`Saved ${data.length} raw Apify dataset item(s).`);
  console.log("Returned fields:", Object.keys(data[0] || {}).join(", "));
} catch (error) {
  console.error(
    error.code === "APIFY_UNAVAILABLE"
      ? `${error.message} (HTTP ${error.status}). No raw error or token logged.`
      : "Could not save the Apify fixture. No raw error or token logged.",
  );
  process.exitCode = 1;
}
