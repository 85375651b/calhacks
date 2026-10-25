import React, { useState } from "react";
export default function RoomPanel({ floor, overrides, setOverrides, onReset, embedded = false }) {
  const [metric, setMetric] = useState(false);
  return (
    <aside className={embedded ? "room-settings" : "planner-panel room-panel"}>
      <h2>Rooms</h2>
      <button onClick={() => setMetric(!metric)}>
        Units: {metric ? "metric" : "feet / inches"}
      </button>
      <p>
        Estimated layout, not the real floor plan. Editing fixed room sizes
        changes the footprint. Furniture outside resized rooms is flagged.
      </p>
      {floor.rooms
        .filter((r) => r.type !== "hallway")
        .map((r) => (
          <fieldset key={r.id}>
            <legend>
              {r.name}
              {r.tight ? " · Tight" : ""}
            </legend>
            <small>
              {r.dimensionSource === "listing"
                ? "From listing data"
                : r.dimensionSource === "user"
                  ? "Custom dimensions"
                  : "Estimated dimensions"}
            </small>
            {["widthIn", "depthIn"].map((k) => {
              const value = overrides[r.id]?.[k] ?? r[k];
              function change(n) {
                setOverrides({
                  ...overrides,
                  [r.id]: {
                    widthIn: r.widthIn,
                    depthIn: r.depthIn,
                    ...overrides[r.id],
                    [k]: Math.max(36, Math.min(1200, n)),
                  },
                });
              }
              return (
                <div key={k}>
                  <strong>{k === "widthIn" ? "Width" : "Depth"}</strong>
                  {metric ? (
                    <label>
                      Centimeters
                      <input
                        type="number"
                        min="91.44"
                        max="3048"
                        step=".1"
                        value={Math.round(value * 2.54 * 10) / 10}
                        onChange={(e) => change(+e.target.value / 2.54)}
                      />
                    </label>
                  ) : (
                    <div className="dimension-pair">
                      <label>
                        Feet
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={Math.floor(value / 12)}
                          onChange={(e) =>
                            change(+e.target.value * 12 + (value % 12))
                          }
                        />
                      </label>
                      <label>
                        Inches
                        <input
                          type="number"
                          min="0"
                          max="11.9"
                          step=".1"
                          value={Math.round((value % 12) * 10) / 10}
                          onChange={(e) =>
                            change(
                              Math.floor(value / 12) * 12 + +e.target.value,
                            )
                          }
                        />
                      </label>
                    </div>
                  )}
                </div>
              );
            })}
          </fieldset>
        ))}
      <button onClick={onReset}>Reset layout</button>
    </aside>
  );
}
