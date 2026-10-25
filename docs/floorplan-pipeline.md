# Floor plans in PropertyLens

The CPU CubiCasa converter and notebook JSON importer are now implemented. See
[CubiCasa setup and verification](cubicasa.md) for the current conversion flow.
The original `auto` extension stub remains for compatibility; the registered
`cubicasa` converter enables when its local source and official weights exist.

The planner opens with its existing estimated house and searches in the background only for a real listing the user opens. No address sweep runs. Users calibrate a found image, or the CubiCasa converter calibrates it from consistent printed room dimensions. The synthetic sample and uploaded plans also work without Apify.

## Actor inspection

Inspected Actor `t26CMdjfnjh3OcJYT`, build `0.1.15` (`yFgz5T9NR9leJf1jw`). The authenticated Actor/build/source API was accessible. The source bundle exposed input/output/dataset schemas and implementation files, but no README file or README content was returned. The requested bounded sample run `QK6IMoF8u07vy4TgW` succeeded for 134 Athens St, San Francisco, CA 94112. Its dataset contained two rows; the matching result reported `found`. The committed fixture contains its JSON metadata with image keys replaced by `sample-floorplan.png`, original image URLs and hashes removed, and source marked Sample. No real plan image was downloaded or committed during inspection.

The actual accepted input includes `addresses`, `{url,address}` listing URLs, `enabledSources`, `maxFloorPlansPerAddress`, `minConfidence`, `includeLowConfidence`, `outputImageFormat`, `combineIntoPdf`, `includeListingFacts`, `runOcr`, `ocrMaxImages`, `useVisionCheck`, `proxyConfiguration`, `maxConcurrency`, `perAddressTimeoutSecs`, and `requestTimeoutSecs`. We send PNG, four plans maximum, confidence 0.5, OCR enabled for four images, no vision and no combined PDF. Known Zillow/Redfin snapshot links are passed directly; the adapter also accepts known realtor.com, compass.com and homes.com links. No new secret is used.

The actual dataset fields are `inputAddress`, `normalizedAddress`, `status`, `listingUrls`, `floorPlans`, `attempts`, `scrapedAt`, and `facts`. Each plan has `key`, `url`, `sourceUrl`, `source`, `contentType`, `sha256`, `confidence`, `signals`, and `ocrRoomWords`. `key` becomes `kvKey`, `sourceUrl` becomes the displayed source page, `source` becomes sourceName, and `facts` becomes listingFacts. The output does **not** supply per-plan KVS IDs, dimensions, page counts, floor labels or structured OCR boxes in the observed run. We use the run's own default KVS, decode dimensions locally, give floors editable defaults, and leave missing facts null. OCR room-word counts are not fabricated into room labels. The original `url` can be an SVG on another host; it is never fetched.

## Pipeline and limits

1. `useFloorPlans` starts/joins once per home per browser session and polls every 2.5 seconds. A retry can reconnect after server restart. Unmount stops polling; a deliberate cancel removes the waiter. The last waiter cancels the provider run.
2. `jobs.js` deduplicates normalized addresses, checks disk cache, reserves per-client/global/shared hourly budgets, starts the Actor asynchronously, polls with `waitForFinish=20`, reads its dataset and selects the matching address.
3. `actorAdapter.js` allowlists untrusted fields. Only safe keys from that run's own default key-value store can be downloaded through Apify's authenticated API. No Actor URL is used for fetching. Validated HTTPS source-page links are displayed with `noopener noreferrer`.
4. `assets.js` decodes and normalizes images to white, metadata-free PNG, auto-orients and limits the longest edge to 4096. Input is at most 10 MB and 40 million image pixels. PNG/JPEG/WebP magic and decode checks reject SVG and malformed inputs. PDFs use npm-only `pdfjs-dist` plus `@napi-rs/canvas` on Windows; only the first four pages render. A failed PDF offers screenshot upload.
5. The panel displays source credit, confidence and editable floor assignment. Calibration stores references in the layout; asset metadata remains in the asset index and job cache. Images use owner-authenticated blob URLs in the browser, revoked on cleanup.

