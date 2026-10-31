import React, { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import PageShell from "../components/layout/PageShell";
import { Alert, Badge, Card, DataState, ErrorState, Kpi, LoadingBlock } from "../components/ui";
import { AXIS_STYLE, ChartFrame, ChartTip, GRID_STROKE, Legend } from "../components/charts/ChartParts";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { useBorrower } from "../state/BorrowerContext";
import { BORROWER_PRESETS, FEATURE_LABELS, buildBorrowerPayload } from "../lib/schema";
import { fmtNum, fmtPct, fmtSigned } from "../lib/format";

const RUST = "#bd4b2a";
const GREEN = "#4f8a5b";
const sigmoid = (z) => 1 / (1 + Math.exp(-z));

const label = (f) => FEATURE_LABELS[f] || f;

/** Build the /api/explain body for a portfolio loan row (fields come straight from /api/portfolio). */
function payloadFromLoan(l) {
  return buildBorrowerPayload({
    loan_amnt: l.loan_amnt,
    annual_inc: l.annual_inc,
    dti: l.dti,
    fico_score: l.fico_score,
    int_rate: l.int_rate,
    emp_length: l.emp_length,
    home_ownership: l.home_ownership,
    purpose: l.purpose,
    term: l.term,
    unemployment_rate: l.unemployment_rate,
    fed_funds_rate: l.fed_funds_rate,
    inflation_rate: l.inflation_rate,
  });
}

function LocalChart({ rows }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => Math.abs(b.shap_value) - Math.abs(a.shap_value)), [rows]);
  const max = Math.max(0.05, ...sorted.map((r) => Math.abs(r.shap_value)));
  const bound = Math.ceil(max * 10) / 10 + 0.1;
  const data = sorted.map((r) => ({ ...r, name: label(r.feature), value: r.shap_value }));
  return (
    <>
      <Legend
        items={[
          { label: "Increases default risk", color: RUST },
          { label: "Reduces default risk", color: GREEN },
        ]}
      />
      <ChartFrame
        height={Math.max(300, data.length * 34 + 50)}
        summary={`Local SHAP values for ${data.length} features. Largest: ${data[0]?.name} ${fmtSigned(data[0]?.value, 3)}`}
      >
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 22, left: 4 }}>
            <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
            <XAxis
              type="number"
              domain={[-bound, bound]}
              tick={AXIS_STYLE}
              tickFormatter={(v) => v.toFixed(1)}
              label={{ value: "SHAP value (change in log-odds of default)", position: "insideBottom", offset: -12, style: AXIS_STYLE }}
            />
            <YAxis type="category" dataKey="name" width={132} tick={AXIS_STYLE} interval={0} />
            <ReferenceLine x={0} stroke="#47443d" />
            <Tooltip
              cursor={{ fill: "rgba(24,23,22,0.05)" }}
              content={
                <ChartTip
                  title={(l, p) => `${l} = ${p[0]?.payload.feature_value}`}
                  format={(v) => fmtSigned(v, 4)}
                />
              }
            />
            <Bar dataKey="value" name="SHAP" radius={3} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.feature} fill={d.value >= 0 ? RUST : GREEN} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
    </>
  );
}

function GlobalChart({ rows }) {
  const data = rows.map((r) => ({ ...r, name: label(r.feature) })).sort((a, b) => b.importance_pct - a.importance_pct);
  return (
    <>
      <Legend
        items={[
          { label: "Borrower feature", color: "#1f1d1a" },
          { label: "Macroeconomic feature", color: "#6f8aa6" },
        ]}
      />
      <ChartFrame height={Math.max(300, data.length * 30 + 40)} summary={`Global feature importance. Top: ${data[0]?.name} ${data[0]?.importance_pct}%`}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, bottom: 22, left: 4 }}>
            <CartesianGrid stroke={GRID_STROKE} horizontal={false} />
            <XAxis type="number" tick={AXIS_STYLE} tickFormatter={(v) => `${v}%`} label={{ value: "Share of mean |SHAP| (%)", position: "insideBottom", offset: -12, style: AXIS_STYLE }} />
            <YAxis type="category" dataKey="name" width={132} tick={AXIS_STYLE} interval={0} />
            <Tooltip cursor={{ fill: "rgba(24,23,22,0.05)" }} content={<ChartTip format={(v, e) => `${v}% (mean |SHAP| ${e.payload.mean_abs_shap})`} />} />
            <Bar dataKey="importance_pct" name="Importance" radius={3} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.feature} fill={d.category === "Macroeconomic" ? "#6f8aa6" : "#1f1d1a"} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartFrame>
    </>
  );
}

