import React from "react";
import PageShell from "../components/layout/PageShell";
import { Alert, Badge, Card, DataState, Kpi, SimpleTable } from "../components/ui";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { fmtFracPct, fmtInt, fmtStamp, humanize } from "../lib/format";
import { FEATURE_LABELS } from "../lib/schema";

const FLOW = [
  { title: "Data Sources", items: ["LendingClub (loans)", "FRED (economic)"] },
  { title: "Preprocessing", items: ["Cleaning & imputation", "Feature engineering", "Time alignment"] },
  { title: "ML Models", items: ["PD classification", "SHAP explainability"] },
  { title: "Outputs", items: ["PD score & grade", "Expected credit loss", "Stress testing"] },
];

function Flow() {
  return (
    <div className="flow">
      {FLOW.map((s, i) => (
        <div key={s.title}>
          <div className="flow-step">
            <h3>{s.title}</h3>
            <ul>
              {s.items.map((it) => (
                <li key={it}>{it}</li>
              ))}
            </ul>
          </div>
          {i < FLOW.length - 1 && (
            <span className="flow-arrow" aria-hidden="true">
              →
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function OverviewBody({ data }) {
  const s = data.dataset_stats;
  const splits = s.splits || {};
  const catalog = data.features?.catalog || [];
  const singleMonth = s.date_min && s.date_min === s.date_max;
  const macroFlat = ["unemployment_rate", "fed_funds_rate", "inflation_rate"].every((k) => {
    const b = data.feature_bounds?.[k];
    return b && b.min === b.max;
  });

  const splitRows = [
    { key: "train", name: "Train", share: "70%", ...splits.train },
    { key: "validation", name: "Validation", share: "15%", ...splits.validation },
    { key: "test", name: "Test (held-out)", share: "15%", ...splits.test },
  ];

  return (
    <>
      {!data.artifacts_loaded && (
        <Alert tone="warn" title="Model not trained yet.">
          <code>saved_models/artifacts.joblib</code> does not exist, so the service is using its parametric fallback.
          Run <code>python train_pipeline.py</code> in <code>ml_service/</code>.
        </Alert>
      )}
      {singleMonth && (
        <Alert tone="info" title="Training data covers a single origination month.">
          All {fmtInt(s.total_rows)} loans were issued in {s.date_min}, so the chronological split below does not span
          different time periods{macroFlat ? " and the macro features have no variation in training" : ""}. This is a
          property of the supplied sample data, reported as-is by the backend.
        </Alert>
      )}

      <h2 className="section-label">Key components</h2>
      <Card className="mb" flat>
        <Flow />
      </Card>

      <div className="grid cols-2">
        <Card title="System status" sub="from GET /health + /api/overview">
          <div className="status-list">
            <div className="status-row">
              <span>FastAPI ML service</span>
              <Badge tone="green">Online</Badge>
            </div>
            <div className="status-row">
              <span>Model bundle (artifacts.joblib)</span>
              <Badge tone={data.artifacts_loaded ? "green" : "amber"}>
                {data.artifacts_loaded ? "Loaded" : "Not trained"}
              </Badge>
            </div>
            <div className="status-row">
              <span>Trained</span>
              <span className="mono" style={{ fontSize: 13 }}>
                {fmtStamp(data.trained_timestamp)}
              </span>
            </div>
            <div className="status-row">
              <span>Active borrower-only model</span>
              <strong>{data.active_borrower_model}</strong>
            </div>
          </div>
        </Card>

        <Card title="Model & training artifacts" sub={data.artifacts_loaded ? "Trained bundle" : "Fallback values"}>
          <div className="grid cols-2" style={{ marginBottom: 0 }}>
            <Kpi label="Dataset sample size" value={fmtInt(s.total_rows)} sub="Resolved loans" />
            <Kpi label="Historical default rate" value={fmtFracPct(s.default_rate)} sub={s.source_name} tone="rust" />
            <Kpi label="Active combined model" value={data.active_combined_model} sub={`Threshold: ${data.optimal_threshold}`} tone="green" text />
            <Kpi
              label="Macro features"
              value={macroFlat ? "Constant in training" : "Varying"}
              sub={macroFlat ? "Overlay applied at inference" : "Learned from data"}
              tone="slate"
              text
            />
          </div>
        </Card>
      </div>

      <div className="grid split-6040">
        <Card title="Chronological train / validation / test split" sub="No random shuffling">
          <SimpleTable
            caption="Dataset splits"
            rowKey={(r) => r.key}
            columns={[
              { key: "name", header: "Partition", strong: true },
              { key: "share", header: "Share" },
              { key: "rows", header: "Loans", num: true, render: (r) => fmtInt(r.rows) },
              { key: "period", header: "Period", render: (r) => `${r.date_start} → ${r.date_end}` },
              { key: "dr", header: "Default rate", num: true, render: (r) => fmtFracPct(r.default_rate) },
            ]}
            rows={splitRows}
          />
        </Card>

        <Card title="Methodology">
          <div className="stack" style={{ fontSize: 14.5, color: "var(--ink-2)" }}>
            <div>
              <strong style={{ color: "var(--ink)" }}>Leakage prevention. </strong>
              {data.methodology.leakage_prevention}
            </div>
            <div>
              <strong style={{ color: "var(--ink)" }}>Time-aware splitting. </strong>
              {data.methodology.chronological_splitting}
            </div>
            <div>
              <strong style={{ color: "var(--ink)" }}>ECL. </strong>
              <code>{data.methodology.ecl_formula}</code>
            </div>
            <div>
              <strong style={{ color: "var(--ink)" }}>Explainability scope. </strong>
              {data.methodology.shap_disclaimer}
            </div>
          </div>
        </Card>
      </div>

      <Card title="Feature dictionary & training bounds" sub={`${catalog.length} features`} className="mb">
        <SimpleTable
          caption="Feature dictionary"
          rowKey={(r) => r.name}
          columns={[
            {
              key: "name",
              header: "Feature",
              render: (r) => (
                <>
                  <strong>{FEATURE_LABELS[r.name] || humanize(r.name)}</strong>{" "}
                  <code>{r.name}</code>
                </>
              ),
            },
            {
              key: "category",
              header: "Category",
              render: (r) => (
                <Badge tone={r.category.includes("Macro") ? "slate" : "default"}>{r.category}</Badge>
              ),
            },
            { key: "type", header: "Type" },
            { key: "min", header: "Train min", num: true, render: (r) => r.bounds?.min ?? "—" },
            { key: "median", header: "Median", num: true, render: (r) => r.bounds?.median ?? "—" },
            { key: "max", header: "Train max", num: true, render: (r) => r.bounds?.max ?? "—" },
          ]}
          rows={catalog}
        />
      </Card>

      <Card title="Risk grade bands" sub="PD → grade mapping from config.py">
        <SimpleTable
          caption="Risk bands"
          rowKey={(r) => r.grade}
          columns={[
            { key: "grade", header: "Grade", strong: true },
            { key: "label", header: "Tier" },
            { key: "min", header: "PD from", num: true, render: (r) => fmtFracPct(r.min_pd, 0) },
            { key: "max", header: "PD to", num: true, render: (r) => fmtFracPct(r.max_pd, 0) },
          ]}
          rows={data.risk_bands}
        />
      </Card>
    </>
  );
}

export default function Overview() {
  const state = useApi((signal) => api.getOverview({ signal }), []);
  return (
    <PageShell
      title="System Overview"
      description="CreditWise is a machine-learning credit risk assessment system that combines borrower information with macroeconomic conditions to predict default risk, explain predictions and evaluate potential credit losses under economic scenarios."
      note="Better data. Deeper insights. Smarter decisions."
    >
      <DataState state={state} onRetry={state.reload}>
        {(data) => <OverviewBody data={data} />}
      </DataState>
    </PageShell>
  );
}