Cache TTLs are 30 days for found plans, three days for no plan, one hour for blocked, and none for errors/caps/disabled results. Missing or evicted cached images invalidate a found result. Default budgets: 20 floor-plan runs/hour globally, five/client/hour, also counted against the existing `APIFY_MAX_RUNS_PER_HOUR`. Two runs maximum are active simultaneously; excess concurrency gets a friendly capped response. Start requests also use the existing per-run dollar cap. Provider timeout defaults to 150 seconds (clamped 30–300); timeout and last-waiter cancel abort the Actor. Hourly reservations count attempted starts even if a network failure occurs, avoiding free retries that evade caps.

Files live only under ignored `server/data/floorplans/files/<128-bit-random-id>.png`. `index.json` uses the shared atomic JSON writer. Normalization/storage is serialized to bound simultaneous decode work. Cleanup on ingestion/startup enforces 150 files/300 MB, LRU and 30-day asset expiry; expired assets are never served. At most ten uploaded pages belong to a client. Upload previews canceled before confirmation are deleted. Original upload bytes are not retained.

The FloorPlanAsset index shape is `{assetId, source:'apify'|'upload', ownerClientId, addressKey, floorLabel, sourceName, sourcePageUrl, widthPx, heightPx, bytes, createdAt, lastAccessAt, expiresAt, confidence, sample, detectedLabels}`. Owner ID, disk path, address key and expiry are omitted from public metadata. Uploads require the matching anonymous `X-Client-Id`; losing that browser identity loses access. Actor images are retrievable by unguessable ID. This is a browser-scoped anonymous planner, not account authentication or public sharing.

## HTTP contract

All paths are below `/api/planner/floorplan`. Client ID is required except public Actor image reads; upload reads still enforce their owner. Writes and reads are rate-limited, including image reads. JSON remains under the existing 200 KB cap; binary uploads allow 10 MB.

| Method/path | Result |
|---|---|
| POST `/jobs` | `{homeId,address,listingUrls}` → job ID, status, cached |
| GET `/jobs/:id` | status, short message, elapsed seconds, optional normalized result |
| DELETE `/jobs/:id` | cancel this waiter; abort if last |
| GET `/assets/:id.png` | normalized PNG, nosniff, private cache headers |
| GET `/metadata/:id` | authorized asset metadata |
| POST `/uploads` | raw image/PDF → first asset fields plus `plans` page array |
| DELETE `/uploads/:id` | delete own uploaded preview |
| POST `/sample` | synthetic Sample plan metadata |
| GET `/converters` | registered converter capabilities |
| POST `/:id/convert` | converter, calibration endpoints/length, rotation, ceiling, listingFacts |

