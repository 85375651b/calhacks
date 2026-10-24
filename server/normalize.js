export const numberOrNull = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
const textOrNull = value => typeof value === 'string' && value.trim() ? value.trim() : null;
const dateOrNull = value => textOrNull(value) && Number.isFinite(Date.parse(value)) ? value : null;
const firstRecord = value => Array.isArray(value) ? value[0] : null;

export function normalizeProperty({ address, avm, listings, properties, sources, sampleData = false }) {
  const listing = Array.isArray(listings) ? listings.find(item => item.status === 'Active') : null;
  const subject = avm?.subjectProperty || {};
  const record = firstRecord(properties) || {};
  const candidates = [subject, record, listing || {}];
  const numeric = name => candidates.map(item => numberOrNull(item[name])).find(value => value !== null) ?? null;
  const textual = name => candidates.map(item => textOrNull(item[name])).find(value => value !== null) ?? null;
  const lastSalePrice = numeric('lastSalePrice');
  const lastSaleDate = candidates.map(item => dateOrNull(item.lastSaleDate)).find(value => value !== null) ?? null;
  const squareFootage = numeric('squareFootage');
  const estimatePrice = numberOrNull(avm?.price);
  const price = numberOrNull(listing?.price) ?? estimatePrice;
  return {
    address: textual('formattedAddress') || address,
    propertyType: textual('propertyType'),
    bedrooms: numeric('bedrooms'), bathrooms: numeric('bathrooms'), squareFootage,
    yearBuilt: numeric('yearBuilt'), lotSize: numeric('lotSize'),
    pricePerSqft: price !== null && squareFootage > 0 ? Math.round(price / squareFootage) : null,
    listing: listing ? { status: 'Active', listPrice: numberOrNull(listing.price), daysOnMarket: numberOrNull(listing.daysOnMarket), listedDate: dateOrNull(listing.listedDate) } : null,
    estimate: avm && [estimatePrice, numberOrNull(avm.priceRangeLow), numberOrNull(avm.priceRangeHigh)].some(value => value !== null)
      ? { price: estimatePrice, low: numberOrNull(avm.priceRangeLow), high: numberOrNull(avm.priceRangeHigh) } : null,
    lastSale: lastSalePrice !== null || lastSaleDate !== null ? { price: lastSalePrice, date: lastSaleDate } : null,
    sources, sampleData,
  };
}