function Body({ data }) {
  const local = data.local_shap;
  const pred = data.prediction;
  const base = data.base_value_log_odds;
  const sum = local.reduce((a, r) => a + r.shap_value, 0);
  const rebuilt = sigmoid(base + sum);
  const matches = Math.abs(rebuilt - pred.pd) < 0.0006;
  const macro = local.filter((r) => r.category !== "Borrower");
  const macroZero = macro.length > 0 && macro.every((r) => r.shap_value === 0);
  const up = [...local].filter((r) => r.shap_value > 0).sort((a, b) => b.shap_value - a.shap_value).slice(0, 3);
  const down = [...local].filter((r) => r.shap_value < 0).sort((a, b) => a.shap_value - b.shap_value).slice(0, 3);
  const cat = data.category_summary;

  const line = (r) => `${label(r.feature)} (${r.feature_value}, ${fmtSigned(r.shap_value, 3)})`;

  return (
    <>
      <div className="grid cols-4">
        <Kpi label="Predicted PD" value={fmtPct(pred.pd_pct)} sub={`Grade ${pred.risk_grade} · threshold ${pred.threshold}`} tone="rust" />
        <Kpi label="Base value" value={fmtNum(base, 3)} sub="Average model output (log-odds)" />
        <Kpi label="Σ SHAP" value={fmtSigned(sum, 3)} sub="Sum of feature contributions" tone="slate" />
        <Kpi
          label="sigmoid(base + Σ SHAP)"
          value={fmtPct(rebuilt * 100)}
          sub={matches ? "Matches the reported PD" : `Reported PD ${fmtPct(pred.pd_pct)}`}
          tone={matches ? "green" : "amber"}
        />
      </div>

      <div className="grid split-6040">
        <Card title="Feature contributions (TreeExplainer SHAP)" sub="POST /api/explain · local">
          <LocalChart rows={local} />
        </Card>

        <div className="stack" style={{ alignContent: "start" }}>
          <Card title="Key takeaways">
            <div className="stack" style={{ fontSize: 14.5 }}>
              {up.length > 0 && (
                <p>
                  <Badge tone="rust">Pushes risk up</Badge>{" "}
                  <span style={{ marginLeft: 6 }}>{up.map(line).join(" · ")}</span>
                </p>
              )}
              {down.length > 0 && (
                <p>
                  <Badge tone="green">Pulls risk down</Badge>{" "}
                  <span style={{ marginLeft: 6 }}>{down.map(line).join(" · ")}</span>
                </p>
              )}
              <p className="muted">
                Contributions add up to the model output in log-odds: base {fmtNum(base, 3)} {sum >= 0 ? "+" : "−"}{" "}
                {Math.abs(sum).toFixed(3)} = {fmtNum(base + sum, 3)}, i.e. a PD of {fmtPct(rebuilt * 100)}.
              </p>
            </div>
          </Card>
          <Card title="Explainability scope">
            <p style={{ fontSize: 14.5, color: "var(--ink-2)" }}>{data.disclaimer}</p>
          </Card>
        </div>
      </div>

      {macro.length > 0 && (
        <Alert tone="info" title="How macroeconomic features appear here.">
          {macroZero
            ? "Their SHAP contribution is 0 for this input: the engine adds a fixed sensitivity overlay (0.085 × Δunemployment + 0.045 × Δfed funds + 0.035 × Δinflation versus the baseline scenario) and the tree model itself saw no macro variation in training. Change the macro inputs on the Prediction page to see the overlay move."
            : "Their contribution combines the tree model's SHAP value with the engine's fixed sensitivity overlay (0.085 × Δunemployment + 0.045 × Δfed funds + 0.035 × Δinflation versus the baseline scenario). The overlay is an analyst assumption, not a coefficient learned from data."}
        </Alert>
      )}

      <div className="grid split-6040">
        <Card title="Global feature importance" sub="Mean |SHAP| over the training sample">
          <GlobalChart rows={data.global_shap} />
        </Card>
        <Card title="Borrower vs. macro share">
          <div className="stack">
            <Kpi label="Borrower features" value={fmtPct(cat.borrower_importance_pct, 1)} sub="Share of total importance" />
            <Kpi label="Macroeconomic features" value={fmtPct(cat.macroeconomic_importance_pct, 1)} sub="Share of total importance" tone="slate" />
          </div>
        </Card>
      </div>
    </>
  );
}

export default function Shap() {
  const { inputs } = useBorrower();
  const [choice, setChoice] = useState("active");
  const portfolio = useApi((signal) => api.portfolio("ALL", { signal }), []);
  const loans = portfolio.data?.loans || [];

  const payload = useMemo(() => {
    if (choice === "active") return buildBorrowerPayload(inputs);
    if (choice.startsWith("preset:")) {
      const p = BORROWER_PRESETS.find((x) => x.key === choice.slice(7));
      return p ? buildBorrowerPayload(p.values) : buildBorrowerPayload(inputs);
    }
    const loan = loans.find((l) => l.loan_id === choice.slice(5));
    return loan ? payloadFromLoan(loan) : buildBorrowerPayload(inputs);
  }, [choice, inputs, loans]);

  const state = useApi((signal) => api.explain(payload, { signal }), [JSON.stringify(payload)]);

  return (
    <PageShell
      title="SHAP Explainability"
      description="See which features push this borrower's default risk up or down. SHAP values are computed by TreeExplainer on the trained model and are shown exactly as the backend returns them."
      note="Explainable AI for transparent decisions."
    >
      <Card className="mb" flat>
        <div className="toolbar">
          <label htmlFor="scenario">Explain:</label>
          <select id="scenario" value={choice} onChange={(e) => setChoice(e.target.value)}>
            <option value="active">Active borrower (from the Prediction page)</option>
            <optgroup label="Preset borrowers">
              {BORROWER_PRESETS.map((p) => (
                <option key={p.key} value={`preset:${p.key}`}>
                  {p.label}
                </option>
              ))}
            </optgroup>
            {loans.length > 0 && (
              <optgroup label="Held-out portfolio loans (GET /api/portfolio)">
                {loans.slice(0, 100).map((l) => (
                  <option key={l.loan_id} value={`loan:${l.loan_id}`}>
                    {l.loan_id} · {l.purpose} · ${Number(l.loan_amnt).toLocaleString()} · PD {(l.pd * 100).toFixed(1)}%
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          {portfolio.error && <Badge tone="amber">Portfolio loans unavailable</Badge>}
        </div>
      </Card>
      <DataState state={state} onRetry={state.reload} skeleton={<LoadingBlock rows={2} />}>
        {(data) => <Body data={data} />}
      </DataState>
    </PageShell>
  );
}
