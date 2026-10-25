# IKEA search and furniture placement

In the planner's Furniture panel choose **IKEA**, describe the furniture, and
select **Find IKEA furniture**. Confirm the product using its image, product
page and available price. Enter any missing width, depth and height, then choose
**Save and place in house**. The sized primitive can be moved, rotated, resized
and saved using the existing planner controls. **Save to library** adds it
without placing it.

## Current integration

`POST /api/furniture/resolve` accepts:

```json
{"provider":"ikea","query":"small grey two-seat sofa","country":"us","language":"en"}
```

The backend maps `query` to the actor's `description` and uses Actor
`1s1g2xDQFnPD0zt6C`. Country/language default to `us`/`en`. The existing
server-only `APIFY_TOKEN`, `ENABLE_APIFY` and `USE_FIXTURES` controls apply.
`IKEA_ACTOR_ID` can override the ID; `IKEA_MAX_RUNS_PER_HOUR` defaults to ten and
is clamped to 1–50. It also counts against the existing shared Apify budget and
per-run charge cap. Repeated identical queries are coalesced and successful
results cached for seven days. Failed searches are not cached. No polling or
searching happens while typing; only form submission starts a lookup.

The actor currently deployed returns product metadata without dimensions. The
backend therefore reads the returned IKEA product page using the existing
bounded, DNS-validated fetcher and extracts explicitly labeled dimensions.
Only IKEA product URLs and IKEA image URLs are accepted by this adapter.
An unreadable product page retains the matched product and image, with missing
measurements left null. No catalog or AI guesses fill those fields.

The extractor reads the primary Product's structured data or English product
measurement labels, converts metric units and fractional inches, and skips
packaging and seat-specific dimensions. Unclear or non-English labels can
require manual entry. Validate extracted measurements on the product page.
The actor's keyword-based `matchScore` is not shown as a confidence percentage.

## Persistence and later 3D generation

Furniture records retain `source: "ikea"`, `productId`, `sourceUrl`, `imageUrl`,
available `price`, dimensions in inches, and `dimensionSource: "product" |
"manual"`. `modelStatus: "placeholder"` explicitly identifies the current
representation. The existing placement stores `furnitureId`, level, position,
rotation and physical dimensions separately. A future generated model can be
attached to the same definition while keeping placement and scaling it to the
confirmed dimensions. This change does not send images to a generation service.

## Samples and checks

`USE_FIXTURES=true` never invokes the actor. It returns metadata from a previously
completed result stored in `server/fixtures/ikea-product.json`, marked **Sample
search result**. This sample always returns the same product, regardless of
query. No price or measurements were returned in that recorded result, so the
confirmation form shows **Price unavailable** and requires manual dimensions.
The remote product thumbnail can still load in the browser.

Run `node --test server/tests/*.test.js` and `node node_modules/vite/bin/vite.js
build`. Tests cover actor input mapping, caching, URL validation, missing
measurements, unit conversion, package/seat exclusion, metadata persistence and
the shared actor extractor. Browser testing covers required fields, product
image, save-and-place, moving, rotating and reload with sample data.

## Prepared actor revision

`actors/ikea-furniture-finder/` contains a local revision that fetches the selected
product page and returns `widthIn`, `depthIn`, `heightIn`, `dimensionUnit` and
`dimensionSource`. The extraction module is identical to the backend's tested
module. It includes output/KVS schemas, README and an abort handler. The
Dockerfile and dependencies have not been changed or installed.

`node server/scripts/prepare-ikea-actor.js` validates the output item schema and
prepares `server/data/ikea-actor-update.json` from the saved original source,
preserving untouched source files and settings. It does not deploy. The actor's
AGENTS.md requires confirmation before deployment. A live test was also blocked
by automatic approval review because paid execution had not been explicitly
approved. This revision has syntax and extractor tests, but its platform build
and a new live run remain to be verified after approval.
