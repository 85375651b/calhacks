import { readSession } from "../lib/planner/listingSnapshot";
import React, { useState } from "react";
import { Link } from "react-router-dom";
import { useFavorites } from "../lib/Favorites";
import ListingGrid from "../components/search/ListingGrid";
import DetailModal from "../components/search/DetailModal";
export default function Favorites() {
  const { favorites, toggle, loading, message, refresh } = useFavorites(),
    [selected, setSelected] = useState(() => {
      const back = readSession("propertylens.plannerReturn");
      return back?.path === "/favorites" ? back.listing : null;
    });
  return (
    <main id="main" className="container search-page">
      <p className="eyebrow">YOUR SHORTLIST</p>
      <h1>A few places to call home.</h1>
      <p>
        {favorites.length} of 5 homes saved · Stored for this browser’s
        anonymous ID.
      </p>
      {loading ? (
        <p role="status">Loading saved homes…</p>
      ) : (
        <ListingGrid
          listings={favorites}
          favorites={favorites}
          onFavorite={toggle}
          onOpen={setSelected}
        />
      )}{" "}
      {!loading && !favorites.length && (
        <div className="empty-state">
          {message ? (
            <>
              <p>{message}</p>
              <button onClick={refresh}>Retry</button>
            </>
          ) : (
            <>
              <p>Your shortlist starts with a home you love.</p>
              <Link className="button-link" to="/">
                Explore homes ↗
              </Link>
            </>
          )}
        </div>
      )}
      {selected && (
        <DetailModal
          listing={selected}
          onClose={() => setSelected(null)}
          saved={favorites.some((p) => p.id === selected.id)}
          onFavorite={toggle}
        />
      )}
    </main>
  );
}
