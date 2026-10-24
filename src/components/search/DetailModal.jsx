import { useFavorites } from "../../lib/Favorites";
import InsightModules from "./InsightModules";
import React, { useEffect, useRef, useState } from "react";
import { Photo, money, num } from "./ListingGrid";
import { ModuleSelector } from "../../lib/Preferences";
import WorkAddress from "./WorkAddress";
export default function DetailModal({
  listing: original,
  onClose,
  children,
  onFavorite = () => {},
  saved = false,
}) {
  const { message } = useFavorites();
  const [backfill, setBackfill] = useState({}),
    [snapshots, setSnapshots] = useState(original.snapshots || {});
  const p = { ...original, ...backfill };
  const ref = useRef();
  useEffect(() => {
    const previous = document.activeElement,
      old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current.showModal();
    return () => {
      ref.current?.close();
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="detail-modal"
      aria-modal="true"
      aria-labelledby="detail-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) {
          const r = ref.current.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose();
        }
      }}
    >
      <div className="modal-top">
        <span className="eyebrow">A CLOSER LOOK</span>
        <button
          autoFocus
          className="quiet-button"
          onClick={onClose}
          aria-label="Close property details"
        >
          Close ×
        </button>
      </div>
      <Photo key={p.photoUrl} url={p.photoUrl} address={p.address} />
      <div className="modal-content">
        <div className="detail-heading">
          <div>
            <h2 id="detail-title">{p.address}</h2>
            <p>
              {p.city}, {p.state} {p.zip}
            </p>
            <strong className="detail-price">{money(p.price)}</strong>
          </div>
          <button
            aria-pressed={saved}
            onClick={() => onFavorite({ ...p, snapshots })}
          >
            {saved ? "♥ Saved" : "♡ Save home"}
          </button>
        </div>
        {message && (
          <p role="status" className="error">
            {message}
          </p>
        )}
        <div className="source-links">
          {p.zillowUrl && (
            <a href={p.zillowUrl} target="_blank" rel="noopener noreferrer">
              View on Zillow ↗
            </a>
          )}
          {p.redfinUrl && (
            <a href={p.redfinUrl} target="_blank" rel="noopener noreferrer">
              View on Redfin ↗
            </a>
          )}
        </div>
        <dl className="detail-facts">
          {[
            ["Beds", num(p.beds)],
            ["Baths", num(p.baths)],
            ["Square feet", num(p.sqft)],
            ["Year built", p.yearBuilt == null ? "N/A" : String(p.yearBuilt)],
            ["Lot sq ft", num(p.lotSizeSqft)],
            ["Monthly HOA", money(p.hoaMonthly)],
            ["Days on market", num(p.daysOnMarket)],
          ].map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd>{v}</dd>
            </div>
          ))}
        </dl>
        <ModuleSelector />
        <WorkAddress />
        <InsightModules
          listing={p}
          snapshots={snapshots}
          onData={(type, data) => {
            setSnapshots((old) => ({ ...old, [type]: data }));
            if (type === "schools")
              setBackfill((old) => ({
                ...old,
                ...(original.yearBuilt == null && data.yearBuilt
                  ? { yearBuilt: data.yearBuilt }
                  : {}),
                ...(data.photos?.length
                  ? { photoUrl: original.photoUrl || data.photos[0] }
                  : {}),
              }));
          }}
        />
        {snapshots.schools?.photos?.length > 0 && (
          <div className="extra-photos">
            {snapshots.schools.photos.map((url) => (
              <Photo key={url} url={url} address={p.address} />
            ))}
          </div>
        )}
      </div>
    </dialog>
  );
}
