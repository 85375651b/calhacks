import {
  normalizeAddress,
  addressLabel,
  addressParts,
  parseAddressQuery,
  matchesAddressQuery,
} from "../../src/lib/search/address.js";
import zillow from "../fixtures/search-zillow.json" with { type: "json" };
import redfin from "../fixtures/search-redfin.json" with { type: "json" };
import { normalize } from "./listing.js";
import { visibleListings } from "./status.js";
const row = (line1, city, state, zip, lat, lng, status = "Active") => ({
  line1,
  street: line1,
  city,
  state,
  zip,
  lat,
  lng,
  status,
  label: addressLabel({ line1, city, state, zip }),
  verified: false,
  provider: "sample",
});
export const addressFixtures = [
  row("5101 Trail West Dr", "Austin", "TX", "78735", 30.2513564, -97.8332445),
  row("1601 Faro Dr APT 1303", "Austin", "TX", "78741", 30.23, -97.716),
  row("100 Pending St", "Austin", "TX", "78701", 30.27, -97.74, "Pending"),
  row("200 Sold St", "Austin", "TX", "78701", 30.27, -97.74, "Sold"),
  row("147 Midway Ln", "Los Angeles", "CA", "90001", 33.97, -118.25),
  row("147 Midway Ln", "Springfield", "IL", "62704", 39.77, -89.68),
];
// Every home displayed in offline criteria search must also resolve offline by address.
for (const p of visibleListings([
  ...zillow.map(p => normalize(p, "Zillow", true)),
  ...redfin.map(p => normalize(p, "Redfin", true)),
])) {
  if (!addressFixtures.some(a => addressParts(a).street === addressParts(p).street && addressParts(a).unit === addressParts(p).unit && a.city === p.city && a.state === p.state))
    addressFixtures.push(row(p.address, p.city, p.state, p.zip, p.lat, p.lng, "Active"));
}
export function fixtureCandidates(text) {
  const q = normalizeAddress(text);
  const typed = parseAddressQuery(text);
  return addressFixtures
    .filter((p) => typed ? matchesAddressQuery(typed, p) : normalizeAddress(p.label).includes(q))
    .map(({ status, ...p }) => ({ ...p }));
}
