import PlannerLink from '../PlannerLink';
import { sameHome } from "../../lib/search/address";
import React, { useState } from "react";
import Pagination, { usePagination } from './Pagination';
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
  paginate = true,
}) {
  const pagination = usePagination(listings);
  return (
    <>
    <div className="listing-grid">
      {(paginate ? pagination.items : listings).map((p) => (
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
              {p.distanceMiles != null && <p>{p.distanceMiles} miles from your radius center (straight-line)</p>}
              {p.commute && <p className={`commute-badge ${Number.isFinite(p.commute.minutes) ? p.commute.minutes <= p.commute.maxMinutes ? 'within' : 'over' : 'unchecked'}`}>
                {Number.isFinite(p.commute.minutes) ? `Commute about ${p.commute.minutes} min (${p.commute.departAt}, typical traffic)${p.commute.usingFixtures ? ' · sample data' : ''}` : p.commute.error || 'Commute not verified'}
              </p>}
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
              (favorites.some((f) => sameHome(f, p)) ? "Unsave " : "Save ") +
              p.address
            }
            aria-pressed={favorites.some((f) => sameHome(f, p))}
            onClick={() => onFavorite(p)}
          >
            {favorites.some((f) => sameHome(f, p)) ? "♥" : "♡"}
          </button>
        </article>
      ))}
    </div>
    {paginate && <Pagination {...pagination} />}
    </>
  );
}
