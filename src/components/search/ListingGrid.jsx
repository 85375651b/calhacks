import PlannerLink from '../PlannerLink';
import React, { useState } from "react";
export const money = (v) =>
  typeof v === "number" && Number.isFinite(v)
    ? new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
      }).format(v)
    : "N/A";
export const num = (v) =>
  typeof v === "number" && Number.isFinite(v)
    ? v.toLocaleString("en-US")
    : "N/A";
export function Photo({ url, address }) {
  const [failed, setFailed] = useState(false);
  return url && !failed ? (
    <img
      src={url}
      alt={"Property photo: " + address}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  ) : (
    <div
      className="photo-placeholder"
      role="img"
      aria-label="Property photo unavailable"
    >
      <span>⌂</span>
      <small>Photo unavailable</small>
    </div>
  );
}
export default function ListingGrid({
  listings,
  onOpen,
  onFavorite = () => {},
  favorites = [],
}) {
  return (
    <div className="listing-grid">
      {listings.map((p) => (
        <article className="listing-card" key={p.id}>
          <button
            className="listing-open"
            data-listing-id={p.id}
            onClick={() => onOpen?.(p)}
            aria-label={"View " + p.address}
          >
            <Photo key={p.photoUrl} url={p.photoUrl} address={p.address} />
            <div className="listing-copy">
              <div className="source-badges">
                {p.sources.map((s) => (
                  <span key={s}>{s}</span>
                ))}
              </div>
              <h2>{money(p.price)}</h2>
              <p>
                <b>{num(p.beds)}</b> beds · <b>{num(p.baths)}</b> baths ·{" "}
                <b>{num(p.sqft)}</b> sqft
              </p>
              <h3>{p.address}</h3>
              <p>
                {p.city}, {p.state} {p.zip}
              </p>
              <small>
                Built {p.yearBuilt == null ? "N/A" : String(p.yearBuilt)} ·{" "}
                {num(p.daysOnMarket)} days on market
              </small>
            </div>
          </button>
          <PlannerLink listing={p} compact className="card-planner" />
          <button
            className="heart"
            aria-label={
              (favorites.some((f) => f.id === p.id) ? "Unsave " : "Save ") +
              p.address
            }
            aria-pressed={favorites.some((f) => f.id === p.id)}
            onClick={() => onFavorite(p)}
          >
            {favorites.some((f) => f.id === p.id) ? "♥" : "♡"}
          </button>
        </article>
      ))}
    </div>
  );
}
