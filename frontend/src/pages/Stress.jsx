import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import PageShell from "../components/layout/PageShell";
import { Alert, Badge, Card, EmptyState, ErrorState, Kpi, LoadingBlock, SimpleTable } from "../components/ui";
import { AXIS_STYLE, ChartFrame, ChartTip, GRID_STROKE, Legend } from "../components/charts/ChartParts";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { useBorrower } from "../state/BorrowerContext";
import { buildBorrowerPayload, FEATURE_LABELS, PURPOSE_LABELS, validateBorrower } from "../lib/schema";
import { fmtInt, fmtMoney, fmtMoneyCompact, fmtPct, fmtSigned, fmtSignedMoney } from "../lib/format";

const SLIDERS = [
  { key: "unemployment_rate", label: "Unemployment rate", unit: "%", min: 3, max: 15, step: 0.1 },
  { key: "fed_funds_rate", label: "Federal funds rate", unit: "%", min: 0, max: 9, step: 0.05 },
  { key: "inflation_rate", label: "CPI inflation (YoY)", unit: "%", min: -1, max: 12, step: 0.1 },
];
const SCENARIO_ORDER = ["baseline", "downturn", "severe"];

function MacroLines({ values }) {
  return (
    <>
      <div className="macro-line">
        <span>Unemployment:</span> <strong>{values.unemployment_rate.toFixed(1)}%</strong>
      </div>
      <div className="macro-line">
        <span>Fed Funds:</span> <strong>{values.fed_funds_rate.toFixed(1)}%</strong>
      </div>
      <div className="macro-line">
        <span>CPI Inflation:</span> <strong>{values.inflation_rate.toFixed(1)}%</strong>
      </div>
    </>
  );
}

