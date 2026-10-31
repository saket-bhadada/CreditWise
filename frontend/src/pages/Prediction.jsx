import React, { useCallback, useMemo, useRef, useState } from "react";
import PageShell from "../components/layout/PageShell";
import { Alert, Badge, Card, EmptyState, ErrorState, Kpi, NumberField, SelectField } from "../components/ui";
import { api } from "../api/client";
import { useBorrower } from "../state/BorrowerContext";
import {
  BORROWER_PRESETS,
  CATEGORY_OPTIONS,
  MACRO_FEATURES,
  NUMERIC_RULES,
  PURPOSE_LABELS,
  buildBorrowerPayload,
  validateBorrower,
} from "../lib/schema";
import { fmtMoney, fmtPct } from "../lib/format";

const GRADE_TONE = { AAA: "green", AA: "green", A: "green", BBB: "slate", BB: "amber", B: "amber", CCC: "rust", D: "rust" };

function PdGauge({ pd, threshold }) {
  const pct = Math.min(100, Math.max(0, pd * 100));
  const thr = Math.min(100, Math.max(0, threshold * 100));
  return (
    <div className="gauge" role="img" aria-label={`Probability of default ${pct.toFixed(1)} percent; decision threshold ${thr.toFixed(1)} percent`}>
      <div className="gauge-track">
        <div className="gauge-fill" style={{ width: `${pct}%` }} />
        <div className="gauge-mark" style={{ left: `${thr}%` }}>
          <span>threshold {thr.toFixed(1)}%</span>
        </div>
      </div>
      <div className="gauge-scale">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

function Result({ r }) {
  const high = r.prediction === 1;
  return (
    <div className="stack">
      <div className="big-result">
        <div className="kpi-label">Probability of default</div>
        <div className="kpi-value">{fmtPct(r.pd_pct)}</div>
        <PdGauge pd={r.pd} threshold={r.threshold} />
        <div className="row-between" style={{ marginTop: 12 }}>
          <Badge tone={high ? "rust" : "green"}>{r.prediction_label}</Badge>
          <Badge tone={GRADE_TONE[r.risk_grade] || "default"} title={r.risk_tier_label}>
            Grade {r.risk_grade}
          </Badge>
        </div>
        <p className="muted" style={{ marginTop: 8, fontSize: 13.5 }}>
          {r.risk_tier_label}
        </p>
      </div>

      <div className="result-kpis">
        <div className="wide">
          <Kpi label="Expected loss" value={fmtMoney(r.ecl, 2)} sub="PD × LGD × EAD" tone="rust" />
        </div>
        <Kpi label="LGD" value={fmtPct(r.lgd * 100, 0)} sub={r.lgd_is_assumed ? "Assumed (Basel II)" : "Supplied"} />
        <Kpi label="EAD" value={fmtMoney(r.ead)} sub={r.ead_is_assumed ? "Assumed = loan amount" : "Supplied"} />
      </div>

      {r.out_of_range_warnings?.length > 0 && (
        <Alert tone="warn" title={`Out-of-range input (${r.out_of_range_warnings.length}).`}>
          These values fall outside what the model saw in training, so the prediction relies on extrapolation:
          <ul>
            {r.out_of_range_warnings.map((w) => (
              <li key={w.feature}>{w.message}</li>
            ))}
          </ul>
        </Alert>
      )}
    </div>
  );
}

export default function Prediction() {
  const { inputs, setField, replaceInputs, prediction, setPrediction } = useBorrower();
  const [status, setStatus] = useState({ loading: false, error: null });
  const [touched, setTouched] = useState(false);
  const ctrl = useRef(null);
  const errors = useMemo(() => validateBorrower(inputs), [inputs]);
  const hasErrors = Object.keys(errors).length > 0;
  const showErr = (f) => (touched ? errors[f] : undefined);

  const run = useCallback(async () => {
    setTouched(true);
    if (Object.keys(validateBorrower(inputs)).length) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setStatus({ loading: true, error: null });
    try {
      const res = await api.predict(buildBorrowerPayload(inputs), { signal: c.signal });
      if (c.signal.aborted) return;
      setPrediction(res);
      setStatus({ loading: false, error: null });
    } catch (error) {
      if (error.kind === "ABORTED") return;
      setPrediction(null); // never leave a stale result next to a failed request
      setStatus({ loading: false, error });
    }
  }, [inputs, setPrediction]);

  const num = (f, extra = {}) => (
    <NumberField
      id={`f-${f}`}
      label={`${NUMERIC_RULES[f].label}${NUMERIC_RULES[f].unit === "$" ? " ($)" : NUMERIC_RULES[f].unit === "%" ? " (%)" : ""}`}
      value={inputs[f]}
      onChange={(v) => setField(f, v)}
      error={showErr(f)}
      step={NUMERIC_RULES[f].step}
      min={NUMERIC_RULES[f].min}
      max={NUMERIC_RULES[f].max}
      {...extra}
    />
  );

  return (
    <PageShell
      title="Borrower Risk Prediction"
      description="Enter borrower and economic data to get a credit risk prediction. Inputs are validated here and evaluated by the trained ML pipeline."
      note="Real-time inference · Quantitative risk scoring"
    >
      <div className="chips" role="group" aria-label="Load a preset borrower">
        <span className="chips-label">Load preset:</span>
        {BORROWER_PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            className="chip"
            onClick={() => {
              replaceInputs(p.values);
              setStatus({ loading: false, error: null });
            }}
          >
            {p.label}
          </button>
        ))}
      </div>

      <div className="grid split-6040">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run();
          }}
          noValidate
        >
          <Card title="A. Borrower financial & loan origination features">
            <div className="form-grid">
              {num("loan_amnt")}
              {num("annual_inc")}
              {num("dti")}
              {num("fico_score")}
              {num("int_rate", { hint: "Decimal, e.g. 0.135 = 13.5%" })}
              <SelectField id="f-emp" label="Employment length" value={inputs.emp_length} options={CATEGORY_OPTIONS.emp_length} onChange={(v) => setField("emp_length", v)} error={showErr("emp_length")} />
              <SelectField id="f-home" label="Home ownership" value={inputs.home_ownership} options={CATEGORY_OPTIONS.home_ownership} onChange={(v) => setField("home_ownership", v)} error={showErr("home_ownership")} />
              <SelectField id="f-purpose" label="Loan purpose" value={inputs.purpose} options={CATEGORY_OPTIONS.purpose} format={(o) => PURPOSE_LABELS[o] || o} onChange={(v) => setField("purpose", v)} error={showErr("purpose")} />
              <SelectField id="f-term" label="Loan term" value={inputs.term} options={CATEGORY_OPTIONS.term} onChange={(v) => setField("term", v)} error={showErr("term")} />
            </div>

            <h3 className="section-label" style={{ marginTop: 26 }}>
              B. Macroeconomic conditions
            </h3>
            <div className="form-grid">
              {MACRO_FEATURES.map((f) => (
                <React.Fragment key={f}>{num(f)}</React.Fragment>
              ))}
            </div>

            {touched && hasErrors && (
              <Alert tone="error" title="Fix the highlighted fields before running the prediction." />
            )}
            <div className="btn-row">
              <button type="submit" className="btn" disabled={status.loading}>
                {status.loading ? "Running model…" : "Run prediction →"}
              </button>
            </div>
          </Card>
        </form>

        <Card title="Prediction result" sub="POST /api/predict" aria-live="polite">
          {status.error && <ErrorState error={status.error} onRetry={run} title="Prediction failed." />}
          {status.loading && !prediction && <div className="skeleton" style={{ height: 220 }} aria-label="Running prediction" />}
          {prediction && <Result r={prediction} />}
          {!prediction && !status.loading && !status.error && (
            <EmptyState title='Enter borrower data and click "Run prediction"'>
              The ML model computes PD, risk grade and expected loss.
            </EmptyState>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
