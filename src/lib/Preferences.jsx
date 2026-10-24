import React, { createContext, useContext, useState, useEffect } from "react";
const Context = createContext();
export const MODULES = {
  crime: "Safety / crime",
  hazards: "Natural hazards",
  schools: "Schools",
  commute: "Commute",
  groceries: "Grocery stores",
};
function saved(k, fallback) {
  try {
    return JSON.parse(localStorage.getItem(k)) ?? fallback;
  } catch {
    return fallback;
  }
}
export function PreferencesProvider({ children }) {
  const [modules, setModules] = useState(() => {
      const v = saved("propertylens.modules", []);
      return Array.isArray(v) ? v.filter((k) => k in MODULES) : [];
    }),
    [work, setWork] = useState(() => saved("propertylens.work", null));
  useEffect(() => {
    try {
      localStorage.setItem("propertylens.modules", JSON.stringify(modules));
    } catch {}
  }, [modules]);
  useEffect(() => {
    try {
      localStorage.setItem("propertylens.work", JSON.stringify(work));
    } catch {}
  }, [work]);
  return (
    <Context.Provider value={{ modules, setModules, work, setWork }}>
      {children}
    </Context.Provider>
  );
}
export const usePreferences = () => useContext(Context);
export function ModuleSelector() {
  const { modules, setModules } = usePreferences();
  return (
    <fieldset className="module-selector">
      <legend>Your insight modules</legend>
      <p>Only selected insights load when you open a home.</p>
      <div className="chips">
        {Object.entries(MODULES).map(([key, label]) => (
          <button
            type="button"
            className="toggle-chip"
            key={key}
            aria-pressed={modules.includes(key)}
            onClick={() =>
              setModules((old) =>
                old.includes(key)
                  ? old.filter((k) => k !== key)
                  : [...old, key],
              )
            }
          >
            {modules.includes(key) ? "✓ " : "+ "}
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
