import React, { useState } from "react";
import { catalog } from "../../lib/planner/catalog";
import { fitMessage, wallClearances } from "../../lib/planner/collisions";
export default function FurniturePanel({
  items,
  selected,
  setSelected,
  add,
  update,
  remove,
  duplicate,
  warnings,
  floor,
  roomId,
  history,
  undo,
  redo,
  snap,
  setSnap,
  flush,
  setFlush,
  library = catalog,
  onLibraryEdit,
  onLibraryDelete,
  children,
}) {
  const [search, setSearch] = useState("");
  const item = items.find((i) => i.id === selected),
    room =
      floor.rooms.find((r) => r.id === roomId) ||
      floor.rooms.find((r) => r.type === "living") ||
      floor.rooms[0];
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
      <label>
        <input
          type="checkbox"
          disabled={floor.openPlan || !!floor.walls}
          checked={flush && !floor.openPlan && !floor.walls}
          onChange={(e) => setFlush(e.target.checked)}
        />{" "}
        Snap flush to walls
      </label>
      {children}
      <details open>
        <summary>Library & catalog</summary>
        <label>
          Search furniture
          <input value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <div className="catalog-list">
          {library
            .filter((c) => c.name.toLowerCase().includes(search.toLowerCase()))
            .map((c) => (
              <article
                key={c.id}
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData(
                    "application/propertylens-furniture",
                    c.id,
                  )
                }
              >
                <div>
                  <strong>{c.name}</strong>
                  {c.imageUrl && <img className="furniture-thumbnail" src={c.imageUrl} alt={c.name} loading="lazy" referrerPolicy="no-referrer" />}
                  <small>
                    {c.widthIn} × {c.depthIn} × {c.heightIn} in ·{" "}
                    {c.estimated ? "Estimated" : c.source}
                  </small>
                  {c.source === "ikea" && <small>{c.fixture ? "Sample · " : ""}{c.price || "IKEA"} · Sized placeholder</small>}
                </div>
                <button onClick={() => add(c, room)}>Add to room</button>
                {onLibraryEdit && !c.id.startsWith("catalog-") && (
                  <>
                    <button onClick={() => onLibraryEdit(c)}>Edit</button>
                    <button onClick={() => onLibraryDelete(c.id)}>
                      Delete from library
                    </button>
                  </>
                )}
              </article>
            ))}
        </div>
      </details>
      <h3>Placed items</h3>
      <label>
        Select an item
        <select
          value={selected || ""}
          onChange={(e) => setSelected(e.target.value)}
        >
          <option value="">None</option>
          {items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name}
            </option>
          ))}
        </select>
      </label>
      {item && (
        <fieldset>
          <legend>{item.name}</legend>
          <p>{fitMessage(item, room)}</p>
          {!floor.walls && <p>
            {floor.openPlan?'Nearest plan edges':'Nearest room walls'}: {wallClearances(item, floor).x} in horizontally,{" "}
            {wallClearances(item, floor).z} in vertically (negative means
            {floor.openPlan?'outside the plan).':'crossing a wall).'}
          </p>}
          {[
            ["xIn", "Position X (in)"],
            ["zIn", "Position Z (in)"],
            ["rotationDeg", "Rotation (degrees)"],
            ["widthIn", "Width (in)"],
            ["depthIn", "Depth (in)"],
            ["heightIn", "Height (in)"],
          ].map(([key, label]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                value={Math.round(item[key] || 0)}
                min={key.endsWith("In") ? 0 : undefined}
                max={key === "rotationDeg" ? 360 : 20000}
                onChange={(e) => update(item.id, { [key]: +e.target.value })}
              />
            </label>
          ))}
          <label>
            Color
            <input
              type="color"
              value={item.colorOverride || item.color}
              onChange={(e) =>
                update(item.id, { colorOverride: e.target.value })
              }
            />
          </label>
          <div className="panel-actions">
            <button
              onClick={() =>
                update(item.id, { rotationDeg: (item.rotationDeg || 0) - 15 })
              }
            >
              Rotate −15°
            </button>
            <button
              onClick={() =>
                update(item.id, { rotationDeg: (item.rotationDeg || 0) + 15 })
              }
            >
              Rotate +15°
            </button>
            <button onClick={() => duplicate(item)}>Duplicate</button>
            <button onClick={() => remove(item.id)}>Delete</button>
            {[
              ["Left", -1, 0],
              ["Right", 1, 0],
              ["Up", 0, -1],
              ["Down", 0, 1],
            ].map(([label, x, z]) => (
              <button
                key={label}
                onClick={() =>
                  update(item.id, { xIn: item.xIn + x, zIn: item.zIn + z })
                }
              >
                {label} 1 in
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <h3>Warnings ({warnings.length})</h3>
      {warnings.length ? (
        <ul>
          {warnings.map((w, i) => (
            <li key={i}>{w.message}</li>
          ))}
        </ul>
      ) : (
        <p>No collisions on this floor.</p>
      )}
      <p className="small-note">
        Arrow keys: move 1 in (Shift: 6). [ / ]: rotate 15° (Shift: 90°).
        Delete, Ctrl+D, Ctrl+Z / Ctrl+Shift+Z, Escape. Rugs do not collide.
      </p>
    </aside>
  );
}
