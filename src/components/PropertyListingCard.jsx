import React from "react";
import { formatCurrency, formatNumber, formatDate } from "../lib/format";

export default function PropertyListingCard({ property }) {
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
    </section>
  );
}