Apify endpoints were checked against the official [start](https://docs.apify.com/api/v2/actors-runs-post), [poll](https://docs.apify.com/api/v2/actor-run-get), [abort](https://docs.apify.com/api/v2/actor-run-abort-post) and [KVS record](https://docs.apify.com/api/v2/key-value-store-record-get) documentation. Credentials remain exclusively in server Authorization headers; provider errors are not returned raw.

## Coordinates, calibration and persistence

Image coordinates are original normalized pixels. A measurement's distance is `hypot(p2.x-p1.x,p2.y-p1.y)` and `pixelsPerInch = distance / realLengthIn`. At least 3% of image width and a length of 1–200 ft are required. Supported inputs include `14`, `14.5`, `14'6"`, `4.3 m`, and `430 cm`. Bare numbers follow the selected feet/meters unit. Implied width outside 10–400 ft warns without preventing use. OCR labels are optional suggestions for what to measure, never automatic calibration.

Planner coordinates use inches with the top-left image origin, +x right, +z down. The renderer converts inches to feet once. Clockwise 90° maps `(x,y)` to `(height-y,x)` and swaps the footprint dimensions. Recalibration maps furniture back to original image pixels, then to the new rotated inch space. Furniture width/depth/height do not scale; its orientation rotates with the image. Transforming the coordinate system clears incompatible undo history; subsequent placement edits retain normal undo/redo. Rotating/recalibrating invalidates any prior converted model.

`layout.floorPlan` stores `{mode:'estimated'|'plan', ceilingHeightIn, ceilingSource:'default'|'listing'|'user', plans:[{assetId,levelIndex,rotationDeg,calibration:{p1,p2,realLengthIn,pixelsPerInch}|null,calibratedAt}], convertedHouseModel?, houseModelSource?}`. Old layouts remain valid. All fields are bounded/allowlisted, scale is recomputed rather than trusting the submitted ratio, and geometry is checked against asset dimensions before use. Levels 0–2 are upper floors and 3 is Basement. Only one calibrated plan is active per level. Ceiling height defaults to 96 inches, accepts 72–240, and uses available listing facts until explicitly overridden.

Unconverted plan mode creates one open room per plan with no walls/doors/windows. Furniture collisions and outside-footprint warnings remain active; invented wall collisions and flush snapping are disabled. Textures use sRGB, mipmaps, capped anisotropy and explicit disposal. A valid converted model uses actual room and opening collision geometry with a faint plan texture. Screenshots retain source/personal-use credit.

## Converter extension point

`server/floorplan/converters/index.js` documents and implements the registry. The contract is:

```js
convert({
  asset: { assetId, pngPath, widthPx, heightPx, floorLabel, detectedLabels },
  calibration: { pixelsPerInch, rotationDeg }, ceilingHeightIn, listingFacts
}) // -> { houseModel, confidence, warnings }
```

An image converter returns source `floorplan`, geometry in the rotated plan's inch space, and `estimated:false` only when confidence warrants it. `validateHouseModel` is shared by generation, converter results and layout loading. It rejects invalid bounds, references, nonfinite geometry and duplicate IDs, stripping unknown fields. The test fake converter returns a hand-written one-room model for the synthetic plan, round-trips it through layout storage and exercises planner selection, wall and door collisions.

`auto` still throws `NotImplementedError` → HTTP 501 for backward compatibility.
`cubicasa` runs the local CPU worker, detects wall centerlines and openings,
and uses explicit calibration or conservative OCR calibration. Its API result
also includes calibration metadata so the source image stays aligned. It supports
floor assignment and rotation. `estimated-layout` remains an estimated generator.
The panel enables **Convert to 3D** when CubiCasa source and weights are configured;
a failed automatic scale asks for two-point calibration. Imported notebook JSON
also works without an image asset. Converted floors can store explicit angled
wall segments, thickness and opening height/sill data, preserved by validation
and persistence. Rendering and collision use those segments instead of generating
walls from room rectangles. See `docs/cubicasa.md` for current limitations.

## Running and checking

```sh
npm install
npm run dev
npm test
npm run build
npm run check:secrets
node server/scripts/makeSampleFloorPlan.js
```

For the offline demo on PowerShell, set `$env:USE_FIXTURES='true'` and `$env:ENABLE_APIFY='false'` before `npm run dev`. Open `/planner/demo`, choose Floor plan → Use sample floor plan → Set the scale. A fixture real listing automatically receives the sample. Fixture addresses containing `no plan`, `blocked`, or `error` exercise alternate states. All sample assets are labeled Sample. PDF and asset tests use generated artwork and a tiny synthetic PDF.

Floor plans remain the property of their brokers/builders. They are displayed only for personal evaluation inside the planner, with source credit. No original-file export or public sharing feature is added. Found plans are not guaranteed, OCR may be absent, and the calibrated surface is not a detected wall model. Local asset eviction can require a new lookup/upload; calibration references are not backups of copyrighted images.
