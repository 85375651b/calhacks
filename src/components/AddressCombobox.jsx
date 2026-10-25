import React, { useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { classifyIntent } from "../lib/search/intent";
import { useFavorites } from "../lib/Favorites";
import { usePreferences } from "../lib/Preferences";
import "../styles/address.css";
function Highlight({ text = "", query }) {
  const words = query.split(/\W+/).filter(Boolean);
  return words.length
    ? text
        .split(new RegExp(`(${words.join("|")})`, "gi"))
        .map((s, i) => (i % 2 ? <mark key={i}>{s}</mark> : s))
    : text;
}
export default function AddressCombobox({
  onSelect,
  onSubmit,
  label = "Start with a US property address",
  value,
  onChange,
  bias,
  embedded = false,
  description = false,
  disabled = false,
  id: givenId,
  placeholder,
}) {
  const [local, setLocal] = useState(""),
    [items, setItems] = useState([]),
    [open, setOpen] = useState(false),
    [active, setActive] = useState(-1),
    [loading, setLoading] = useState(false);
  const address = value ?? local,
    change = (v) => (onChange ? onChange(v) : setLocal(v)),
    container = useRef(),
    request = useRef(),
    sequence = useRef(0),
    navigate = useNavigate(),
    generated = useId(),
    id = givenId || generated,
    listId = id + "-suggestions";
  const { clientId } = useFavorites(),
    { work } = usePreferences();
  bias = bias || work;
  const eligible =
    address.trim().length >= 3 &&
    (!description || classifyIntent(address).intent === "address");
  const expanded = open && eligible;
  useEffect(() => {
    const seq = ++sequence.current,
      controller = new AbortController();
    request.current = controller;
    setItems([]);
    setActive(-1);
    setLoading(false);
    if (!eligible) return () => controller.abort();
    const timer = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: address.slice(0, 300) });
        if (Number.isFinite(bias?.lat) && Number.isFinite(bias?.lng)) {
          params.set("lat", bias.lat);
          params.set("lng", bias.lng);
        }
        const r = await fetch("/api/autocomplete?" + params, {
            signal: controller.signal,
            headers: { "X-Client-Id": clientId },
          }),
          v = r.ok ? await r.json() : [];
        if (seq === sequence.current && !controller.signal.aborted)
          setItems(Array.isArray(v) ? v.slice(0, 6) : []);
      } catch {
      } finally {
        if (seq === sequence.current && !controller.signal.aborted)
          setLoading(false);
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [address, eligible, bias?.lat, bias?.lng, clientId]);
  useEffect(() => {
    const close = (e) => {
      if (!container.current?.contains(e.target)) {
        setOpen(false);
        setActive(-1);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  async function choose(p) {
    request.current?.abort();
    setOpen(false);
    setActive(-1);
    change(p.label);
    if (p.resultType === "city" || p.resultType === "street") return;
    if (description) {
      onSelect?.(p);
      return;
    }
    if (p.line1 || p.street)
      try {
        const r = await fetch("/api/address/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selected: p }),
        });
        if (r.ok) {
          p = await r.json();
          change(p.standardized || p.label);
        }
      } catch {}
    if (onSelect) onSelect(p);
    else
      navigate(
        "/lookup?" +
          new URLSearchParams({ address: p.standardized || p.label }),
      );
  }
  function submit() {
    setOpen(false);
    if (!address.trim() || disabled) return;
    if (onSubmit) onSubmit(address);
    else if (onSelect) onSelect({ label: address.trim() });
    else
      navigate("/lookup?" + new URLSearchParams({ address: address.trim() }));
  }
  function keys(e) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      setActive(-1);
    }
    if (["ArrowUp", "ArrowDown"].includes(e.key) && eligible && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) =>
        e.key === "ArrowDown"
          ? (i + 1) % items.length
          : i < 0
            ? items.length - 1
            : (i - 1 + items.length) % items.length,
      );
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (expanded && active >= 0) choose(items[active]);
      else submit();
    }
  }
  const Input = description ? "textarea" : "input",
    Wrapper = embedded ? "div" : "form";
  return (
    <Wrapper
      ref={container}
      className="address-combobox"
      {...(!embedded
        ? {
            onSubmit: (e) => {
              e.preventDefault();
              submit();
            },
          }
        : {})}
    >
      <label htmlFor={id}>{label}</label>
      <div className="autocomplete-wrap">
        <Input
          id={id}
          value={address}
          onChange={(e) => {
            request.current?.abort();
            change(e.target.value);
            setOpen(true);
            setActive(-1);
          }}
          onKeyDown={keys}
          onFocus={() => setOpen(true)}
          onBlur={(e) => {
            if (!container.current?.contains(e.relatedTarget)) setOpen(false);
          }}
          disabled={disabled}
          rows={description ? 3 : undefined}
          maxLength={description ? 500 : 300}
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-activedescendant={
            expanded && active >= 0 ? `${listId}-${active}` : undefined
          }
          placeholder={placeholder || "Enter street address, city, state"}
        />
        <div className="autocomplete-dropdown" hidden={!expanded}>
          {loading && <p role="status">Searching addresses…</p>}
          {!loading && !items.length && (
            <p role="status">
              No matching addresses. Keep typing or press Enter to search.
            </p>
          )}
          <ul id={listId} role="listbox" aria-label="Suggested US addresses">
            {items.map((p, i) => (
              <li
                key={p.label}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={active === i}
                className={active === i ? "highlighted" : ""}
                onMouseMove={() => setActive(i)}
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => choose(p)}
              >
                <span>
                  <strong>
                    <Highlight
                      text={p.line1 || p.street || p.city}
                      query={address}
                    />
                  </strong>
                  <small>
                    <Highlight
                      text={`${p.city}, ${p.state} ${p.zip || ""}`}
                      query={address}
                    />
                  </small>
                </span>
                {p.forSale && <span className="sample-badge">For sale</span>}
              </li>
            ))}
          </ul>
          <p className="suggestion-credit">
            {items.some((p) => p.provider === "sample")
              ? "Sample addresses"
              : `Address search by ${items.some((p) => p.provider === "geoapify") ? "Geoapify" : "Photon"}, © OpenStreetMap contributors`}
          </p>
        </div>
      </div>
      {!embedded && (
        <button disabled={disabled || !address.trim()}>
          {onSelect ? "Set address" : "Search"}
        </button>
      )}
      <span className="sr-only" aria-live="polite">
        {expanded && !loading
          ? `${items.length} suggestions. Use arrow keys and Enter to choose.`
          : ""}
      </span>
    </Wrapper>
  );
}
