import { search } from "../search/index.js";
import { lookupAddress } from "../search/address.js";
import { addressLabel, addressParts } from "../../src/lib/search/address.js";
const location = process.argv.slice(2).join(" ") || "Austin, TX";
const result = await search({ location, limit: 5 });
console.log(JSON.stringify({ step: "criteria-search", location, count: result.listings.length, usingFixtures: result.usingFixtures, sourceErrors: Object.keys(result.sourceErrors || {}) }));
let passed = 0, total = 0;
for (const p of result.listings.slice(0, 3)) {
  const full = addressLabel({ ...p, line1: p.address.split(",")[0] + (addressParts(p).unit && !p.address.split(",")[0].includes(addressParts(p).unit) ? " Apt " + addressParts(p).unit : "") });
  const street = full.split(",")[0];
  const variants = [street, full.replace(/\s+\d{5}$/, ""), full, full.toLowerCase(), full.replace(/\b(Ln|Lane)\b/gi, s => s.toLowerCase() === "ln" ? "Lane" : "Ln").replace(/\bDr\b/g, "Drive")];
  for (const text of variants) {
    total++;
    const v = await lookupAddress({ text, debug: true }, "roundtrip-cli");
    if (v.result === "for_sale") passed++;
    console.log(JSON.stringify({ step: "roundtrip", displayed: full, text, result: v.result, reasonCode: v.reasonCode, caches: v.debug?.filter(e => e.step === "cache" || e.step === "recent-cache"), sourceErrors: v.unavailable }));
  }
}
console.log(JSON.stringify({ summary: { passed, total } }));
