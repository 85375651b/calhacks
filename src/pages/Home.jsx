import React from "react";
import SearchBar from "../components/SearchBar";
export default function Home() {
  return (
    <main id="main">
      <section className="hero container">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="status-dot" /> A LITTLE CLARITY. A BIG DECISION.
          </p>
          <h1>
            See the property.
            <br />
            <span>Understand the price.</span>
          </h1>
          <p className="hero-subhead">
            Property facts, a price range, and the sources behind it.
            <br className="desktop-break" /> A clearer starting point for your
            next move.
          </p>
          <SearchBar />
          <div className="hero-assurances">
            <span>✓ Facts in one place</span>
            <span>✓ Sources in plain sight</span>
          </div>
        </div>
        <div
          className="hero-art"
          role="img"
          aria-label="Architectural illustration of a home with a sample property overview"
        >
          <div className="art-grid" />
          <span className="art-caption">A NEW PERSPECTIVE ON PROPERTY</span>
          <svg className="house" viewBox="0 0 460 410" aria-hidden="true">
            <ellipse cx="230" cy="361" rx="190" ry="30" fill="#ccd9d0" />
            <path d="M86 184v119l144 76V269Z" fill="#f4eee2" />
            <path d="M230 269v110l145-78V184Z" fill="#d9d2c3" />
            <path d="m63 186 159-119 176 115-168 90Z" fill="#245c51" />
            <path d="m63 186 159-119 8 205Z" fill="#367969" />
            <path d="m230 272 168-90v12l-168 91L63 199v-13Z" fill="#173f38" />
            <path d="m112 237 40 21v46l-40-21Z" fill="#87b2a7" />
            <path d="m119 246 26 14v32l-26-14Z" fill="#c8dfd4" />
            <path d="m171 271 35 18v78l-35-19Z" fill="#a99c82" />
            <path
              d="m261 280 35-19v41l-35 19Zm48-26 35-19v41l-35 19Z"
              fill="#749e94"
            />
            <path d="m278 271v40m48-66v40" stroke="#d9d2c3" strokeWidth="4" />
            <path d="M310 125V76l28 14v54" fill="#c3b79f" />
            <path d="m310 76 16-8 28 14-16 8Z" fill="#e9dfce" />
            <path d="M66 330v-49m333 53v-67" stroke="#8c977d" strokeWidth="8" />
            <ellipse cx="66" cy="270" rx="26" ry="39" fill="#7b9c81" />
            <ellipse cx="399" cy="252" rx="28" ry="46" fill="#688b72" />
          </svg>
          <div className="art-card">
            <span className="mini-home" aria-hidden="true">
              ⌂
            </span>
            <div>
              <strong>A home. The whole picture.</strong>
              <p>Facts + estimates + sources</p>
            </div>
            <span className="art-check" aria-hidden="true">
              ✓
            </span>
          </div>
          <span className="art-footnote">
            ILLUSTRATION · NOT A REAL PROPERTY
          </span>
        </div>
      </section>
      <section className="how-section" id="how-it-works">
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">FROM ADDRESS TO UNDERSTANDING</p>
              <h2>A little less guesswork.</h2>
            </div>
            <p>One search. A more informed starting point.</p>
          </div>
          <div className="steps">
            <article>
              <span className="step-number">01</span>
              <h3>Enter an address</h3>
              <p>
                Start with a US home you’re curious about. Your place, your next
                place, or just a possibility.
              </p>
            </article>
            <article>
              <span className="step-number">02</span>
              <h3>We gather the details</h3>
              <p>
                Public records and market data will bring the property into
                focus. For now, explore clearly labeled sample data.
              </p>
            </article>
            <article>
              <span className="step-number">03</span>
              <h3>See the bigger picture</h3>
              <p>
                Review property facts and an estimated range, with sources
                alongside the numbers.
              </p>
            </article>
          </div>
        </div>
      </section>
    </main>
  );
}
