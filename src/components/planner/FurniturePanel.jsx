import React from "react";
export default function FurniturePanel({
  warnings,
  history,
  undo,
  redo,
  snap,
  setSnap,
  children,
}) {
  return (
    <aside className="planner-panel furniture-panel">
      <h2>Furniture</h2>
      <div className="panel-actions">
        <button disabled={!history.past.length} onClick={undo}>
          Undo
        </button>
        <button disabled={!history.future.length} onClick={redo}>
          Redo
        </button>
      </div>
      <label>
        Snap grid (inches)
        <select value={snap} onChange={(e) => setSnap(+e.target.value)}>
          {[0, 1, 3, 6, 12].map((n) => (
            <option key={n} value={n}>
              {n || "Off"}
            </option>
          ))}
        </select>
      </label>
      {children}
      <section className="furniture-warnings" aria-labelledby="furniture-warnings-title">
      <h3 id="furniture-warnings-title">Warnings ({warnings.length})</h3>
      {warnings.length ? (
        <ul>
          {warnings.map((w, i) => (
            <li key={i}>{w.message}</li>
          ))}
        </ul>
      ) : (
        <p>No collisions on this floor.</p>
      )}
      </section>
    </aside>
  );
}
