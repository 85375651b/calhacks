import React, { useEffect, useRef, useState } from "react";
import { categories } from "../../lib/planner/catalog";
import { plannerApi } from "../../lib/planner/persistence";
import { prefillMeasurements } from "../../lib/planner/measurements";
export function ConfirmFurniture({ value, onConfirm, onCancel, canPlace = false }) {
  const [draft, setDraft] = useState(() => prefillMeasurements(value)),
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
          const original = prefillMeasurements(value);
          const edited = ["widthIn","depthIn","heightIn"].some(k=>draft[k] !== original[k]);
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
              name={k}
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
  const [input, setInput] = useState(''),
    [pending, setPending] = useState(null),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState('');
  useEffect(() => {
    if (edit) setPending(edit);
  }, [edit]);
  async function search(e) {
    e.preventDefault();
    if (busy || !input.trim()) return;
    setBusy(true);
    setStatus('Searching IKEA for your furniture… This may take up to 90 seconds.');
    try {
      const result = await plannerApi(clientId, '/furniture/resolve', {
        method: 'POST',
        body: JSON.stringify({query:input.trim(),provider:'ikea'}),
      });
      setPending({...result,id:crypto.randomUUID()});
      setStatus('Match found. Confirm the product and its measurements.');
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }
  async function confirm(draft, place = false) {
    const ok = await onSave(draft);
    if (ok === false) throw new Error('Could not save furniture.');
    if (place) onPlace?.(draft);
    setPending(null);
    onEditDone?.();
    setStatus('Added to your furniture library.');
  }
  return (
    <section className="furniture-add">
      <h3>Add your furniture</h3>
      <form onSubmit={search}>
        <label>
          Describe the IKEA furniture you want
          <input
            required
            maxLength={500}
            type="text"
            value={input}
            disabled={busy || !!pending}
            onChange={(e) => setInput(e.target.value)}
            placeholder="small grey two-seat sofa"
          />
        </label>
        <button disabled={busy || !!pending}>
          {busy ? 'Searching IKEA…' : 'Find IKEA furniture'}
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
            onEditDone?.();
          }}
        />
      )}
    </section>
  );
}
