import DescribeSearch, { localRead, localWrite } from "../components/search/DescribeSearch";
import CommuteResults from '../components/search/CommuteResults';
import "../styles/describe.css";
import { Link, useLocation } from "react-router-dom";
import { readSession, writeSession } from "../lib/planner/listingSnapshot";
import { useFavorites } from "../lib/Favorites";
import React, { useEffect, useRef, useState } from "react";
import Filters, { LABELS } from "../components/search/Filters";
import DetailModal from "../components/search/DetailModal";
import WorkAddress from "../components/search/WorkAddress";
import { ModuleSelector } from "../lib/Preferences";
import { defaults, SORTS } from "../../server/search/criteria";
export default function Home() {
  const location = useLocation();
  const restored = useRef(readSession("propertylens.search")).current;
  const { favorites, toggle, clientId } = useFavorites();
  const [criteria, setCriteria] = useState(
      restored?.criteria || {
        ...defaults,
        location: "Austin, TX",
      },
    ),
    [applied, setApplied] = useState(restored?.applied || null),
    [data, setData] = useState(restored?.data || null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState(restored?.selected || null),
    [sort, setSort] = useState(restored?.sort || "relevance");
  const [mode, updateMode] = useState(restored?.mode || localRead('propertylens.searchMode', 'describe'));
  const [text, setText] = useState(restored?.text || '');
  const [parsed, setParsed] = useState(restored?.parsed || null);
  const [understanding, setUnderstanding] = useState(false);
  const setMode = value => { updateMode(value); localWrite('propertylens.searchMode', value); };
  const request = useRef(null);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    writeSession("propertylens.search", {
      criteria, mode, text, parsed,
      applied,
      data,
      selected,
      sort,
      scroll: window.scrollY,
    });
  }, [criteria, applied, data, selected, sort, mode, text, parsed]);
  useEffect(() => {
    if (restored)
      requestAnimationFrame(() => window.scrollTo(0, restored.scroll || 0));
  }, []);
  async function search(c, extras = parsed?.extras) {
    if (extras?.sort) setSort(extras.sort);
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError("");
    setApplied(c);
    try {
      const r = await fetch(extras ? '/api/search/described' : '/api/search', {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Client-Id": clientId },
        body: JSON.stringify(extras ? { criteria: c, extras } : c),
        signal: controller.signal,
      });
      const j = await r.json().catch(() => {
        throw new Error("Search is temporarily unavailable. Please retry.");
      });
      if (!r.ok) throw new Error(j.error?.message);
      setData(j);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e.message || "Search unavailable");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }
  const rows = [...(data?.listings || [])];
  if (sort !== "relevance") {
    const key =
      {
        newest: "daysOnMarket",
        "price-asc": "price",
        "price-desc": "price",
        lot: "lotSizeSqft",
      }[sort] || sort;
    const val = (p) =>
      sort === "price-per-sqft"
        ? p.price != null && p.sqft > 0
          ? p.price / p.sqft
          : null
        : p[key];
    rows.sort((a, b) =>
      val(a) == null
        ? val(b) == null
          ? 0
          : 1
        : val(b) == null
          ? -1
          : (val(a) - val(b)) *
            (sort === "newest" ||
            sort === "price-asc" ||
            sort === "price-per-sqft"
              ? 1
              : -1),
    );
  }
  return (
    <main id="main" className="container search-page">
      <section className="search-intro">
        <p className="eyebrow">YOUR NEXT CHAPTER STARTS HERE</p>
        <h1>
          Find a home.
          <br />
          <span>See the whole picture.</span>
        </h1>
        <p>Homes from multiple sources. The details that matter to you.</p>
      </section>
      {location.state?.plannerMessage && !restored?.data && (
        <p role="status">
          Your previous search is no longer available. Find a home below or open
          the demo planner.
        </p>
      )}
      <div className="home-entry-cards">
        <Link className="planner-entry" to="/planner">
          <span className="eyebrow">PICTURE YOUR NEXT HOME</span>
          <h2>Try your furniture</h2>
          <p>
            Build an estimated 3D layout. Bring your furniture. See what fits.
          </p>
          <strong>Open the room planner &rarr;</strong>
        </Link>
        <a href="#home-search">
          <span className="eyebrow">EXPLORE THE POSSIBILITIES</span>
          <h2>Find homes</h2>
          <p>Search US listings, compare insights and save your shortlist.</p>
          <strong>Start your search &rarr;</strong>
        </a>
      </div>
      <div id="home-search" />
      <DescribeSearch mode={mode} setMode={setMode} text={text} setText={setText} parsed={parsed} setParsed={setParsed} criteria={criteria} setCriteria={setCriteria} onSearch={search} onStart={() => { request.current?.abort(); setData(null); setApplied(null); setError(''); }} busy={loading} setUnderstanding={setUnderstanding} />
      <div id="panel-filters" role="tabpanel" aria-labelledby="tab-filters" hidden={mode !== 'filters'}>
      <Filters
        value={criteria}
        onChange={setCriteria}
        onSearch={(c) => { setCriteria(c); if (parsed) setParsed({ ...parsed, criteria: c, questions: parsed.questions.filter(q => q.field !== 'location') }); search(c); }}
        onReset={() => {
          request.current?.abort();
          setLoading(false);
          setApplied(null);
          setParsed(null);
          setData(null);
          setError("");
        }}
        busy={loading}
      />
      </div>
      <p className="sr-only" role="status" aria-live="polite">{understanding ? "Understanding your search…" : loading ? "Searching…" : data ? `${data.listings.length} homes found` : ""}</p>
      <ModuleSelector />
      <WorkAddress />
      {applied && !parsed && (
        <div className="chips active-filters" aria-label="Active filters">
          {Object.entries(applied)
            .filter(
              ([k, v]) =>
                !["sources", "limit"].includes(k) &&
                v !== "" &&
                v !== false &&
                !(Array.isArray(v) && !v.length),
            )
            .map(([k, v]) => (
              <button
                className="toggle-chip"
                key={k}
                onClick={() => {
                  const next = {
                    ...criteria,
                    [k]: defaults[k] ?? (Array.isArray(v) ? [] : ""),
                  };
                  setCriteria(next);
                  if (k !== "location") search(next);
                }}
                aria-label={"Remove " + (LABELS[k] || k)}
              >
                {LABELS[k] || k}:{" "}
                {Array.isArray(v) ? v.join(", ") : v === true ? "Yes" : v} ×
              </button>
            ))}
        </div>
      )}
      {loading || understanding ? (
        <div className="listing-grid" role="status" aria-label="Finding homes">
          {[1, 2, 3].map((n) => (
            <div className="listing-skeleton" key={n} />
          ))}
        </div>
      ) : error ? (
        <div className="empty-state" role="alert">
          <p>{error}</p>
          <button onClick={() => search(applied || criteria)}>
            Retry search
          </button>
        </div>
      ) : data ? (
        <>
          <div className="results-toolbar">
            <h2>{rows.length} homes to explore</h2>
            <label>
              Sort{" "}
              <select value={sort} onChange={(e) => setSort(e.target.value)}>
                {SORTS.map((s) => (
                  <option value={s} key={s}>
                    {s.replaceAll("-", " ")}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {data.usingFixtures && (
            <p>
              <span className="sample-badge">Sample data</span> Saved Austin
              properties, independent of the location entered.
            </p>
          )}
          <div className="source-statuses">
            {Object.entries(data.sourceCounts).map(([s, n]) => (
              <span key={s}>
                {s}:{" "}
                {data.sourceErrors[s] ? (
                  <>
                    failed{" "}
                    <button
                      className="quiet-button"
                      onClick={() => search(applied)}
                    >
                      Retry
                    </button>
                  </>
                ) : (
                  n + " homes"
                )}
              </span>
            ))}
          </div>
          {data.notes.map((n) => (
            <p className="small-note" key={n}>
              {n}
            </p>
          ))}
          {Object.entries(data.notApplied).map(
            ([s, keys]) =>
              keys.length > 0 && (
                <p className="small-note" key={s}>
                  {keys.map((k) => LABELS[k] || k).join(", ")} not applied to{" "}
                  {s} results.
                </p>
              ),
          )}
          <CommuteResults
            key={data.commute?.token || 'standard'}
            data={data}
            clientId={clientId}
            onUpdate={next => setData(old => old.commute?.token === next.commute?.token ? { ...old, ...next } : old)}
            listings={rows}
            onOpen={setSelected}
            favorites={favorites}
            onFavorite={toggle}
          />
          {!rows.length && (
            <div className="empty-state">
              No homes match, try widening your filters
            </div>
          )}
        </>
      ) : (
        <div className="empty-state">
          Set your criteria above to discover homes.
        </div>
      )}
      {selected && (
        <DetailModal
          listing={selected}
          onClose={() => setSelected(null)}
          saved={favorites.some((p) => p.id === selected.id)}
          onFavorite={toggle}
        ></DetailModal>
      )}
      <section id="how-it-works" className="search-how">
        <h2>A clearer way to compare.</h2>
        <div className="steps">
          <article>
            <h3>01 Set your criteria</h3>
            <p>
              Choose a location, home features and the insights you care about.
            </p>
          </article>
          <article>
            <h3>02 Explore together</h3>
            <p>
              Compare Zillow and Redfin results, with duplicate homes merged.
            </p>
          </article>
          <article>
            <h3>03 Look a little closer</h3>
            <p>Open a home, review your insights and save your favorites.</p>
          </article>
        </div>
      </section>
    </main>
  );
}
