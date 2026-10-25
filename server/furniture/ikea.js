import { join } from "node:path";
import { config, serverDirectory } from "../config.js";
import { runActor, createRunGuard } from "../providers/actor.js";
import { persistentMemo } from "../storage/memo.js";
import { fetchPage, safeUrl } from "./resolveUrl.js";
import { extractIkeaDimensions } from "./ikeaDimensions.js";
import { resolveName } from "../../src/lib/planner/catalog.js";
import { readFile } from "node:fs/promises";

export const IKEA_ACTOR_ID = "1s1g2xDQFnPD0zt6C";
const cache = persistentMemo(join(serverDirectory,".cache","ikea-furniture.json"),{cacheErrors:false});
const budget = createRunGuard(join(serverDirectory,".cache","ikea-budget.json"),{
  max:()=>Math.max(1,Math.min(50,Number(process.env.IKEA_MAX_RUNS_PER_HOUR)||10)),
});
export function ikeaProductUrl(value) {
  const url = safeUrl(value);
  if (url.hostname !== "www.ikea.com" && url.hostname !== "ikea.com") throw Error("Invalid IKEA product URL.");
  if (!/^\/[a-z]{2}\/[a-z]{2}\/p\//i.test(url.pathname)) throw Error("Invalid IKEA product URL.");
  url.search = "";
  return url.href;
}
function imageUrl(value) {
  try {
    const u = safeUrl(value);
    return ["ikea.com","www.ikea.com"].includes(u.hostname) &&
      (u.pathname.startsWith('/ext/ingkadam/') || /\/images\//.test(u.pathname)) ? u.href : null;
  } catch { return null; }
}
const sample = {
  name:"Sample IKEA-style sofa",price:"$499 (sample)",url:"https://www.ikea.com/us/en/p/sample-sofa-00000000/",
  imageUrl:null,matchScore:.8,widthIn:78.75,depthIn:35.375,heightIn:32.625,
};
export function normalizeIkea(row, dimensions, query, {fixture=false} = {}) {
  if (!row || typeof row.name !== "string" || !row.name.trim()) throw Error("IKEA did not return a product.");
  const sourceUrl = ikeaProductUrl(row.url);
  const base = resolveName(`${query} ${row.name}`);
  const sizes = {};
  for (const axis of ["widthIn","depthIn","heightIn"]) {
    const n = dimensions?.[axis] ?? row[axis];
    sizes[axis] = typeof n === "number" && Number.isFinite(n) && n >= (axis === 'heightIn' ? .1 : 1) && n <= (axis === 'heightIn' ? 240 : 600) ? n : null;
  }
  const complete = Object.values(sizes).every(v=>v!=null);
  return { name:row.name.slice(0,160),category:base.category,color:base.color,...sizes,
    source:"ikea",sourceUrl,imageUrl:imageUrl(row.imageUrl),
    productId:sourceUrl.match(/(\d{8})\/?$/)?.[1] || null,
    price: typeof row.price === "string" ? row.price.slice(0,100) : null,
    dimensionSource: complete ? "product" : "missing",estimated:!complete,
    modelStatus:"placeholder",fixture,
    notes: fixture ? "Sample search result. No live IKEA search was made." : complete ? "Product measurements found. Confirm the match and dimensions before placing." : "Some measurements were unavailable. Enter the missing product dimensions to continue.",
  };
}
export function createIkeaResolver({ run=runActor, page=fetchPage, memo=cache, claim=budget }={}) {
  return async ({query,country="us",language="en"},fixture=config.useFixtures) => {
    if (typeof query !== "string" || !query.trim() || query.trim().length>500 || !/^[a-z]{2}$/.test(country) || !/^[a-z]{2}$/.test(language))
      throw Object.assign(Error("Enter a furniture description up to 500 characters."),{code:"invalid_ikea"});
    const description = query.trim();
    if (fixture) {
      let recorded;
      try { recorded = JSON.parse(await readFile(new URL('../fixtures/ikea-product.json',import.meta.url),'utf8')); } catch {}
      return normalizeIkea(recorded || sample,recorded ? {} : sample,description,{fixture:true});
    }
    if (!config.enableApify || !config.apifyToken) throw Object.assign(Error("IKEA search is unavailable. You can enter dimensions manually."),{code:"ikea_unavailable"});
    try {
      return await memo({query:description.toLowerCase(),country,language,version:1},async()=>{
        await claim();
        const rows = await run(process.env.IKEA_ACTOR_ID || IKEA_ACTOR_ID,{description,country,language},{limit:1,timeout:90000});
        const row=rows?.[0];
        if (!row) throw Error("No match");
        const url = ikeaProductUrl(row.url);
        let dimensions = {};
        // Enrich the existing Actor result without requiring an Actor deployment.
        try { dimensions = extractIkeaDimensions((await page(url)).html); } catch {}
        return normalizeIkea(row,dimensions,description);
      },7*86400000);
    } catch {
      throw Object.assign(Error("IKEA search could not finish. Try again, paste a product link, or enter dimensions manually."),{code:"ikea_unavailable"});
    }
  };
}
export const resolveIkea = createIkeaResolver();
