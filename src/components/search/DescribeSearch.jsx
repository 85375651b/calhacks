import AddressCombobox from "../AddressCombobox";
import React, { useEffect, useRef, useState } from "react";
import { EXAMPLES, interpretationFor } from "../../../server/search/nlParser";
import { defaults } from "../../../server/search/criteria";
import { usePreferences } from "../../lib/Preferences";
import { useFavorites } from "../../lib/Favorites";

export function localRead(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}
export function localWrite(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}
export default function DescribeSearch({
  mode,
  setMode,
  text,
  setText,
  parsed,
  setParsed,
  criteria,
  setCriteria,
  onSearch,
  onAddress,
  bias,
  onStart,
  busy,
  setUnderstanding,
}) {
  const { work, setWork, setModules } = usePreferences(),
    { clientId: id } = useFavorites();
  const [recent, setRecent] = useState(() => {
    const v = localRead("propertylens.recentSearches", []);
    return Array.isArray(v)
      ? v.filter((s) => typeof s === "string").slice(0, 5)
      : [];
  });
  const [configured, setConfigured] = useState(false),
    [error, setError] = useState(""),
    [parsing, setParsing] = useState(false);
  const input = useRef(),
    request = useRef(),
    sequence = useRef(0);
  useEffect(() => {
    fetch("/api/search/config")
      .then((r) => r.json())
      .then((v) => setConfigured(v.openaiConfigured === true))
      .catch(() => {});
    return () => request.current?.abort();
  }, []);
  useEffect(() => {
    if (input.current) {
      input.current.style.height = "auto";
      input.current.style.height = `${input.current.scrollHeight}px`;
    }
  }, [text, mode]);
  async function accept(p, originalText = text) {
    setParsed(p);
    if (p.intent === "address") {
      await onAddress({ text: originalText, notApplied: p.notApplied });
      return;
    }
    setCriteria(p.criteria);
    setModules((old) => [...new Set([...old, ...p.extras.insights])]);
    if (p.extras.commute?.work) setWork(p.extras.commute.work);
    if (!p.questions.length) await onSearch(p.criteria, p.extras, originalText);
  }
  async function submit(value = text) {
    if (!value.trim() || busy) return;
    const seq = ++sequence.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setText(value);
    setError("");
    setParsing(true);
    setUnderstanding(true);
    onStart?.();
    const history = [value, ...recent.filter((s) => s !== value)].slice(0, 5);
    setRecent(history);
    localWrite("propertylens.recentSearches", history);
    try {
      const r = await fetch("/api/search/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Id": id },
        body: JSON.stringify({
          text: value,
          savedWork: work?.lat != null ? work : undefined,
        }),
        signal: controller.signal,
      });
      const p = await r.json();
      if (!r.ok)
        throw new Error(
          p.error?.message || "Could not understand that search.",
        );
      if (seq !== sequence.current) return;
      setParsing(false);
      setUnderstanding(false);
      await accept(p, value);
    } catch (e) {
      if (!controller.signal.aborted) setError(e.message);
    } finally {
      if (seq === sequence.current) {
        setParsing(false);
        setUnderstanding(false);
      }
    }
  }
  async function clarify(field, choice) {
    setError("");
    setParsing(true);
    setUnderstanding(true);
    try {
      const r = await fetch("/api/search/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Id": id },
        body: JSON.stringify({
          parsed: { ...parsed, criteria },
          field,
          choice,
        }),
      });
      const p = await r.json();
      if (!r.ok)
        throw new Error(p.error?.message || "Could not resolve this place.");
      setParsing(false);
      setUnderstanding(false);
      await accept(p);
    } catch (e) {
      setError(e.message);
    } finally {
      setParsing(false);
      setUnderstanding(false);
    }
  }
  const chips =
    parsed && parsed.intent !== "address"
      ? interpretationFor(criteria, parsed.extras)
      : [];
  return (
    <section className="describe-search" aria-label="Search homes">
      <div className="search-tabs" role="tablist" aria-label="Search mode">
        {["describe", "filters"].map((key, i) => (
          <button
            key={key}
            id={`tab-${key}`}
            role="tab"
            aria-selected={mode === key}
            aria-controls={`panel-${key}`}
            tabIndex={mode === key ? 0 : -1}
            onKeyDown={(e) => {
              if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
                e.preventDefault();
                const next =
                  e.key === "Home"
                    ? "describe"
                    : e.key === "End"
                      ? "filters"
                      : mode === "describe"
                        ? "filters"
                        : "describe";
                setMode(next);
                document.getElementById(`tab-${next}`)?.focus();
              }
            }}
            onClick={() => setMode(key)}
          >
            {i ? "Use filters" : "Describe it"}
          </button>
        ))}
      </div>
      <div
        id="panel-describe"
        role="tabpanel"
        aria-labelledby="tab-describe"
        hidden={mode !== "describe"}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <AddressCombobox
            embedded
            description
            id="describe-input"
            label="Describe a home or enter its address"
            value={text}
            onChange={setText}
            onSubmit={submit}
            onSelect={(p) => {
              setParsed({
                intent: "address",
                address: { text: p.label },
                notApplied: [],
              });
              onAddress({ selected: p });
            }}
            bias={bias}
            disabled={busy || parsing}
            placeholder="Describe the home you want, or enter an address (e.g. 4 bed house in Los Angeles under $1.5M)"
          />
          <div className="describe-actions">
            <small id="describe-help">
              Enter to search · Shift+Enter for a new line
            </small>
            <small id="describe-count">{text.length}/500</small>
            <button disabled={busy || parsing || !text.trim()}>
              {parsing
                ? "Understanding your search…"
                : busy
                  ? "Searching…"
                  : "Search"}
            </button>
          </div>
          {configured && (
            <p className="small-note">
              Your search text is sent to OpenAI to interpret it.
            </p>
          )}
        </form>
        <div className="describe-examples">
          <p>Try an example</p>
          <div className="chips">
            {EXAMPLES.map((s) => (
              <button
                className="toggle-chip"
                disabled={busy || parsing}
                key={s}
                onClick={() => submit(s)}
              >
                {s}
              </button>
            ))}
          </div>
        </div>
        {recent.length > 0 && (
          <div className="describe-recent">
            <p>
              Recent searches{" "}
              <button
                className="quiet-button"
                onClick={() => {
                  setRecent([]);
                  localWrite("propertylens.recentSearches", []);
                }}
              >
                Clear
              </button>
            </p>
            <div className="chips">
              {recent.map((s) => (
                <button
                  className="toggle-chip"
                  key={s}
                  disabled={busy || parsing}
                  onClick={() => submit(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      <div className="interpretation-slot">
        {!parsed && (
          <div className="interpretation-placeholder">
            <h2>Your search, explained</h2>
            <p>
              Describe a home to see the filters we’ll apply. Review
              assumptions, answer place questions, or fine-tune everything in
              filters.
            </p>
          </div>
        )}
        {parsed?.intent === "address" && (
          <p className="toggle-chip">
            Looking up: {parsed.address.text}
            {parsed.address.verified != null
              ? " · " + (parsed.address.verified ? "verified" : "unverified")
              : ""}
          </p>
        )}
        {parsed?.intent === "address" &&
          parsed.notApplied?.map((p, i) => (
            <p className="small-note" key={i}>
              {p.text}: {p.reason}
            </p>
          ))}
        {parsed && parsed.intent !== "address" && (
          <section
            className="interpretation"
            aria-labelledby="interpretation-title"
          >
            <div className="filter-heading">
              <h2 id="interpretation-title">Here’s how I read that</h2>
              <button
                className="quiet-button"
                onClick={() => setMode("filters")}
              >
                Edit in filters
              </button>
            </div>
            <p className="small-note">
              {parsed.parser === "openai"
                ? "Interpreted by ChatGPT"
                : "Interpreted by built-in rules (add an OpenAI key for smarter parsing)"}
            </p>
            <div className="chips">
              {chips.map((chip) => (
                <button
                  className="toggle-chip"
                  key={chip.key}
                  disabled={busy || parsing}
                  aria-label={`Remove ${chip.label}`}
                  onClick={() => {
                    const c = { ...criteria },
                      extras = { ...parsed.extras };
                    if (chip.key in extras)
                      extras[chip.key] = chip.key === "insights" ? [] : null;
                    else {
                      c[chip.key] = defaults[chip.key] ?? "";
                      if (chip.key === "minBeds" || chip.key === "maxBeds")
                        delete c.exactBeds;
                    }
                    const questions = parsed.questions.filter(
                      (q) =>
                        !(chip.key === "commute" && q.field === "work") &&
                        !(chip.key === "radius" && q.field === "radius"),
                    );
                    if (
                      !c.location &&
                      !questions.some((q) => q.field === "location")
                    )
                      questions.push({
                        field: "location",
                        message: "Which city, state or ZIP should we search?",
                        options: [],
                      });
                    accept({ ...parsed, criteria: c, extras, questions });
                  }}
                >
                  {chip.label}: {chip.value} ×
                </button>
              ))}
            </div>
            {parsed.assumptions.length > 0 && (
              <details open>
                <summary>Assumptions</summary>
                <ul>
                  {parsed.assumptions.map((s, i) => (
                    <li key={i}>{s}</li>
                  ))}
                </ul>
              </details>
            )}
            {parsed.notApplied.length > 0 && (
              <details open className="small-note">
                <summary>Couldn’t apply</summary>
                <ul>
                  {parsed.notApplied.map((s, i) => (
                    <li key={i}>
                      {s.text}: {s.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {parsed.questions.map((q) => (
              <Question
                key={q.field}
                question={q}
                disabled={parsing || busy}
                onChoose={(choice) => clarify(q.field, choice)}
              />
            ))}
          </section>
        )}
      </div>
      <div className="sr-only" role="status" aria-live="polite">
        {parsing
          ? "Understanding your search…"
          : parsed
            ? `Interpreted your search. ${chips.map((c) => `${c.label}: ${c.value}`).join(". ")}. ${(parsed.questions || []).map((q) => q.message).join(" ")}`
            : ""}
      </div>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
function Question({ question, onChoose, disabled }) {
  const [value, setValue] = useState("");
  return (
    <form
      className="clarification"
      onSubmit={(e) => {
        e.preventDefault();
        if (value.trim()) onChoose(value.trim());
      }}
    >
      <label htmlFor={`clarify-${question.field}`}>{question.message}</label>
      <div className="chips">
        {question.options.map((p, i) => (
          <button
            type="button"
            className="toggle-chip"
            key={i}
            disabled={disabled}
            onClick={() => onChoose(p)}
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="clarification-input">
        <input
          id={`clarify-${question.field}`}
          maxLength={150}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="City, ST or full address"
        />
        <button disabled={disabled || !value.trim()}>Use this place</button>
      </div>
    </form>
  );
}
