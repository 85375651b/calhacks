import React, { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

function Highlight({ label, query }) {
  const words = query
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!words.length) return label;
  return label
    .split(new RegExp(`(${words.join("|")})`, "gi"))
    .map((part, index) =>
      index % 2 ? <strong key={index}>{part}</strong> : part,
    );
}

export default function AddressCombobox() {
  const [address, setAddress] = useState(""),
    [error, setError] = useState("");
  const [suggestions, setSuggestions] = useState([]),
    [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(-1);
  const formRef = useRef(null),
    requestRef = useRef(null),
    queryRef = useRef("");
  const id = useId(),
    listId = `${id}-suggestions`;
  const navigate = useNavigate();
  const expanded = open && (loading || suggestions.length > 0);

  useEffect(() => {
    const query = address.trim(),
      controller = new AbortController();
    requestRef.current = controller;
    if (query.length < 3) return () => controller.abort();
    const timer = setTimeout(async () => {
      if (controller.signal.aborted) return;
      setLoading(true);
      try {
        const response = await fetch(
          `/api/autocomplete?${new URLSearchParams({ q: query })}`,
          { signal: controller.signal },
        );
        const items = response.ok ? await response.json() : [];
        if (!controller.signal.aborted && queryRef.current.trim() === query) {
          setSuggestions(
            Array.isArray(items)
              ? items
                  .filter((item) => typeof item?.label === "string")
                  .slice(0, 5)
              : [],
          );
          setActive(-1);
        }
      } catch {
        if (!controller.signal.aborted) setSuggestions([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [address]);

  useEffect(() => {
    const outside = (event) => {
      if (!formRef.current?.contains(event.target)) {
        setOpen(false);
        setActive(-1);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);

  function search(value) {
    if (!value.trim()) {
      setError("Enter a property address to get started.");
      return;
    }
    requestRef.current?.abort();
    queryRef.current = value;
    setAddress(value);
    setOpen(false);
    setActive(-1);
    setLoading(false);
    navigate(`/results?${new URLSearchParams({ address: value.trim() })}`);
  }
  function submit(event) {
    event.preventDefault();
    search(address);
  }
  function onKeyDown(event) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setActive(-1);
    } else if (
      (event.key === "ArrowDown" || event.key === "ArrowUp") &&
      suggestions.length
    ) {
      event.preventDefault();
      setOpen(true);
      setActive((index) =>
        event.key === "ArrowDown"
          ? (index + 1) % suggestions.length
          : index < 0
            ? suggestions.length - 1
            : (index - 1 + suggestions.length) % suggestions.length,
      );
    } else if (
      event.key === "Enter" &&
      open &&
      active >= 0 &&
      suggestions[active]
    ) {
      event.preventDefault();
      search(suggestions[active].label);
    }
  }

  return (
    <form ref={formRef} className="search-form" onSubmit={submit} noValidate>
      <label htmlFor={id}>Start with a US property address</label>
      <div className="autocomplete-wrap">
        <div className={`search-box ${error ? "has-error" : ""}`}>
          <span aria-hidden="true" className="search-icon">
            ⌕
          </span>
          <input
            id={id}
            name="address"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={expanded}
            aria-controls={listId}
            aria-activedescendant={
              expanded && active >= 0 ? `${listId}-${active}` : undefined
            }
            autoComplete="off"
            maxLength={300}
            placeholder="Enter street address, city, state"
            value={address}
            onChange={(event) => {
              requestRef.current?.abort();
              queryRef.current = event.target.value;
              setAddress(event.target.value);
              setError("");
              setSuggestions([]);
              setActive(-1);
              setLoading(false);
              setOpen(true);
            }}
            onKeyDown={onKeyDown}
            onFocus={() => setOpen(true)}
            onBlur={(event) => {
              if (!formRef.current?.contains(event.relatedTarget)) {
                setOpen(false);
                setActive(-1);
              }
            }}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-error` : `${id}-note`}
          />
          <button type="submit">
            Search <span aria-hidden="true">↗</span>
          </button>
        </div>
        <div className="autocomplete-dropdown" hidden={!expanded}>
          {loading && (
            <p className="suggestion-loading" role="status">
              Searching…
            </p>
          )}
          <ul id={listId} role="listbox" aria-label="Suggested US addresses">
            {suggestions.map((suggestion, index) => (
              <li
                id={`${listId}-${index}`}
                role="option"
                aria-selected={active === index}
                key={suggestion.label}
                className={active === index ? "highlighted" : ""}
                onMouseMove={() => setActive(index)}
                onPointerDown={(event) => event.preventDefault()}
                onClick={() => search(suggestion.label)}
              >
                <span aria-hidden="true" className="suggestion-pin">
                  ⌖
                </span>
                <span>
                  <Highlight label={suggestion.label} query={address} />
                </span>
                <span aria-hidden="true" className="suggestion-arrow">
                  ↗
                </span>
              </li>
            ))}
          </ul>
          {suggestions.length > 0 && (
            <p className="suggestion-credit">
              Address suggestions: Photon / OpenStreetMap
            </p>
          )}
        </div>
      </div>
      <span className="sr-only" role="status" aria-live="polite">
        {open && !loading && suggestions.length
          ? `${suggestions.length} suggestions available. Use up and down arrows to choose, then Enter to search.`
          : ""}
      </span>
      {error && (
        <p className="error" id={`${id}-error`} role="alert">
          {error}
        </p>
      )}
      <p className="search-note" id={`${id}-note`}>
        Choose a suggested address or enter city, state, and ZIP. Data powered
        by RentCast.
      </p>
    </form>
  );
}
