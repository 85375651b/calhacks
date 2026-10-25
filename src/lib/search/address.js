const expansions = {
  st: "street",
  ave: "avenue",
  ln: "lane",
  rd: "road",
  dr: "drive",
  blvd: "boulevard",
  ct: "court",
  cir: "circle",
  pkwy: "parkway",
  hwy: "highway",
  trl: "trail",
  pl: "place",
  ter: "terrace",
  cv: "cove",
  n: "north",
  s: "south",
  e: "east",
  w: "west",
  ne: "northeast",
  nw: "northwest",
  se: "southeast",
  sw: "southwest",
};
export function splitAddress(value = "") {
  const clean = String(value).trim().replace(/\s+/g, " ");
  const match = clean.match(
    /(?:\b(?:apartment|apt|unit|suite|ste)\.?\s*|#\s*)([a-z0-9-]+)/i,
  );
  return {
    base: (match ? clean.replace(match[0], "") : clean)
      .replace(/\s+,/g, ",")
      .trim(),
    unit: match?.[1]?.toLowerCase() || "",
  };
}
export function normalizeAddress(value = "") {
  return String(value)
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/g, s => ({ first:"1st", second:"2nd", third:"3rd", fourth:"4th", fifth:"5th", sixth:"6th", seventh:"7th", eighth:"8th", ninth:"9th", tenth:"10th" })[s])
    .replace(/\b[a-z]+\b/g, (s) => expansions[s] || s)
    .replace(/\s+/g, " ")
    .trim();
}
export function addressParts(p) {
  if (typeof p === "string") p = { address: p };
  const { base, unit } = splitAddress(p.line1 || p.street || p.address || p.addressLine1 || p.formattedAddress || "");
  return {
    street: normalizeAddress(base.split(",")[0]),
    unit,
    zip: String(p.zip || p.zipCode || "").slice(0, 5),
  };
}
// The identity of a street/unit deliberately excludes locality and ZIP.
export function addressKey(address) {
  const { street, unit } = addressParts(address);
  return street + (unit ? "|unit:" + unit : "");
}
export function parseAddressText(text = "") {
  const match = text.trim().match(/^(.+?),\s*([^,]+),\s*([a-z]{2})(?:\s*,?\s*(\d{5})(?:-\d{4})?)?\s*$/i)
    || text.trim().match(/^(\d+[a-z]?(?:-\d+)?\s+(?:[a-z0-9.'-]+\s+)+?(?:st(?:reet)?|ave(?:nue)?|ln|lane|rd|road|dr|drive|blvd|boulevard|ct|court|cir(?:cle)?|pkwy|parkway|hwy|highway|trl|trail|way|pl|place|ter(?:race)?|cv|cove)\.?(?:\s+(?:n|s|e|w|ne|nw|se|sw))?\s*(?:(?:apt|unit|ste|#)\s*[a-z0-9-]+)?)[,\s]+(.+?)\s+([a-z]{2})(?:\s+(\d{5})(?:-\d{4})?)?$/i);
  const states = "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY PR GU VI AS MP".split(" ");
  return match && states.includes(match[3].toUpperCase()) ? { line1: match[1], street: match[1], city: match[2].trim(), state: match[3].toUpperCase(), zip: match[4] || "", label: text } : null;
}
// Parse what was supplied without inventing a state or ZIP. Missing components
// are resolved from matching listings or geocoders, never written into the input.
export function parseAddressQuery(text = "") {
  const full = parseAddressText(text);
  if (full) return full;
  const { base, unit } = splitAddress(text);
  if (!/^\d+[a-z]?(?:-\d+)?\s+\S/i.test(base)) return null;
  let line1 = base, city = "";
  if (base.includes(",")) {
    [line1, city] = base.split(",").map(s => s.trim());
  } else {
    const match = base.match(/^(\d+[a-z]?(?:-\d+)?\s+(?:[a-z0-9.'-]+\s+)+?(?:st(?:reet)?|ave(?:nue)?|ln|lane|rd|road|dr|drive|blvd|boulevard|ct|court|cir(?:cle)?|pkwy|parkway|hwy|highway|trl|trail|way|pl|place|ter(?:race)?|cv|cove)\.?(?:\s+(?:n|s|e|w|ne|nw|se|sw)\b)?)(?:\s+(.+))?$/i);
    if (match) { line1 = match[1]; city = match[2] || ""; }
  }
  line1 = line1.trim() + (unit ? " Apt " + unit : "");
  return { line1, street: line1, city, state: "", zip: "", label: text };
}
export function matchesAddressQuery(query, candidate) {
  const a = addressParts(query), b = addressParts(candidate);
  const house = a.street.match(/^\d+[a-z]?(?:-\d+)?\b/)?.[0];
  if (!house || house !== b.street.match(/^\d+[a-z]?(?:-\d+)?\b/)?.[0]) return false;
  // A street prefix may expand, but an explicitly supplied suffix must match.
  const completeStreet = /\b(?:street|avenue|lane|road|drive|boulevard|court|circle|parkway|highway|trail|way|place|terrace|cove)(?:\s+(?:north|south|east|west|northeast|northwest|southeast|southwest))?$/.test(a.street);
  if (completeStreet ? a.street !== b.street : !b.street.startsWith(a.street)) return false;
  if (a.unit && a.unit !== b.unit) return false;
  if (query.city && normalizeAddress(query.city) !== normalizeAddress(candidate.city)) return false;
  if (query.state && query.state.toUpperCase() !== String(candidate.state).toUpperCase()) return false;
  return true;
}
export function distanceMeters(a, b) {
  if (!validBias(a) || !validBias(b)) return Infinity;
  const radians = Math.PI / 180;
  const dLat = (b.lat - a.lat) * radians, dLng = (b.lng - a.lng) * radians;
  return 12742000 * Math.asin(Math.min(1, Math.sqrt(Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * radians) * Math.cos(b.lat * radians) * Math.sin(dLng / 2) ** 2)));
}
export function exactAddress(candidate, listing) {
  const a = addressParts(candidate),
    b = addressParts(listing);
  return Boolean(
    /^\d+[a-z]?(?:-\d+)?\b/i.test(a.street) &&
    addressKey({ line1: a.street }) === addressKey({ line1: b.street }) &&
    ((candidate.city && candidate.state && listing.city && listing.state &&
      normalizeAddress(candidate.city) === normalizeAddress(listing.city) &&
      String(candidate.state).toUpperCase() === String(listing.state).toUpperCase()) ||
      distanceMeters(candidate, listing) <= 100) &&
    (!a.unit || a.unit === b.unit),
  );
}
export const sameHome = (a, b) => Boolean(a && b && ((a.id && a.id === b.id) || (addressKey(a) === addressKey(b) && exactAddress(a, b))));
export const addressLabel = (p) =>
  [
    p.line1 || p.street,
    [p.city, p.state].filter(Boolean).join(", ") + (p.zip ? " " + p.zip : ""),
  ]
    .filter(Boolean)
    .join(", ");
export const validBias = (p) =>
  p &&
  Number.isFinite(p.lat) &&
  Number.isFinite(p.lng) &&
  Math.abs(p.lat) <= 90 &&
  Math.abs(p.lng) <= 180;
