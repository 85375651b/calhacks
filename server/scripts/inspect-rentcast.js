// Explicit, one-time quota use: one request per endpoint, no automatic retries.
import { mkdir, writeFile, access } from "node:fs/promises";
import { config } from "../config.js";

const address = process.argv[2] || "5500 Grand Lake Dr, San Antonio, TX, 78244";
const directory = new URL("../fixtures/", import.meta.url);
if (!config.apiKey)
  throw new Error("RENTCAST_API_KEY is required for inspection.");
await mkdir(directory, { recursive: true });
const endpoints = [
  ["properties", "/properties", {}],
  ["listings", "/listings/sale", { status: "Active" }],
  ["avm", "/avm/value", {}],
];
const results = [];
for (const [name, path, extra] of endpoints) {
  const file = new URL(`${name}.json`, directory);
  let exists = false;
  try {
    await access(file);
    exists = true;
  } catch {}
  if (exists)
    throw new Error(
      `Fixture ${name}.json already exists; refusing to spend quota or overwrite it.`,
    );
  const url = new URL(`https://api.rentcast.io/v1${path}`);
  url.search = new URLSearchParams({ address, ...extra }).toString();
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey, Accept: "application/json" },
    signal: AbortSignal.timeout(25000),
  });
  const body = await response.text();
  if (body.includes(config.apiKey))
    throw new Error("Response contained a credential; refusing to save.");
  if (!response.ok && response.status !== 404) {
    throw new Error(
      `RentCast ${name} returned HTTP ${response.status}; no response body logged.`,
    );
  }
  JSON.parse(body);
  await writeFile(file, body + "\n", { flag: "wx" });
  results.push({ name, status: response.status });
  console.log(`${name}: HTTP ${response.status}, saved raw JSON`);
}
await writeFile(
  new URL("metadata.json", directory),
  JSON.stringify(
    { address, capturedAt: new Date().toISOString(), endpoints: results },
    null,
    2,
  ) + "\n",
  { flag: "wx" },
);
