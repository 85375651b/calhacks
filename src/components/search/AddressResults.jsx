import React from "react";
import ListingGrid from "./ListingGrid";
export default function AddressResults({
  result,
  onChoose,
  onNearby,
  onReset,
  onOpen,
  favorites,
  onFavorite,
  onRetry,
}) {
  return (
    <section className="address-results" aria-live="polite" aria-atomic="false">
      {result.usingFixtures && (
        <p className="sample-badge">Sample address data</p>
      )}
      {result.address && (
        <p className="toggle-chip">
          Looking up: {result.address.standardized} ·{" "}
          {result.address.verified ? "verified" : "unverified"}
        </p>
      )}
      <p role="status">{result.message}</p>
      {result.triedNote && <p className="small-note">{result.triedNote}</p>}
      {result.result === "ambiguous" && (
        <div className="chips">
          {result.candidates.map((p) => (
            <button
              className="toggle-chip"
              key={p.label}
              onClick={() => onChoose(p)}
            >
              {p.standardized || p.label} ·{" "}
              {p.verified ? "verified" : "unverified"}
            </button>
          ))}
        </div>
      )}
      {result.result === "for_sale" && (
        <ListingGrid
          listings={result.listings.filter((p) => p.status === "for_sale")}
          onOpen={onOpen}
          favorites={favorites}
          onFavorite={onFavorite}
        />
      )}
      <div className="chips">
        {["check_failed", "not_for_sale"].includes(result.result) && (
          <button onClick={onRetry}>{result.result === "check_failed" ? "Retry" : "Check again"}</button>
        )}
        {result.address && (
          <button onClick={() => onNearby(result.address)}>
            {result.result === "for_sale"
              ? "Show more homes for sale nearby"
              : "Show homes for sale nearby"}
          </button>
        )}
        <button className="quiet-button" onClick={onReset}>
          Try another address
        </button>
      </div>
    </section>
  );
}
