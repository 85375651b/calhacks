import React from "react";
import PlannerLink from "./PlannerLink";
import { formatCurrency, formatNumber, formatDate } from "../lib/format";

export default function PropertyListingCard({ property }) {
  let addressHash = 2166136261;
  for (const c of property.address || "home")
    addressHash = Math.imul(addressHash ^ c.charCodeAt(0), 16777619);
  const plannerListing = {
    id: "custom-lookup-" + (addressHash >>> 0).toString(16),
    address: property.address,
    price: property.listing?.listPrice ?? property.estimate?.price,
    beds: property.bedrooms,
    baths: property.bathrooms,
    sqft: property.squareFootage,
    yearBuilt: property.yearBuilt,
    lotSizeSqft: property.lotSize,
    homeType: property.propertyType,
  };
  const hasListPrice = property.listing?.listPrice != null;
  const stats = [
    ["Beds", formatNumber(property.bedrooms)],
    ["Baths", formatNumber(property.bathrooms)],
    ["Sq ft", formatNumber(property.squareFootage)],
    ["Price / sq ft", formatCurrency(property.pricePerSqft)],
  ];
  return (
    <section
      className="card listing-card"
      aria-labelledby="listing-price-title"
    >
      <div className="listing-price-row">
        <div>
          <h2 id="listing-price-title" className="price-label">
            {hasListPrice ? "List price" : "Estimated value"}
          </h2>
          <p className="listing-price">
            {formatCurrency(
              hasListPrice
                ? property.listing.listPrice
                : property.estimate?.price,
            )}
          </p>
        </div>
        <span className="quiet-tag">
          {property.propertyType || "Property type N/A"}
        </span>
      </div>
      {property.listing && (
        <p className="listing-meta">
          {formatNumber(property.listing.daysOnMarket)} days on market{" "}
          <span aria-hidden="true">·</span> Listed{" "}
          {formatDate(property.listing.listedDate)}
        </p>
      )}
      <dl className="listing-stats">
        {stats.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <PlannerLink listing={plannerListing} />
    </section>
  );
}