function ResultBody({ res }) {
  const imp = res.portfolio_impact;
  const segs = useMemo(() => [...res.segment_comparison].sort((a, b) => b.stressed_ecl - a.stressed_ecl), [res]);
  const ood = res.out_of_range_warnings || [];
  const bc = res.borrower_comparison;
  const shifts = (bc?.shap_shifts || []).filter((s) => Math.abs(s.shap_delta) > 0);
  const segData = segs.map((s) => ({ ...s, label: PURPOSE_LABELS[s.purpose] || s.purpose }));
  const shock = imp.delta_ecl;

  return (
    <>
      {ood.length > 0 && (
        <Alert tone="warn" title={`Out-of-distribution alert (${ood.length} macro variable${ood.length > 1 ? "s" : ""}).`}>
          <ul>
            {ood.map((w) => (
              <li key={w.feature}>
                <strong>{FEATURE_LABELS[w.feature] || w.feature}</strong> = {w.input_value}% is {w.direction} of the training
                range [{w.train_min}%, {w.train_max}%]. Results here are regime extrapolation.
              </li>
            ))}
          </ul>
        </Alert>
      )}

      <div className="grid cols-4">
        <Kpi
          label="Mean PD: baseline → stressed"
          value={`${imp.baseline_avg_pd_pct}% → ${imp.stressed_avg_pd_pct}%`}
          sub={`${fmtSigned(imp.delta_pd_pct_points, 2)} percentage points`}
          text
        />
        <Kpi label="Baseline portfolio ECL" value={fmtMoneyCompact(imp.baseline_total_ecl)} sub={`${fmtInt(imp.loan_count)} held-out loans`} tone="slate" />
        <Kpi label="Stressed portfolio ECL" value={fmtMoneyCompact(imp.stressed_total_ecl)} sub={res.scenario_name} tone="rust" />
        <Kpi
          label="Loss shock (Δ ECL)"
          value={fmtSignedMoney(shock)}
          sub={`${fmtSigned(imp.pct_change_ecl, 2, "%")} vs baseline`}
          tone={shock > 0 ? "rust" : "green"}
        />
      </div>

      <div className="grid cols-2">
        <Card title="Portfolio ECL by loan purpose" sub="Baseline vs stressed">
          <Legend
            items={[
              { label: "Baseline", color: "var(--c6)" },
              { label: "Stressed", color: "var(--c2)" },
            ]}
          />
          <ChartFrame height={Math.max(320, segData.length * 44 + 50)} summary="Expected credit loss by loan purpose, baseline versus stressed">
            <ResponsiveContainer>
              <BarChart data={segData} layout="vertical" margin={{ top: 4, right: 24, bottom: 22, left: 4 }}>
                <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
                <XAxis type="number" tick={AXIS_STYLE} tickFormatter={fmtMoneyCompact} label={{ value: "Expected credit loss ($)", position: "insideBottom", offset: -12, style: AXIS_STYLE }} />
                <YAxis type="category" dataKey="label" width={128} tick={AXIS_STYLE} interval={0} />
                <Tooltip cursor={{ fill: "rgba(24,23,22,0.05)" }} content={<ChartTip format={(v) => fmtMoney(v, 0)} />} />
                <Bar dataKey="baseline_ecl" name="Baseline ECL" fill="var(--c6)" radius={[0, 3, 3, 0]} isAnimationActive={false} />
                <Bar dataKey="stressed_ecl" name="Stressed ECL" fill="var(--c2)" radius={[0, 3, 3, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Card>

        <Card title="Mean PD by loan purpose" sub="Baseline vs stressed (%)">
          <Legend
            items={[
              { label: "Baseline", color: "var(--c6)" },
              { label: "Stressed", color: "var(--c2)" },
            ]}
          />
          <ChartFrame height={Math.max(320, segData.length * 44 + 50)} summary="Average probability of default by loan purpose, baseline versus stressed">
            <ResponsiveContainer>
              <BarChart data={segData} layout="vertical" margin={{ top: 4, right: 24, bottom: 22, left: 4 }}>
                <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
                <XAxis type="number" tick={AXIS_STYLE} tickFormatter={(v) => `${v}%`} label={{ value: "Mean predicted PD (%)", position: "insideBottom", offset: -12, style: AXIS_STYLE }} />
                <YAxis type="category" dataKey="label" width={128} tick={AXIS_STYLE} interval={0} />
                <Tooltip cursor={{ fill: "rgba(24,23,22,0.05)" }} content={<ChartTip format={(v) => `${v}%`} />} />
                <Bar dataKey="baseline_avg_pd_pct" name="Baseline PD" fill="var(--c6)" radius={[0, 3, 3, 0]} isAnimationActive={false} />
                <Bar dataKey="stressed_avg_pd_pct" name="Stressed PD" fill="var(--c2)" radius={[0, 3, 3, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Card>
      </div>

      <Card title="Comparison results (stress impact analysis)" sub={`Active scenario: ${res.scenario_name}`}>
        <SimpleTable
          caption="Stress impact analysis"
          rowKey={(r) => r.metric}
          rows={[
            {
              metric: "Average portfolio PD",
              base: fmtPct(imp.baseline_avg_pd_pct),
              stress: fmtPct(imp.stressed_avg_pd_pct),
              delta: fmtSigned(imp.delta_pd_pct_points, 2, " pp"),
              up: imp.delta_pd_pct_points > 0,
              note: `Shift across ${fmtInt(imp.loan_count)} held-out loans`,
            },
            {
              metric: "Loss given default (LGD)",
              base: fmtPct(imp.lgd_used * 100, 1),
              stress: fmtPct(imp.lgd_used * 100, 1),
              delta: "0.0 pp",
              note: "Held constant (Basel II uncollateralised retail)",
            },
            {
              metric: "Portfolio total ECL",
              base: fmtMoney(imp.baseline_total_ecl),
              stress: fmtMoney(imp.stressed_total_ecl),
              delta: fmtSignedMoney(shock),
              up: shock > 0,
              note: "Total expected loss reserve required",
            },
          ]}
          columns={[
            { key: "metric", header: "Risk metric", strong: true },
            { key: "base", header: "Baseline", num: true },
            { key: "stress", header: "Stressed", num: true, render: (r) => <span className={r.up ? "pos" : ""}>{r.stress}</span> },
            { key: "delta", header: "Delta", num: true, render: (r) => <span className={r.up ? "pos" : ""}>{r.delta}</span> },
            { key: "note", header: "Interpretation" },
          ]}
        />
      </Card>

      <div className="grid split-6040">
        <Card title="Segment stress table">
          <SimpleTable
            caption="Segment stress comparison"
            rowKey={(r) => r.purpose}
            rows={segs}
            columns={[
              { key: "p", header: "Purpose", strong: true, render: (r) => PURPOSE_LABELS[r.purpose] || r.purpose },
              { key: "n", header: "Loans", num: true, render: (r) => fmtInt(r.loan_count) },
              { key: "b", header: "Base PD", num: true, render: (r) => fmtPct(r.baseline_avg_pd_pct) },
              { key: "s", header: "Stress PD", num: true, render: (r) => fmtPct(r.stressed_avg_pd_pct) },
              { key: "e", header: "Stressed ECL", num: true, strong: true, render: (r) => fmtMoney(r.stressed_ecl) },
              { key: "c", header: "Δ ECL", num: true, render: (r) => <span className={r.delta_ecl > 0 ? "pos" : "neg"}>{fmtSigned(r.pct_change, 1, "%")}</span> },
            ]}
          />
        </Card>

        <Card title="Active borrower under stress" sub="Single-loan view">
          {bc ? (
            <div className="stack">
              <div className="grid cols-2" style={{ marginBottom: 0 }}>
                <Kpi label="Baseline PD" value={fmtPct(bc.baseline_prediction.pd_pct)} sub={`Grade ${bc.baseline_prediction.risk_grade}`} tone="slate" text />
                <Kpi label="Stressed PD" value={fmtPct(bc.stressed_prediction.pd_pct)} sub={`Grade ${bc.stressed_prediction.risk_grade}`} tone="rust" text />
              </div>
              {shifts.length > 0 ? (
                <SimpleTable
                  className="compact"
                  caption="SHAP shifts"
                  rowKey={(r) => r.feature}
                  rows={shifts}
                  columns={[
                    { key: "f", header: "Feature", strong: true, render: (r) => FEATURE_LABELS[r.feature] || r.feature },
                    { key: "b", header: "Base SHAP", num: true, render: (r) => r.baseline_shap.toFixed(3) },
                    { key: "s", header: "Stress SHAP", num: true, render: (r) => r.stressed_shap.toFixed(3) },
                    { key: "d", header: "Δ", num: true, render: (r) => <span className={r.shap_delta > 0 ? "pos" : "neg"}>{fmtSigned(r.shap_delta, 3)}</span> },
                  ]}
                />
              ) : (
                <p className="muted" style={{ fontSize: 14 }}>
                  No feature's SHAP value changed: the tree model has no macro splits, so the PD movement above comes from the
                  backend's macro sensitivity adjustment, not from SHAP attributions.
                </p>
              )}
            </div>
          ) : (
            <EmptyState title="No borrower comparison returned" />
          )}
        </Card>
      </div>

      <Alert tone="info" title="Scope limitation.">
        {res.methodology_limitation_note}
      </Alert>
    </>
  );
}

export default function Stress() {
  const { inputs } = useBorrower();
  const overview = useApi((signal) => api.getOverview({ signal }), []);
  const scenarios = overview.data?.macro_scenarios;

  const [scenario, setScenario] = useState("downturn");
  const [macro, setMacro] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);

  const borrower = useMemo(() => (Object.keys(validateBorrower(inputs)).length ? undefined : buildBorrowerPayload(inputs)), [inputs]);

  const run = useCallback(
    async (key, customMacro) => {
      const id = ++reqRef.current;
      setLoading(true);
      setError(null);
      try {
        const body = { scenario: key };
        if (customMacro) body.custom_macro = customMacro;
        if (borrower) body.borrower = borrower;
        const res = await api.stress(body);
        if (id === reqRef.current) setResult(res);
      } catch (e) {
        if (id === reqRef.current) {
          setResult(null);
          setError(e);
        }
      } finally {
        if (id === reqRef.current) setLoading(false);
      }
    },
    [borrower]
  );

  useEffect(() => {
    run("downturn", null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (scenarios && !macro) setMacro({ ...scenarios.downturn.values });
  }, [scenarios, macro]);

  const choose = (key) => {
    setScenario(key);
    setMacro({ ...scenarios[key].values });
    run(key, null);
  };
  const slide = (k, v) => {
    setScenario("custom");
    setMacro((m) => ({ ...m, [k]: v === "" ? "" : Number(v) }));
  };
  const macroValid = macro && SLIDERS.every((s) => macro[s.key] !== "" && Number.isFinite(Number(macro[s.key])));
  const ds = overview.data?.dataset_stats;
  const flat = !!ds && ds.date_min === ds.date_max;

  return (
    <PageShell
      title="Macro Stress Simulator"
      description="Compare credit risk and portfolio losses under different economic scenarios. Evaluates portfolio fragility across rising unemployment, interest rates and inflation shocks."
      note="Stress test today. Be ready tomorrow."
    >
      {flat && (
        <Alert tone="info" title="Governance disclosure.">
          The training data comes from a single origination month ({ds.date_min}), so macro factors were
          constant across it. The model learns borrower characteristics; the backend applies a monotone macro sensitivity
          adjustment to the predicted log-odds so scenarios can be compared, and flags every macro input outside the training
          range.
        </Alert>
      )}

      {overview.error && !scenarios ? (
        <ErrorState error={overview.error} onRetry={overview.reload} title="Scenario definitions could not be loaded." />
      ) : !scenarios ? (
        <LoadingBlock rows={1} />
      ) : (
        <>
          <div className="grid cols-3" role="group" aria-label="Scenario presets">
            {SCENARIO_ORDER.map((k) => (
              <button key={k} type="button" className="scenario-card" aria-pressed={scenario === k} onClick={() => choose(k)}>
                <h3>
                  <span>{scenarios[k].name.replace(/\s*\(.*\)/, "")}</span>
                  {scenario === k && <Badge tone="green">Active</Badge>}
                </h3>
                <p>{scenarios[k].description}</p>
                <MacroLines values={scenarios[k].values} />
              </button>
            ))}
          </div>

          <Card title="Custom macro shock" sub={scenario === "custom" ? "Custom values not yet run" : undefined}>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (macroValid) run("custom", macro);
              }}
            >
              <div className="grid cols-3" style={{ marginBottom: 14 }}>
                {SLIDERS.map((s) => (
                  <div className="field" key={s.key}>
                    <div className="slider-row">
                      <div className="top">
                        <label htmlFor={`sl-${s.key}`}>{s.label}</label>
                        <strong>{macro ? `${macro[s.key]}${s.unit}` : "—"}</strong>
                      </div>
                      <input id={`sl-${s.key}`} type="range" min={s.min} max={s.max} step={s.step} value={macro?.[s.key] ?? s.min} onChange={(e) => slide(s.key, e.target.value)} />
                      <input type="number" aria-label={`${s.label} value`} min={s.min} max={s.max} step={s.step} value={macro?.[s.key] ?? ""} onChange={(e) => slide(s.key, e.target.value)} />
                    </div>
                  </div>
                ))}
              </div>
              <button className="btn" type="submit" disabled={loading || !macroValid}>
                {loading ? "Simulating…" : "Run custom stress shock"}
              </button>
            </form>
          </Card>

          <div className="section-label" style={{ marginTop: 8 }}>
            Results
          </div>
          {error ? (
            <ErrorState error={error} title="Stress simulation failed." onRetry={() => run(scenario, scenario === "custom" ? macro : null)} />
          ) : loading && !result ? (
            <LoadingBlock rows={2} />
          ) : result ? (
            <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity .15s" }} aria-busy={loading}>
              <ResultBody res={result} />
            </div>
          ) : (
            <EmptyState title="No simulation result" />
          )}
        </>
      )}
    </PageShell>
  );
}
