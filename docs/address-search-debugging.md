# Address search debugging

## Baseline diagnosis (2026-10-24)

Pulled main before edits. Preserved existing `global.css` and `search.css` work.
The 11 original address/autocomplete tests passed with normal filesystem and localhost access.

Confirmed by code inspection and baseline fixtures:

- **a: ZIP equality** — `exactAddress` required both ZIPs and equality. Wrong or missing ZIP rejected the same house/street. Census used that same comparison, rejecting the very corrections it should accept.
- **b: request format** — only one RentCast request, using the provider label including its ZIP; no typed-text, no-ZIP or radius fallback. Parameters verified against [RentCast sale listings](https://developers.rentcast.io/reference/sale-listings) and [search queries](https://developers.rentcast.io/reference/search-queries).
- **c: status** — unknown statuses already fall back to for_sale in a sale-only query. Explicit pending/sold/rental signals remain excluded. No evidence this was the primary failure.
- **d: errors** — RentCast and Apify catches append `unavailable`, but final result still says not_for_sale. Daily-cap test explicitly enshrined this incorrect result.
- **e: caching** — these failures were cached for 60 seconds in address-sale-v1; conclusive negatives for one hour.
- **f: intent** — existing house/street/ZIP examples classify as address; need safety nets for less regular text. No evidence ZIP alone broke normal full-address classification.
- **g/i: UI** — address results already use their own ListingGrid outside criteria filters and open a dialog for a single result. Preserve and test this boundary.
- **h/input** — `onMouseMove` changes activeIndex, so Enter can select without arrow navigation. `choose` writes the clicked label and then overwrites it after asynchronous verification. Home's addressSearch also calls setText with the standardized response, even on a manually typed submission. Focus reopens dismissed lists. These are independent causes of unwanted input changes.
- **ZIP display** — provider ZIP goes straight into labels. Census requires a ZIP before verifying and verifies equality with that ZIP, so bad postcodes cannot be corrected.

`npm run debug:address -- "123 Main St, City, ST"` runs the actual pipeline with safe structured events. `debug: true` on POST /api/search/address provides the same request-local events only outside production. No headers, tokens or raw error messages are traced.

## Live evidence and probe

A public Census call succeeded with HTTP 200; its real response is saved in `server/fixtures/census-live-match.json`. Further live round trips and ZIP measurements are recorded below as they are run. Fixture results must not be presented as live evidence.

### Measured ZIP accuracy

The expanded probe ran 30 queries across Washington DC, New York, Austin, Los Angeles, Seattle and San Francisco. Photon produced 22 suggestions; Census verified 20. Of 20 comparable provider/Census ZIP pairs, **3 differed (15%)**. The two unverified suggestions and queries with no usable suggestions are excluded from the denominator. Geoapify had no configured key, so this measures Photon only, not Geoapify or nationwide accuracy. Photon returned intermittent 503s/timeouts, particularly late in the run. The complete sanitized report is saved in `server/fixtures/zip-probe-report.json`.

| Address | Provider ZIP | Census ZIP |
| --- | --- | --- |
| 11 Wall Street, New York, NY | 10271 | 10005 |
| 1000 5th Avenue, New York, NY | 10075 | 10028 |
| 2400 Trinity Street, Austin, TX | 78705 | 78712 |

These are direct reproductions of the wrong-ZIP bug. The old equality check would reject all three corrections. The new verifier requests street/city/state without provider ZIP, checks house/street identity, and reads `addressComponents.zip` from the matching Census response.

### Live listing checks

Before the address pipeline fix, a debug run for `5101 Trail West Dr, Austin, TX` recorded Photon 200, successful Census verification, RentCast 200 with zero rows, then one successful Zillow/Apify match. This confirms an empty primary source does not establish that a home is off market. Provider formatting variants were absent in the original pipeline; the observed empty RentCast response does not prove the ZIP caused that particular miss.

After the fix, a live Austin criteria search (`limit=5`, no source errors, `usingFixtures=false`) returned five homes. The first three were round-tripped in street-only, city/state without ZIP, full address, lowercase, and expanded-suffix forms: **15/15 succeeded**. Addresses were `2702 S 2nd St #1 & 2`, `7705 Mowinkle Cv`, and `16305 Almaden Dr`. Recent listing caches supplied conclusive positives without further paid calls. Two addresses contain no Ln/Dr suffix, so their expanded variant is identical; the third exercised Dr/Drive. Ln/Lane is covered independently by offline tests. The saved report is `server/fixtures/address-roundtrip-report.json`.

Browser verification against the updated live API submitted `16305 almaden dr, Austin, TX 99999` with Escape followed by Enter. The home appeared, its dialog opened with focus on Close, and the dialog reported: “You entered ZIP 99999. This home's ZIP is 78717.” The input remained exactly typed. Closing the dialog, tabbing away and reloading preserved that text with `aria-expanded=false`. DOM checks confirmed `autocomplete=off`, a non-address field name, and password-manager opt-outs. No native saved-address UI appeared in the in-app browser. A Chrome profile containing saved addresses was not available for verification; browser-specific heuristics remain a limitation. Initial browser reproduction was incomplete, so baseline input causes are established by the original write/event paths and regression tests, not a claimed before/after browser recording.

### Final behavior and limits

- Canonical identity (`addressKey`) excludes ZIP and normalizes suffixes, directionals, ordinals, punctuation and unit designators. Different house numbers never match. City/state or a 100-meter coordinate check protects against another town's same street.
- Full typed addresses take priority over stale selected objects. Fresh recent sale caches are checked first; then bounded RentCast variants (typed, Census, provider without ZIP, standardized without ZIP, coordinates/radius) and at most one capped Apify fallback. Every variant reserves a daily RentCast slot. In-flight lookups coalesce.
- `check_failed` has a reasonCode and no listings; no failed result is cached. Address-sale-v2 discards old address negatives. Conclusive negatives last one hour. Check again bypasses and refreshes the same cache entry, at most twice/client/minute.
- Existing sale-query fallback for unknown statuses was correct and remains covered. Explicit pending/coming-soon/sold/rental/contradictory signals stay hidden. Saved Redfin records also contain historical sold dates; the existing conservative sold-date policy remains, so an active label with that contradictory field can still be hidden. No new live unmapped status was observed; synthetic unknown-status tests verify the fallback without inventing a new real mapping.
- No evidence of leftover criteria filtering exact-address results: the dedicated grid stays independent. Both intent safety-net directions are tested and bounded to one retry. The browser confirmed single-result popup rendering.
- Census is an interpolated geocoder, not apartment/parcel or sale-status evidence. Unverified ZIPs remain hidden. JSON cache/quota guards target one server process. Optional photo enrichment still has its existing separate actor cap.

A temporary 360-by-800 browser viewport override also showed no horizontal overflow (the embedded browser reported a narrower 324-pixel content viewport). The address field and popup remained within the available width; the override was reset after testing.

Offline tests cover every visible search-fixture listing in full/lowercase/no-ZIP/wrong-ZIP/expanded-suffix forms through HTTP, 65 canonical-address combinations, unit scopes, API errors, caps, retries, trace gating, typed-input events and fixed-order ZIP verification. Fixtures labeled synthetic are minimal edge cases; the Census/Photon samples and probe reports are live observations. Run the commands in README to repeat these checks.
