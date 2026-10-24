# Actor review — Phase 4

Read the public default-build README and input schema on October 24, 2026. Settings are in `server/config/apify.js`; adapters intentionally expose only documented fields.

## benthepythondev/zillow-scraper

Input fields: `locations`, `listingType`, `maxResults`, `minPrice`, `maxPrice`, `minBeds`, `minBaths`, `homeTypes`, `daysOnZillow`, `includeDetails`.

[README and schema](https://api.apify.com/v2/acts/benthepythondev~zillow-scraper/builds/default)

## brilliant_gum/redfin-scraper

Input fields: `locations`, `searchMode`, `maxListings`, `minPrice`, `maxPrice`, `minBeds`, `minBaths`, `propertyTypes`, `minSqFt`, `maxSqFt`, `minYearBuilt`, `maxDaysOnMarket`, `maxHOA`, `isNewConstruction`, `sortOrder`, `soldWithin`.

[README and schema](https://api.apify.com/v2/acts/brilliant_gum~redfin-scraper/builds/default)

## crawlerbros/google-maps-directions

Public build was not accessible (403).

[README and schema](https://api.apify.com/v2/acts/crawlerbros~google-maps-directions/builds/default)

## fatihtahta/zillow-property-scraper

Input fields: `location`, `deal_type`, `sort_by`, `min_price`, `max_price`, `min_monthly_payment`, `max_monthly_payment`, `bedroom_count`, `bathroom_count`, `property_type`, `max_hoa`, `listing_type`, `listing_status`, `tours`, `min_parking`, `closed_garage`, `min_floor_area`, `max_floor_area`, `min_land_area`, `max_land_area`, `min_building_year`, `max_building_year`, `basement`, `single_story`, `55_plus_communities`, `amenities`, `view`, `commute_time`, `price_reduced`, `publication_date`, `keyword`, `url`, `maximize_coverage`, `enrich_data`, `mcpConnectors`, `limit`.

[README and schema](https://api.apify.com/v2/acts/fatihtahta~zillow-property-scraper/builds/default)

## gio21/redfin-scraper

Input fields: `searchUrls`, `listingType`, `minPrice`, `maxPrice`, `minBeds`, `minBaths`, `minSqft`, `maxItems`, `proxyConfiguration`, `debug`.

[README and schema](https://api.apify.com/v2/acts/gio21~redfin-scraper/builds/default)

## hichemdev/redfin-scraper

Input fields: `regionId`, `regionType`, `listingType`, `minPrice`, `maxPrice`, `minBeds`, `minBaths`, `searchUrls`, `maxProperties`, `proxyConfiguration`.

[README and schema](https://api.apify.com/v2/acts/hichemdev~redfin-scraper/builds/default)

## johnvc/google-maps-directions-api

Input fields: `start_addr`, `end_addr`, `start_coords`, `end_coords`, `start_data_id`, `end_data_id`, `travel_mode`, `distance_unit`, `avoid_tolls`, `avoid_highways`, `avoid_ferries`, `transit_prefer`, `transit_routing`, `time_type`, `time_value`, `hl`, `gl`.

[README and schema](https://api.apify.com/v2/acts/johnvc~google-maps-directions-api/builds/default)

## lexis-solutions/crimegrade-scraper

Input fields: `zipCodes`, `cityUrls`, `proxyConfiguration`.

[README and schema](https://api.apify.com/v2/acts/lexis-solutions~crimegrade-scraper/builds/default)

## lukass/zillow-scraper

Input fields: `search`, `startUrls`, `zpids`, `type`, `priceMin`, `priceMax`, `bedsMin`, `bedsMax`, `bathsMin`, `homeTypes`, `sqftMin`, `sqftMax`, `lotSizeMin`, `lotSizeMax`, `yearBuiltMin`, `yearBuiltMax`, `daysOnZillowMax`, `keywords`, `showOnly`, `amenities`, `parkingSpotsMin`, `basementStatuses`, `viewTypes`, `hoaMaxPerMonth`, `includeHomesWithNoHoaData`, `includePending`, `includeForeclosed`, `includePreforeclosure`, `pets`, `rentalAmenities`, `availableFrom`, `excludeSeniorCommunity`, `sortOrder`, `sortAscending`, `maxItems`, `maxSplitLevel`, `proxy`, `debugLog`.

[README and schema](https://api.apify.com/v2/acts/lukass~zillow-scraper/builds/default)

## malonestar/fema-nri-county-risk-profile

Input fields: `assets`, `resolution`, `states`, `counties`, `maxResults`.

[README and schema](https://api.apify.com/v2/acts/malonestar~fema-nri-county-risk-profile/builds/default)

## mangudai/redfin-real-estate-scraper

Input fields: `startUrls`, `maxItemsPerRegion`, `maxItems`, `propertyTypes`, `minPrice`, `maxPrice`, `minBeds`, `maxBeds`, `minBaths`, `minSqft`, `maxSqft`, `minYearBuilt`, `maxDaysOnMarket`, `keyword`, `includeDescription`, `proxyConfiguration`.

[README and schema](https://api.apify.com/v2/acts/mangudai~redfin-real-estate-scraper/builds/default)

## rastriq/google-maps-directions-traffic

Input fields: `routes`, `travelModes`, `timeMode`, `travelDate`, `travelTime`, `routesBulk`, `origins`, `destinations`, `directionsUrls`, `trafficProfileStartDate`, `trafficProfileEndDate`, `trafficProfileWeekdays`, `trafficProfileStartTime`, `trafficProfileEndTime`, `trafficProfileInterval`, `avoidTolls`, `avoidHighways`, `avoidFerries`, `transitTypes`, `transitRoutePreference`, `maxRoutes`, `outputFormat`, `includeSteps`, `stepsForAllRoutes`, `includePolyline`, `includeDetailedPolyline`, `includeSpeedProfile`, `includeStreetView`, `language`, `countryCode`, `fixAmbiguousPlaces`, `maxResults`, `maxConcurrency`, `proxyConfiguration`, `dateTime`, `trafficProfileDates`, `trafficProfileIntervalMinutes`, `debug`.

[README and schema](https://api.apify.com/v2/acts/rastriq~google-maps-directions-traffic/builds/default)

## rl1987/redfin-api-scraper

Input fields: `location`, `status`, `soldWithinDays`, `minPrice`, `maxPrice`, `minBeds`, `minBaths`, `includeDetails`, `maxItems`, `propertyTypes`, `proxyConfiguration`.

[README and schema](https://api.apify.com/v2/acts/rl1987~redfin-api-scraper/builds/default)

## scrapesage/zillow-scraper

Input fields: `locations`, `zipCodes`, `searchUrls`, `propertyUrls`, `startUrls`, `listingType`, `forSaleByOwnerOnly`, `minPrice`, `maxPrice`, `minBeds`, `maxBeds`, `minBaths`, `minSqft`, `maxSqft`, `minYearBuilt`, `maxYearBuilt`, `homeTypes`, `daysOnZillow`, `sort`, `includePropertyDetails`, `extractAgentLeads`, `maxPhotosPerListing`, `maxResults`, `maxResultsPerSearch`, `maxRunSeconds`, `detailConcurrency`, `deduplicateResults`, `monitorMode`, `monitorStoreName`, `proxyConfiguration`, `urlsFromFile`.

[README and schema](https://api.apify.com/v2/acts/scrapesage~zillow-scraper/builds/default)

## silentflow/zillow-scraper

Input fields: `location`, `locations`, `startUrls`, `locationType`, `operation`, `maxItems`, `minPrice`, `maxPrice`, `minBeds`, `maxBeds`, `minBaths`, `homeTypes`, `sortBy`, `fetchDetails`, `debugMode`.

[README and schema](https://api.apify.com/v2/acts/silentflow~zillow-scraper/builds/default)

## solidcode/redfin-scraper

Input fields: `searchUrls`, `regionId`, `areaType`, `listingStatus`, `propertyTypes`, `maxItems`, `enrichDetails`, `concurrency`, `proxyConfiguration`.

[README and schema](https://api.apify.com/v2/acts/solidcode~redfin-scraper/builds/default)

## steadyscrape/zillow-scraper

Input fields: `locations`, `listingType`, `searchUrls`, `propertyUrls`, `includeDetails`, `maxItemsPerSearch`, `fullCoverage`.

[README and schema](https://api.apify.com/v2/acts/steadyscrape~zillow-scraper/builds/default)

## TopApi/zillow-scraper

Input fields: `searchLocation`, `listingStatus`, `searchUrls`, `startUrls`, `zipCodes`, `zpids`, `addresses`, `mapBounds`, `latitude`, `longitude`, `distanceMiles`, `searchResultsDatasetId`, `sortBy`, `homeTypes`, `minPrice`, `maxPrice`, `minBeds`, `maxBeds`, `minBaths`, `minSqft`, `maxSqft`, `minLotSize`, `maxLotSize`, `minYearBuilt`, `maxYearBuilt`, `maxHoaFee`, `daysOnZillow`, `keywords`, `listingTypes`, `mustHave`, `views`, `parkingSpots`, `customFilterState`, `minDaysOnZillow`, `withZestimateOnly`, `withPhotosOnly`, `includeDetails`, `includeZestimateHistory`, `monitorMode`, `trackPriceChanges`, `monitorStoreName`, `maxResults`, `maxResultsPerSearch`, `extractionMethod`, `compact`, `flatOutput`, `proxyConfiguration`, `maxConcurrency`.

[README and schema](https://api.apify.com/v2/acts/TopApi~zillow-scraper/builds/default)

## Small live comparison

All search runs used Austin, TX and a five-row cap without optional full detail. Initial requests rejected before launch by the account concurrency limit were retried serially; the application now limits actor concurrency to three.

| Actor                        | Result | Elapsed | Decision                                                                     |
| ---------------------------- | ------ | ------- | ---------------------------------------------------------------------------- |
| TopApi/zillow-scraper        | 5 rows | 5.4 s   | Chosen: broad filters, fractional baths, search URLs and details for schools |
| lukass/zillow-scraper        | 5 rows | 11.2 s  | Worked; fewer status options, integer bath schema, slower                    |
| brilliant_gum/redfin-scraper | 5 rows | 9.6 s   | Chosen: broad size, HOA and construction filters; accepts URLs               |
| rl1987/redfin-api-scraper    | 5 rows | 7.0 s   | Worked; narrower filters, no documented URL input                            |

Search field coverage is documented in the README. Redfin chosen actor only resolves a documented subset of city names directly; other areas should use a Redfin URL. No actor is silently run for an unchecked source.

## Insight verification

- CrimeGrade ZIP 78704 timed out at 85 seconds. Live unavailable state is deliberate; demo crime values are explicitly illustrative, not measurements of either home. The actor documents national/state **cost** comparisons, not national/state crime-rate comparisons. Those are not conflated.
- FEMA actor succeeded at census-tract resolution. The direct public point-query fallback also returned both demo homes’ tracts.
- TopApi detail mode returned three public schools and extra photo URLs for each of the two overlapping properties.
- johnvc returned different 8 AM / 3 AM durations, but its output arrival times showed that timezone-offset ISO input was interpreted incorrectly. Rastriq was tested separately with origin-local time. It returned 35 vs 20 minutes, with matching local arrival times, and was selected. Crawlerbros public build returned 403; it was not run.
- Overpass main and Kumi mirror timed out/unreachable in this environment. Live requests show unavailable; grocery fixtures explicitly name illustrative example stores.

[RentCast sale-listing parameters](https://developers.rentcast.io/reference/sale-listings) · [FEMA tract service](https://services.arcgis.com/XG15cJAlne2vxtgt/arcgis/rest/services/National_Risk_Index_Census_Tracts/FeatureServer/0)
