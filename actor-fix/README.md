# Home Floor Plan Finder: public-site fallback

## Install in the original Actor

1. Open version **0.2** of the existing Actor in Apify Console.
2. Copy all of **[main-paste.ts](main-paste.ts)** into the Actor's **src/main.ts**, replacing its entire contents. The new helper is included in this single-file version.
3. Retain the existing address.ts, extract.ts, http.ts, images.ts, ocr-vision.ts, types.ts, package manifest and Dockerfile. No new runtime packages are required. The old discovery.ts is no longer called.
4. Add [input-schema-additions.json](input-schema-additions.json) to the existing input schema's **properties** object. This is a fragment, not a replacement schema. Code defaults apply if those fields are absent. Keep maxRunSecs and debugMode in that schema too.
5. Set the version's **Build tag to beta before building**. Apify defaults to latest; beta keeps the working production tag on 0.1.16.
6. Build, then run that build explicitly with [self-test-input.json](self-test-input.json) and a **150-second platform timeout**. Verify results before changing latest.

For a modular source project, copy both src/main.ts and src/public-sources.ts instead of main-paste.ts. Regenerate the single-file version after source edits with `node actor-fix/package-source.mjs` from the workspace root.

This is not a standalone Actor project. Supporting Actor files were not provided. AddressResult.status must include timeout, blocked, invalid_address, found, listing_found_no_floor_plan, no_listing_found and error, as the original paste already assumed. Full type compatibility still needs checking in the original Actor build.

## Source selection and fallback

- Supplied listing URLs run first. A block, error, timeout, wrong address or missing plan leads to the next candidate. After supplied URLs are exhausted, one batched Google-search Actor run discovers alternatives. Without supplied URLs, discovery runs immediately. The Actor starts that search asynchronously, polls for the first available result batch, then stops the remaining child work instead of waiting for all search queries to finish.
- Search covers the full address and street/city/state variants, including iGUIDE, Aryeo, HDPhotoHub, HomeVisit and TourFactory. Preferred platform results precede custom domains, then the major portals.
- Keep **webSearch** enabled in enabledSources: the new platforms and custom domains use this existing enum value. The actual host is recorded in each plan's signals.providerHost.
- HTTP 401/403/429 and recognized challenge pages, including HTTP-200 CAPTCHA pages, trigger immediate host switching. Known blocks are not retried with a browser. Remaining URLs on that blocked hostname are skipped for this address.
- Defaults: maximum eight URLs per address, 12 seconds per URL for HTTP/browser retrieval, 20 seconds for discovery. The search setting is capped at 30 seconds, and the actual local search budget cannot exceed 30% of the remaining address/run time. Overall deadlines still apply, so slow sites may exhaust the budget before all eight are tried. Search startup, empty-result polling and failures are logged before their work starts; a search timeout is not reported as proof that no listing exists.
- Ordinary HTTP failures or pages without extractable candidates may receive a browser fallback within the same site budget.
- Public floor-plan links and image attributes supplement the existing extractor. Linked tours are followed only from address-verified pages; destinations must independently pass address verification. For verified iGUIDE views with no surfaced download link, two documented public view-alias PDF paths are also tried. No account-only downloads are accessed.

## Address matching

Use a complete address, preferably comma-separated, e.g. **134 Athens St, San Francisco, CA 94112**. Common comma-free formats and an H1 street followed by an adjacent locality are also supported. Listing objects need an address field too. Bare URLs and street-only inputs return invalid_address rather than matching an ambiguous property.

The primary page must identify the requested street, unit, city and state in its title, H1, address element or property JSON-LD. Street/state abbreviations are normalized; supplied ZIPs must not conflict. Search titles, URL slugs, body mentions, agent office records and related structured listings alone are insufficient. Conflicting primary identities are rejected.

Recommendation, related-property, navigation and script-state sections are removed before generic media extraction. Before discarding script state, the code separately recovers floor-plan assets from JSON records with an explicitly matching property address, skipping related listings and broker records. Footer office addresses are excluded from primary identity checks. Candidates attributed by the existing extractor to another source page are rejected. Accepted plans record signals.addressVerified, matchedAddress, addressEvidence and providerHost. The first page yielding accepted plans supplies up to the configured maximum; those plans are saved before other sites are probed.

## Diagnosed 134 Athens St run

The supplied run of build 0.1.22 spent 119,207ms in discovery (119,160ms in search), 577ms in fetching and zero milliseconds in browser work before its 120-second work deadline. Its effective search timeout was 300 seconds, while the local source had a lower clamp. Those timings establish a discovery bottleneck, not the absence of a floor plan. Discovery/process phases are nested, so their times must not be added together.

The revised code emits **implementationVersion: public-fallback-0.2.3-streaming-search** in every normal address result and OUTPUT. Verify this marker after deploying to distinguish the replacement from earlier or edited builds. It also filters obvious neighboring-house URLs such as 138 Athens St before fetching them.

Use [134-athens-direct-input.json](134-athens-direct-input.json) with a 150-second platform timeout to try the two address-specific property pages from that run first, without waiting for discovery. These are supplied listing leads, not verified floor-plan sources. Live access to those pages was unavailable from this workspace, and no real plan has been confirmed for this address.

This verifies the publisher's association between a property and a plan, not the home's present physical condition. Historical/proposed drawings may be out of date, and conservative matching may miss pages with unsupported markup or address formats.

## Diagnostics and verification

Every unique input gets one dataset row unless storage fails. The work deadline reserves ten seconds before Apify's platform timeout for output/shutdown. OUTPUT includes successful row counts, phase timings and effective configuration. Storage failures fail the run. Attempts record blocks, skipped hosts, source timeouts, address mismatches and candidate errors.

The self-test should yield one row, populated OUTPUT.phaseMs and addressesWritten: 1. A blocked/timeout/no-plan row verifies diagnostics only. Actual retrieval requires found plus accessible KV files and matching-address evidence. Compare API and Console using the same build ID, input, memory and platform timeout.

Local verification, from the workspace root:

```sh
node actor-fix/package-source.mjs
node --test actor-fix/main.test.mjs actor-fix/public-sources.test.mjs server/tests/floorplan-jobs.test.js
```

Tests transpile and execute the actual entry point and real discovery/address helper with simulated Apify, HTTP, browser and image services. They cover blocked Realtor to verified iGUIDE PDF fallback, independent site timeouts, HTTP-200 challenges, repeated blocked hosts, wrong-address rejection, linked tours, no-plan/search errors, storage failures and late results. They do not constitute a live Apify/site test or a full typecheck against the missing Actor files.

Timeouts cooperatively stop entry-point work and tear down browser fallback. Helpers without AbortSignal support may finish an already-started request in the background; late results cannot start subsequent entry-point work or emit another row. An already-submitted storage write cannot be unsent. Search child runs have a bounded remote timeout.

No cloud source, build, version or tag was changed. Residential proxies and source fallback do not guarantee a plan exists or is accessible. The app adapter separately requests residential proxies explicitly, sets a work budget below its platform timeout and recognizes timeout rows.

References: [iGUIDE public media](https://docs.youriguide.com/docs/tutorials/download-deliverables/), [Actor lifecycle](https://github.com/apify/apify-sdk-js/blob/master/src/actor.ts), [Apify build tags](https://docs.apify.com/actors/development/builds-and-runs/builds#tags).
