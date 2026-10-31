import React, { useEffect, useRef, useState } from "react";
import { PAGES } from "../../hooks/useHashRoute";
import { API_BASE, api } from "../../api/client";
import { useApi } from "../../hooks/useApi";

function HealthButton() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { data, error, loading, reload } = useApi((signal) => api.health({ signal }), []);

  useEffect(() => {
    if (!open) return undefined;
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // /health from the gateway: { gateway, ml_service: { status, artifacts_loaded } }
  // /health from FastAPI directly: { status, artifacts_loaded }
  const ml = data?.ml_service ?? data;
  const ok = !!data && !error && ml?.status === "ok";
  const state = loading && !data ? "checking" : ok ? "ok" : "down";
  const label = state === "ok" ? "Backend online" : state === "checking" ? "Checking backend…" : "Backend unreachable";

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        type="button"
        className="status-btn"
        data-state={state}
        aria-label={`${label}. Show details`}
        aria-expanded={open}
        onClick={() => {
          setOpen((o) => !o);
          if (!open) reload();
        }}
      >
        <span className="dot" />
      </button>
      {open && (
        <div className="status-pop" role="dialog" aria-label="Backend status">
          <strong>{label}</strong>
          <dl>
            <dt>API base</dt>
            <dd className="mono" style={{ fontSize: 12 }}>
              {API_BASE}
            </dd>
            {data?.gateway && (
              <>
                <dt>Gateway</dt>
                <dd>{data.gateway}</dd>
              </>
            )}
            {ml && (
              <>
                <dt>ML service</dt>
                <dd>{ml.status}</dd>
                <dt>Model bundle</dt>
                <dd>{ml.artifacts_loaded ? "loaded" : "not trained"}</dd>
              </>
            )}
          </dl>
          {error && <p style={{ marginTop: 8, color: "var(--rust)", fontWeight: 600 }}>{error.message}</p>}
          {error?.hint && <p style={{ marginTop: 6 }}>{error.hint}</p>}
        </div>
      )}
    </div>
  );
}

export default function TopNav({ page }) {
  return (
    <header className="topnav">
      <div className="topnav-inner">
        <a className="brand-tag" href="#/dashboard/overview" aria-label="CreditWise dashboard">
          CreditWise
        </a>
        <nav className="pill-nav" aria-label="Dashboard pages">
          {PAGES.map((p) => (
            <a
              key={p.id}
              className="pill"
              href={`#/dashboard/${p.id}`}
              aria-current={page === p.id ? "page" : undefined}
            >
              {p.label}
            </a>
          ))}
        </nav>
        <div className="nav-actions">
          <a className="btn-home" href="#/">
            <span aria-hidden="true">←</span> Home
          </a>
          <HealthButton />
        </div>
      </div>
    </header>
  );
}
