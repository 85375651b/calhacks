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
