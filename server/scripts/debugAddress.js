import { config } from "../config.js";
import { classifyIntent } from "../../src/lib/search/intent.js";
import { lookupAddress } from "../search/address.js";
const text = process.argv.slice(2).join(" ");
if (!text) {
  console.error('Usage: npm run debug:address -- "123 Main St, City, ST"');
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ step: "intent", ...classifyIntent(text), usingFixtures: config.useFixtures }));
  try {
    const result = await lookupAddress({ text, debug: true }, "debug-cli");
    for (const event of result.debug || []) console.log(JSON.stringify(event));
    console.log(JSON.stringify({ result: result.result, reasonCode: result.reasonCode, message: result.message }));
  } catch (e) {
    console.log(JSON.stringify({ result: "check_failed", status: e.status || 503, reasonCode: e.code || "LOOKUP_UNAVAILABLE" }));
    process.exitCode = 1;
  }
}
