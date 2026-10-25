# Zillow and Redfin Listing Images

A complete, independent Apify Actor that extracts a property's listing photos and optionally saves image files. The existing floor-plan Actor is separate and unchanged.

This project uses JavaScript, not TypeScript. Upload the entire project to a **new Actor**; its main.js depends on the other included source files. Do not replace the old floor-plan Actor's source with this project.

## Deploy

The source ZIP contains package.json, Dockerfile, .actor metadata/input schema, all src files, tests, and example inputs. It excludes installed dependencies, research HTML, downloaded photos, local storage, and credentials.

**Apify CLI:** extract the ZIP into a dedicated directory, open a terminal in that directory, and run:

```sh
apify login
apify push
```

The CLI uses the name **listing-image-scraper** from .actor/actor.json and creates that Actor if it does not exist. Change that name first if you already use it for another Actor. This project's build tag is **beta**.

**Console:** create a new Actor using the JavaScript + Playwright/Chrome template. Replace that new Actor's source with the contents of this project, including .actor, src, scripts, package.json, and Dockerfile. Preserve the directory structure. This is a whole project, not a single main.js paste. Build and run the new Actor explicitly.

Use [INPUT.example.json](INPUT.example.json) to download up to 50 photos. Set the platform run timeout to **210 seconds** or more for its 180-second work budget. Memory: **1024 MB** minimum, **2048 MB** recommended when using a browser.

For a faster metadata-only check, use [INPUT.urls-only.json](INPUT.urls-only.json). It requests up to 200 URLs without downloading images and disables address search. It uses direct access, which succeeded in the local Zillow test but may be blocked from a different network. Select your own proxy settings as needed.

## Inputs

- **listingUrls**: Zillow /homedetails/.../<zpid>_zpid/ or Redfin /.../home/<propertyId> HTTPS URLs. Supply strings or objects containing url and optional address. Queries/hashes are removed. Other sites and search-result URLs are rejected.
- **addresses**: optional full US addresses. Address-only targets require allowAddressSearch and a token/account permitted to run apify/google-search-scraper. That separately billed Actor is started only when usable supplied URLs have been exhausted.
- **enabledSources**: zillow and/or redfin.
- **downloadImages**: true by default. False returns image URLs and metadata without fetching the files.
- **maxImagesPerListing**: default 50, maximum 200. Set 200 for a gallery larger than 50 photos.
- **proxyConfiguration**: residential Apify Proxy by default. Account access and charges vary. Set useApifyProxy to false for direct access, or supply custom proxies. Explicit settings are respected.
- **maxConcurrency**: default 1, maximum 2 properties.
- **minDomainDelaySecs**: minimum gap between listing navigations to the same hostname, default 3 seconds. Browser scripts and other subresources are separate requests. Browser image/font/video requests are suppressed; selected photos are downloaded separately.
- **requestTimeoutSecs**: default 15 per HTTP operation.
- **perListingTimeoutSecs**: default 90 for the complete property workflow.
- **searchTimeoutSecs**: default 15, hard cap 30, further limited to a quarter of the remaining property/run budget. The search Actor's first available result batch is used without waiting for the entire run to finish, and remaining child work is stopped.
- **maxRunSecs**: default 180. Set the platform timeout at least 15 seconds higher. The Actor reserves ten seconds before the platform deadline for output/shutdown.
- **maxImageMbytes**: default 10, maximum 25 per file.

Supplied URLs with the same address form one property job. Zillow can fall back to the supplied Redfin URL, or vice versa. Bare URLs without addresses are separate jobs: the Actor can verify their property IDs, but it cannot automatically establish a cross-provider address match without address evidence. At most 25 property jobs are accepted; OUTPUT reports truncated inputs.

## Extraction and access behavior

