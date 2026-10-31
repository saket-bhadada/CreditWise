import React, { useCallback, useEffect, useMemo, useState } from "react";
import AssemblyStage from "../components/art/AssemblyStage";
import { usePrefersReducedMotion } from "../components/art/useAsset";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { fmtFracPct, fmtInt } from "../lib/format";
import { tornPolygon, tornTopPolygon } from "../lib/torn";

const ASSEMBLY_MS = 3500;

function LiveFacts() {
  const state = useApi((signal) => api.getOverview({ signal }), []);
  const { data, error, loading } = state;

  if (loading && !data) {
    return (
      <div className="facts" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="fact skeleton" style={{ height: 118 }} />
        ))}
      </div>
    );
  }
  if (error && !data) {
    return (
      <p className="facts-offline" role="status">
        Live model metrics are unavailable right now ({error.message}) — start the backend to see them here.{" "}
        <button type="button" className="link-btn" onClick={state.reload}>
          Retry
        </button>
      </p>
    );
  }
  const s = data.dataset_stats;
  return (
    <div className="facts">
      <div className="fact">
        <span className="fact-label">Resolved loans in training sample</span>
        <strong>{fmtInt(s.total_rows)}</strong>
        <span className="fact-sub">{s.source_name}</span>
      </div>
      <div className="fact">
        <span className="fact-label">Historical default rate</span>
        <strong>{fmtFracPct(s.default_rate)}</strong>
        <span className="fact-sub">
          {s.date_min} to {s.date_max}
        </span>
      </div>
      <div className="fact">
        <span className="fact-label">Active combined model</span>
        <strong>{data.active_combined_model}</strong>
        <span className="fact-sub">Decision threshold {data.optimal_threshold}</span>
      </div>
    </div>
  );
}

export default function Home() {
  const reduced = usePrefersReducedMotion();
  const [runId, setRunId] = useState(0);
  const [assembled, setAssembled] = useState(reduced);

  const replay = useCallback(() => {
    setAssembled(false);
    setRunId((n) => n + 1);
  }, []);

  useEffect(() => {
    if (reduced) {
      setAssembled(true);
      return undefined;
    }
    const t = setTimeout(() => setAssembled(true), ASSEMBLY_MS);
    return () => clearTimeout(t);
  }, [runId, reduced]);

  const paperClip = useMemo(() => tornPolygon(7, { ampX: 1.1, ampY: 3.4, step: 4 }), []);
  const stripClipA = useMemo(() => tornPolygon(21, { ampX: 1.2, ampY: 7, step: 6 }), []);
  const stripClipB = useMemo(() => tornPolygon(34, { ampX: 1.2, ampY: 7, step: 6 }), []);
  const artClip = useMemo(() => tornPolygon(41, { ampX: 1.4, ampY: 2.2, step: 5 }), []);
  const aboutClip = useMemo(() => tornTopPolygon(5, { amp: 15 }), []);

  return (
    <div className="home">
      <a className="skip-link" href="#hero-main">
        Skip to content
      </a>
      <header className="home-nav">
        <a className="brand-tag" href="#/" aria-label="CreditWise home">
          CreditWise
        </a>
        <nav aria-label="Primary">
          <a href="#/" aria-current="page">
            Home
          </a>
          <a
            href="#about"
            onClick={(e) => {
              e.preventDefault();
              document.getElementById("about")?.scrollIntoView({ behavior: reduced ? "auto" : "smooth" });
            }}
          >
            About
          </a>
          <a href="#/dashboard/overview">Dashboard</a>
        </nav>
      </header>

      <main id="hero-main">
        <section className="hero">
          <div className="hero-copy">
            <h1 className="wordmark-wrap">
              <span className="wordmark-paper" style={{ clipPath: paperClip }}>
                <span className="wordmark">CreditWise</span>
              </span>
              <svg className="swoosh swoosh-top" viewBox="0 0 520 80" aria-hidden="true" focusable="false">
                <path d="M6,66 C110,14 380,-8 514,34" pathLength="1" />
              </svg>
              <svg className="swoosh swoosh-low" viewBox="0 0 520 40" aria-hidden="true" focusable="false">
                <path d="M24,10 C170,34 340,34 478,14" pathLength="1" />
              </svg>
            </h1>

            <p className="strips">
              <span className="strip s1" style={{ clipPath: stripClipA }}>
                Smarter Credit Decisions.
              </span>
              <span className="strip s2" style={{ clipPath: stripClipB }}>
                A Stronger Tomorrow.
              </span>
            </p>

            <div className="cta-row">
              <a className="btn-distress" href="#/dashboard/overview">
                <span>Explore Dashboard</span>
                <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false">
                  <path d="M4 12h15M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
              <button type="button" className="replay" onClick={replay}>
                <span aria-hidden="true">↻</span> Replay assembly
              </button>
            </div>

            <p className="hero-note">Quantitative risk models · Basel II / CECL ECL · Real SHAP attributions</p>
          </div>

          <div className="hero-art" style={{ "--art-clip": artClip }}>
            <AssemblyStage runId={runId} onReplay={replay} />
            <p className="sr-only" aria-live="polite">
              {assembled ? "Coin assembled. Activate the coin or the Replay button to run the animation again." : "Assembling the coin…"}
            </p>
          </div>
        </section>

        <section id="about" className="about" aria-labelledby="about-title" style={{ clipPath: aboutClip }}>
          <div className="about-text">
            <h2 id="about-title">About CreditWise</h2>
            <p>
              An end-to-end credit risk decision-support system. It predicts a borrower&rsquo;s probability of default,
              explains each prediction with SHAP attributions, calculates Expected Credit Loss (
              <code>ECL = PD × LGD × EAD</code>), and runs macroeconomic stress tests with out-of-distribution
              warnings.
            </p>
            <a className="btn-distress small" href="#/dashboard/overview">
              <span>Open the dashboard</span>
            </a>
          </div>
          <LiveFacts />
        </section>
      </main>
    </div>
  );
}
