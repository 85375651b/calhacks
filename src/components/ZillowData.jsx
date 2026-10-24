import React from "react";
import { formatCurrency, formatDate } from "../lib/format";

const statusLabel = (value) =>
  typeof value === "string" && value
    ? value
        .replaceAll("_", " ")
        .toLowerCase()
        .replace(/^./, (letter) => letter.toUpperCase())
    : "N/A";

export default function ZillowData({ state, rentcastEstimate }) {
  const data = state?.data;
  const loading = !state || state.status === "loading";
  return (
    <section
      className="card zillow-card"
      aria-labelledby="zillow-title"
      aria-busy={loading}
    >
      <div className="card-heading">
        <div>
          <p className="eyebrow">ANOTHER VIEW OF THE PROPERTY</p>
          <h2 id="zillow-title">
            Zillow data <span className="apify-label">via Apify</span>
          </h2>
        </div>
        {data?.usingFixtures && (
          <span className="sample-badge">
            <span className="status-dot" />
            Sample data
          </span>
        )}
      </div>
      {loading ? (
        <>
          <p className="enrichment-message" role="status">
            Gathering Zillow details… Your property overview is ready above.
          </p>
          <div className="enrichment-skeleton" aria-hidden="true">
            <div className="skeleton" />
            <div className="skeleton" />
          </div>
        </>
      ) : !data ? (
        <p className="enrichment-message" role="status">
          Zillow data unavailable right now
        </p>
      ) : (
        <>
          {data.usingFixtures && (
            <p className="fixture-notice">
              Saved Apify response for{" "}
              {data.fixtureAddress || "the sample property"}. This is not a
              fresh Zillow lookup.
            </p>
          )}
          <p className="zillow-status">
            Zillow listing status:{" "}
            <strong>{statusLabel(data.listingStatus)}</strong>
          </p>
          {data.photos?.length > 0 ? (
            <div className="photo-strip">
              {data.photos.slice(0, 4).map((url, index) => (
                <img
                  key={url}
                  src={url}
                  alt={`Property photo ${index + 1} from Zillow via Apify`}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={(event) => {
                    event.currentTarget.hidden = true;
                  }}
                />
              ))}
            </div>
          ) : (
            <p className="enrichment-message">Photos: N/A</p>
          )}
          <dl className="estimate-comparison">
            <div>
              <dt>RentCast estimate</dt>
              <dd>{formatCurrency(rentcastEstimate?.price)}</dd>
            </div>
            <div>
              <dt>Zestimate</dt>
              <dd>{formatCurrency(data.zestimate)}</dd>
            </div>
          </dl>
          <p className="comparison-note">
            Different models give different numbers. Estimates are not
            appraisals.
          </p>
          <div className="zillow-details">
            <section aria-labelledby="zillow-history">
              <h3 id="zillow-history">Price history</h3>
              {data.priceHistory?.length ? (
                <ul className="price-history">
                  {data.priceHistory.slice(0, 5).map((item, index) => (
                    <li key={`${item.date}-${index}`}>
                      <span>
                        {formatDate(item.date)}
                        <small>{item.event || "N/A"}</small>
                      </span>
                      <strong>{formatCurrency(item.price)}</strong>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="enrichment-message">N/A</p>
              )}
            </section>
            <section aria-labelledby="zillow-description">
              <h3 id="zillow-description">About this property</h3>
              <p className="zillow-description">{data.description || "N/A"}</p>
              <p className="zillow-brokerage">
                <strong>Brokerage:</strong> {data.brokerage || "N/A"}
              </p>
              {data.zillowUrl ? (
                <a
                  className="zillow-link"
                  href={data.zillowUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on Zillow <span aria-hidden="true">↗</span>
                </a>
              ) : (
                <p className="enrichment-message">Zillow link: N/A</p>
              )}
            </section>
          </div>
        </>
      )}
      <p className="zillow-disclaimer">
        Zillow data is collected via a third-party Apify actor. Not affiliated
        with or endorsed by Zillow.
      </p>
    </section>
  );
}
