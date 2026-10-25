import {
  normalizeAddress,
  addressLabel,
} from "../../src/lib/search/address.js";
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
export function fixtureCandidates(text) {
  const q = normalizeAddress(text);
  return addressFixtures
    .filter((p) => normalizeAddress(p.label).includes(q))
    .map(({ status, ...p }) => ({ ...p }));
}