1. Fetch the property page with bounded HTTP and no automatic retry.
2. Check its property ID and, if supplied, its address. Read the property's structured gallery data: Zillow Next.js/gdpClientCache/responsivePhotos, Redfin property photo payloads, or property JSON-LD.
3. Pick the largest available variant of each photo, deduplicate size variants, and exclude nearby/recommended properties, agent media, maps, and unknown image hosts.
4. If needed, render once with Playwright, inspect primary gallery containers and property JSON responses, and try a visible gallery button. The Actor does not crawl recommendation pages or repeatedly retry a challenge.
5. Return metadata and optionally download the selected photos into the default key-value store.

HTTP 401/403/429 or recognized challenge pages produce a blocked result. Further requests to that host are skipped for the remainder of the run, including after Retry-After responses, rather than immediately retried. Another supplied provider can then be tried. An in-run page cache avoids refetching a successfully extracted property. There is no persistent cross-run cache.

The Actor does not guarantee access to either provider. A page may expose only its cover image; such a result is labelled listing-cover-only. It never claims the full gallery was recovered unless a declared photo count is present and the returned count meets it without truncation. Unsupported new markup may require an extractor update.

## Results

The default dataset contains one row per unique target, including blocked/error/timeout rows. Each successful row includes:

- address, listingUrl, provider, propertyId, addressVerified;
- availableImageCount, imageCount, savedImageCount, declaredImageCount, truncated, galleryComplete;
- images: URL, available dimensions/caption, extraction provenance and download status;
- for saved images: kvKey, SHA-256, content type and byte count;
- attempts, elapsedMs, implementationVersion and kvStoreId.

Photo files are in **Storage → Key-value store**. Match each dataset image's kvKey to its stored file. Dataset exports contain metadata, not image bytes. Photo URLs remain in output if a file download fails. JPEG, PNG, WebP and AVIF responses are checked by content type and file signature before saving.

Statuses: found, partial, blocked, timeout, not_found, unverified, address_mismatch, invalid_input, error. Found means image URLs were recovered; savedImageCount indicates how many files were saved. Unverified means the page did not provide enough address evidence. Partial means some requested downloads failed or time ran out after URLs had already been recovered.

OUTPUT in the key-value store summarizes counts, elapsed time, truncation and implementationVersion. Dataset storage errors fail the run instead of being counted as a successful write. Already-submitted file writes cannot be canceled; an exceptional timeout can leave an unreferenced file, but late results cannot emit another dataset row.

## Verification performed

- 13 automated tests cover primary Zillow/Redfin data shapes, nested encoded caches, photo size selection, unrelated-property exclusion, address/unit mismatches, canonical ID changes, input limits, provider fallback, image download failures, deadlines, queued jobs, late responses and per-host pacing.
- Build checks pass against installed Apify 3.7.2, Crawlee 3.18.2, and Playwright 1.61.1. Browser crawler options were accepted by the real SDK.
- The input schema passed Apify's official input meta-schema validation.
- Live Zillow HTTP retrieval for **134 Athens St, San Francisco, CA 94112** recovered **115 property-gallery photo URLs**, matching the listing's declared count and address.
- A local end-to-end run of this exact Actor, using the real Apify SDK and local storage, saved **three actual JPEGs** and one dataset row. The three-photo cap was intentional for the test. See [verification.json](verification.json) and [examples/output.json](examples/output.json).
- Redfin direct HTTP returned status 202 and insufficient property data. Redfin gallery parsing has automated coverage, but a successful live Redfin browser extraction has not been verified.
- A cloud Actor/Docker build and residential-proxy run have not been performed. No cloud Actor was created or updated by these local checks.

For local development, install Node.js 22+ (24 matches the Docker image), then:

```sh
npm install
npm run build
npm test
```

Use apify run to supply INPUT and manage local storage. Live browser execution needs the Playwright browser matching the installed package; the provided Docker image already has Playwright 1.61.1 browsers. Direct HTTP mode does not require a local browser.

References: [Apify deployment](https://docs.apify.com/actors/development/deployment), [official Playwright Actor Docker template](https://github.com/apify/actor-templates/blob/master/templates/js-crawlee-playwright-chrome/Dockerfile), [input schema](https://docs.apify.com/actors/development/actor-definition/input-schema/specification/v1).
