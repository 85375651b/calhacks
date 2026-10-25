import React, { useEffect, useRef, useState } from "react";
import { categories, resolveName } from "../../lib/planner/catalog";
import { plannerApi } from "../../lib/planner/persistence";
export function ConfirmFurniture({ value, onConfirm, onCancel, canPlace = false }) {
  const [draft, setDraft] = useState(value),
    ref = useRef();
  const [saving,setSaving] = useState(false), [error,setError] = useState("");
  useEffect(() => {
    const old = document.activeElement;
    ref.current.showModal();
    return () => old?.focus();
  }, []);
  return (
    <dialog
      className="furniture-dialog"
      ref={ref}
      aria-labelledby="confirm-furniture-title"
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (saving) return;
          const place = e.nativeEvent.submitter?.value === "place";
          const edited = ["widthIn","depthIn","heightIn"].some(k=>draft[k] !== value[k]);
          const confirmed = draft.source === "ikea" ? {...draft,estimated:false,
            dimensionSource: edited || value.dimensionSource !== "product" ? "manual" : "product",modelStatus:"placeholder"} : draft;
          setSaving(true);
          try { await onConfirm(confirmed,place); } catch { setError("Could not save this item. Please try again."); }
          finally { setSaving(false); }
        }}
      >
        <h2 id="confirm-furniture-title">Confirm your furniture</h2>
        {draft.fixture && <span className="sample-badge">Sample search result</span>}
        {draft.estimated && <span className="sample-badge">{draft.source === "ikea" ? "Measurements needed" : "Estimated"}</span>}
        <p>
          Source: {draft.source === "ikea" ? "IKEA product search" : draft.source}
        </p>
        {draft.price ? <p>{draft.price}</p> : draft.source === "ikea" && <p>Price unavailable</p>}
        {draft.imageUrl && /^https:\/\//.test(draft.imageUrl) && (
          <img
            src={draft.imageUrl}
            alt="Product thumbnail"
            referrerPolicy="no-referrer"
          />
        )}
        <label>
          Name
          <input
            autoFocus
            required
            maxLength={160}
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </label>
        <label>
          Category
          <select
            value={draft.category}
            onChange={(e) => setDraft({ ...draft, category: e.target.value })}
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        {[
          ["widthIn", "Width"],
          ["depthIn", "Depth"],
          ["heightIn", "Height"],
        ].map(([k, label]) => (
          <label key={k}>
            {label} (inches)
            <input
              type="number"
              required
              min={k === "heightIn" ? "0.1" : "1"}
              max={k === "heightIn" ? 240 : 600}
              step="any"
              value={draft[k] ?? ""}
              placeholder="Enter product measurement"
              onChange={(e) =>
                setDraft({ ...draft, [k]: e.target.value === "" ? null : Number(e.target.value) })
              }
            />
          </label>
        ))}
        <label>
          Color
          <input
            type="color"
            value={draft.color}
            onChange={(e) => setDraft({ ...draft, color: e.target.value })}
          />
        </label>
        <p>{draft.notes}</p>
        {draft.source === "ikea" && <p>Confirm this is the product you want. A sized placeholder will represent it in your house.</p>}
        <p>Verify dimensions on the retailer's site.</p>
        {draft.sourceUrl && /^https:\/\//.test(draft.sourceUrl) && (
          <a href={draft.sourceUrl} target="_blank" rel="noopener noreferrer">
            Open product page ↗
          </a>
        )}
        <div className="panel-actions">
          <button type="button" disabled={saving} onClick={onCancel}>
            Cancel
          </button>
          <button disabled={saving} value="save">{saving ? "Saving…" : "Save to library"}</button>
          {canPlace && <button disabled={saving} value="place">Save and place in house</button>}
        </div>
        {error && <p role="alert">{error}</p>}
      </form>
    </dialog>
  );
}
export default function AddFurniture({ clientId, onSave, onPlace, edit, onEditDone }) {
  const [tab, setTab] = useState("IKEA"),
    [input, setInput] = useState(""),
    [pending, setPending] = useState(null),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    queue = useRef([]);
  useEffect(() => {
    if (edit) setPending(edit);
  }, [edit]);
  async function next() {
    const line = queue.current.shift();
    if (!line) {
      setBusy(false);
      return;
    }
    setBusy(true);
    setStatus(
      tab === "IKEA" ? "Searching IKEA for your furniture… This may take up to 90 seconds." : `Resolving ${line.slice(0, 50)} (${queue.current.length} remaining)`,
    );
    try {
      const isUrl = /^https?:\/\//i.test(line);
      let result;
      try {
        result = await plannerApi(clientId, "/furniture/resolve", {
          method: "POST",
          body: JSON.stringify(tab === "IKEA" ? { query:line,provider:"ikea" } : isUrl ? { url: line } : { query: line }),
        });
      } catch (e) {
        if (isUrl || tab === "IKEA") throw e;
        result = {
          ...resolveName(line),
          notes: "Server unavailable. Resolved locally using typical sizes.",
        };
      }
      setPending({ ...result, id: crypto.randomUUID() });
      if (tab === "IKEA") setStatus("Match found. Confirm the product and its measurements.");
    } catch (e) {
      setStatus(e.message);
      setBusy(false);
      queue.current = [];
    }
  }
  function resolve(e) {
    e.preventDefault();
    if (tab === "Manual") {
      setPending({
        ...resolveName(input || "My furniture"),
        id: crypto.randomUUID(),
        source: "manual",
        estimated: false,
        confidence: 1,
        notes: "Enter your measured dimensions.",
      });
      return;
    }
    const lines =
      tab === "Bulk"
        ? input
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        : [input.trim()];
    if (lines.length > 10) {
      setStatus("Use up to 10 lines at a time.");
      return;
    }
    queue.current = lines;
    next();
  }
  async function confirm(draft, place = false) {
    const ok = await onSave(draft);
    if (ok === false) return;
    if (place) onPlace?.(draft);
    setPending(null);
    onEditDone?.();
    setStatus("Added to your furniture library.");
    if (queue.current.length) next();
    else setBusy(false);
  }
  return (
    <section>
      <h3>Add your furniture</h3>
      <div
        className="panel-actions"
        role="group"
        aria-label="Add furniture method"
      >
        {["IKEA", "Name", "Link", "Manual", "Bulk"].map((t) => (
          <button
            key={t}
            aria-pressed={tab === t}
            disabled={busy}
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <form onSubmit={resolve}>
        <label>
          {tab === "Bulk"
            ? "One name or URL per line (max 10)"
            : tab === "Link"
              ? "HTTPS product URL"
              : tab === "IKEA" ? "Describe the IKEA furniture you want" : "Furniture name"}
          {tab === "Bulk" ? (
            <textarea
              required
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={4}
            />
          ) : (
            <input
              required={tab !== "Manual"}
              type={tab === "Link" ? "url" : "text"}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                tab === "Link" ? "https://…" : tab === "IKEA" ? "small grey two-seat sofa" : "queen bed, desk 60x30…"
              }
            />
          )}
        </label>
        <button disabled={busy}>
          {busy
            ? pending ? "Confirm the match…" : "Resolving…"
            : tab === "Manual"
              ? "Enter dimensions"
              : tab === "IKEA" ? "Find IKEA furniture" : "Resolve furniture"}
        </button>
      </form>
      <p role="status">{status}</p>
      {pending && (
        <ConfirmFurniture
          key={pending.id}
          value={pending}
          onConfirm={confirm}
          canPlace={!!onPlace && !edit}
          onCancel={() => {
            setPending(null);
            queue.current = [];
            setBusy(false);
            onEditDone?.();
          }}
        />
      )}
    </section>
  );
}
