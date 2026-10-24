import React from "react";
import { Link } from "react-router-dom";

export default function LookupState({ loading = false, error }) {
  const titles = {
    INVALID_ADDRESS: "Start with a complete address.",
    NOT_FOUND: "We couldn’t find that property.",
    RATE_LIMIT: "The data request limit has been reached.",
    ACCESS_LIMIT: "Property data access is paused.",
  };
  return (
    <section className="card lookup-state" aria-busy={loading}>
      <p className="eyebrow">
        {loading ? "GATHERING THE DETAILS" : "LET’S TAKE ANOTHER LOOK"}
      </p>
      <div role={loading ? "status" : "alert"}>
        <h1>
          {loading
            ? "Finding your property…"
            : titles[error?.code] || "We couldn’t load this property."}
        </h1>
        <p>
          {loading
            ? "Checking property facts, sale listings, and the estimated value."
            : error?.message || "Something went wrong. Please try again later."}
        </p>
      </div>
      {loading && (
        <div className="skeleton-layout" aria-hidden="true">
          <div className="skeleton skeleton-price" />
          <div className="skeleton-stats">
            {[1, 2, 3, 4].map((item) => (
              <div className="skeleton" key={item} />
            ))}
          </div>
          <div className="skeleton skeleton-details" />
        </div>
      )}
      <Link className="button-link" to="/">
        Try another address <span aria-hidden="true">↗</span>
      </Link>
    </section>
  );
}
