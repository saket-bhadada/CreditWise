import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import PageShell from "../components/layout/PageShell";
import { Alert, Badge, Card, EmptyState, ErrorState, Kpi, NumberField, SimpleTable } from "../components/ui";
import { AXIS_STYLE, ChartFrame, ChartTip, GRID_STROKE, Legend } from "../components/charts/ChartParts";
import { api } from "../api/client";
import { useBorrower } from "../state/BorrowerContext";
import { buildBorrowerPayload, validateBorrower } from "../lib/schema";
import { fmtInt, fmtMoney, fmtMoneyCompact, fmtPct } from "../lib/format";

const GRADE_COLORS = {
  AAA: "#4f8a5b",
  AA: "#6f9f68",
  A: "#9bb06a",
  BBB: "#d9a441",
  BB: "#d9823a",
  B: "#c9602e",
  CCC: "#bd4b2a",
  D: "#8d2f1a",
};

/** Exact portfolio ECL at a given LGD: ECL = PD x LGD x EAD is linear in LGD, so rescale the exact total. */
function exactPortfolioEcl(result, row) {
  const ps = result.portfolio_summary;
  if (ps && ps.lgd_used > 0) return (ps.total_ecl / ps.lgd_used) * row.lgd;
  return row.portfolio_ecl; // cannot rescale from LGD = 0; fall back to the API value
}

function validate({ lgd, ead, pd }) {
  const e = {};
  const l = Number(lgd);
  if (lgd === "" || Number.isNaN(l) || l < 0 || l > 1) e.lgd = "LGD must be a decimal between 0 and 1 (e.g. 0.45).";
  const d = Number(ead);
  if (ead === "" || Number.isNaN(d) || d <= 0) e.ead = "EAD must be greater than 0.";
  if (pd !== "") {
    const p = Number(pd);
    if (Number.isNaN(p) || p < 0 || p > 100) e.pd = "PD override must be between 0 and 100 (%).";
  }
  return e;
}

export default function Ecl() {
  const { inputs } = useBorrower();
  const [form, setForm] = useState({ lgd: "0.45", ead: String(inputs.loan_amnt), pd: "" });
  const [touched, setTouched] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const reqRef = useRef(0);

  const borrowerErrors = useMemo(() => validateBorrower(inputs), [inputs]);
  const errors = validate(form);
  const invalid = Object.keys(errors).length > 0 || Object.keys(borrowerErrors).length > 0;

  const run = useCallback(
    async (f) => {
      const id = ++reqRef.current;
      setLoading(true);
      setError(null);
      try {
        const body = {
          loan_amnt: Number(inputs.loan_amnt),
          lgd: Number(f.lgd),
          ead: Number(f.ead),
          borrower: buildBorrowerPayload(inputs),
        };
        if (f.pd !== "") body.pd = Number(f.pd) / 100; // backend expects a decimal
        const res = await api.ecl(body);
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
    [inputs]
  );

  useEffect(() => {
    if (!invalid) run(form);
    else setLoading(false);
    // run once on mount with the active borrower
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (k) => (v) => setForm((p) => ({ ...p, [k]: v }));
  const onSubmit = (e) => {
    e.preventDefault();
    setTouched(true);
    if (!invalid) run(form);
  };

  const loan = result?.loan_level;
  const ps = result?.portfolio_summary;

  return (
    <PageShell
      title="Expected Credit Loss (ECL)"
      description="Estimate potential financial losses using probability of default, loss given default and exposure at default, following Basel II and IFRS 9 / CECL retail credit conventions."
      note="From prediction to financial impact."
    >
      <div className="formula">
        <div className="eq">
          <span>ECL</span>
          <span>=</span>
          <span className="tok">PD</span>
          <span>×</span>
          <span className="tok">LGD</span>
          <span>×</span>
          <span className="tok">EAD</span>
        </div>
        <div className="desc">Expected Credit Loss = Probability of Default × Loss Given Default × Exposure at Default</div>
      </div>

      <div className="grid cols-2" style={{ alignItems: "start" }}>
        <Card title="Input parameters" sub="Loan-level valuation">
          <form onSubmit={onSubmit} noValidate className="stack">
            <NumberField id="ecl-ead" label="Exposure at default (EAD, $)" value={form.ead} step={100} min={1} onChange={set("ead")} error={touched ? errors.ead : undefined} />
            <NumberField
              id="ecl-lgd"
              label="Loss given default (LGD, decimal)"
              value={form.lgd}
              step={0.01}
              min={0}
              max={1}
              onChange={set("lgd")}
              hint="Basel II retail uncollateralised baseline: 45% (0.45)"
              error={touched ? errors.lgd : undefined}
            />
            <NumberField
              id="ecl-pd"
              label="PD override (%, optional)"
              value={form.pd}
              step={0.1}
              min={0}
              max={100}
              onChange={set("pd")}
              hint="Leave empty to use the ML model's PD for the active borrower"
              error={touched ? errors.pd : undefined}
            />
            {Object.keys(borrowerErrors).length > 0 && (
              <Alert tone="warn" title="The active borrower has invalid inputs.">
                Fix them on the Prediction page first.
              </Alert>
            )}
            <button className="btn block" type="submit" disabled={loading}>
              {loading ? "Calculating…" : "Calculate ECL →"}
            </button>
          </form>
        </Card>

        <Card title="ECL result" actions={loan ? <Badge tone={["AAA", "AA", "A"].includes(loan.risk_grade) ? "green" : ["BBB", "BB", "B"].includes(loan.risk_grade) ? "amber" : "rust"}>Risk grade: {loan.risk_grade}</Badge> : null}>
          {error ? (
            <ErrorState error={error} title="ECL calculation failed." onRetry={() => run(form)} />
          ) : loading ? (
            <div role="status" className="stack">
              <div className="skeleton" style={{ height: 150 }} />
              <div className="skeleton" style={{ height: 90 }} />
            </div>
          ) : loan ? (
            <div className="stack">
              <div className="big-result">
                <div className="kpi-label">Expected credit loss</div>
                <div className="kpi-value">{fmtMoney(loan.ecl, 2)}</div>
                <div className="kpi-sub">Total expected loss on {fmtMoney(loan.ead)} exposure</div>
              </div>
              <div className="grid cols-3" style={{ marginBottom: 0 }}>
                <Kpi label="PD" value={fmtPct(loan.pd_pct)} sub={form.pd !== "" ? "Overridden" : "Model output"} text />
                <Kpi label="LGD" value={fmtPct(loan.lgd * 100, 1)} sub={loan.lgd_is_assumed ? "Assumed" : "Supplied"} tone="rust" text />
                <Kpi label="EAD" value={fmtMoney(loan.ead)} sub={loan.ead_is_assumed ? "Assumed" : "Supplied"} tone="amber" text />
              </div>
            </div>
          ) : (
            <EmptyState title="No result yet">Press Calculate ECL.</EmptyState>
          )}
        </Card>
      </div>

      {result && (
        <>
          <div className="section-label">Held-out test portfolio · {fmtInt(ps.loan_count)} loans</div>
          <div className="grid cols-4">
            <Kpi label="Total EAD" value={fmtMoneyCompact(ps.total_ead)} sub="Principal exposure" />
            <Kpi label="Average PD" value={fmtPct(ps.average_pd_pct)} sub="Mean across loans" tone="amber" />
            <Kpi label="Portfolio ECL" value={fmtMoneyCompact(ps.total_ecl)} sub={`LGD ${(ps.lgd_used * 100).toFixed(0)}%${ps.lgd_is_assumed ? " (assumed)" : ""}`} tone="rust" />
            <Kpi label="Loss rate" value={fmtPct(ps.loss_rate_pct)} sub="ECL ÷ EAD" tone="slate" />
          </div>

          <div className="grid cols-2">
            <Card title="LGD sensitivity" sub="Loan-level ECL at alternative LGD">
              <ChartFrame height={280} summary="Loan ECL under different loss-given-default assumptions">
                <ResponsiveContainer>
                  <BarChart data={result.lgd_sensitivity} margin={{ top: 8, right: 10, bottom: 22, left: 6 }}>
                    <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                    <XAxis dataKey="lgd_pct" tick={AXIS_STYLE} label={{ value: "LGD assumption", position: "insideBottom", offset: -12, style: AXIS_STYLE }} />
                    <YAxis tick={AXIS_STYLE} tickFormatter={(v) => `$${v.toLocaleString()}`} width={70} />
                    <Tooltip cursor={{ fill: "rgba(24,23,22,0.05)" }} content={<ChartTip title={(l) => `LGD ${l}`} format={(v) => fmtMoney(v, 2)} />} />
                    <Bar dataKey="loan_ecl" name="Loan ECL" fill="var(--c2)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            </Card>

            <Card title="Portfolio ECL by risk grade" sub="Share of total expected loss">
              <ChartFrame height={280} summary="Portfolio ECL by risk grade">
                <ResponsiveContainer>
                  <BarChart data={result.by_risk_grade} margin={{ top: 8, right: 10, bottom: 22, left: 6 }}>
                    <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                    <XAxis dataKey="risk_grade" tick={AXIS_STYLE} label={{ value: "Risk grade", position: "insideBottom", offset: -12, style: AXIS_STYLE }} />
                    <YAxis tick={AXIS_STYLE} tickFormatter={(v) => fmtMoneyCompact(v)} width={62} />
                    <Tooltip
                      cursor={{ fill: "rgba(24,23,22,0.05)" }}
                      content={<ChartTip title={(l) => `Grade ${l}`} format={(v, p) => `${fmtMoney(v, 0)} (${p.payload.ecl_share_pct}% of ECL)`} />}
                    />
                    <Bar dataKey="total_ecl" name="Total ECL" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                      {result.by_risk_grade.map((g) => (
                        <Cell key={g.risk_grade} fill={GRADE_COLORS[g.risk_grade] || "var(--c6)"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ChartFrame>
            </Card>
          </div>

          <Card title="Grade breakdown">
            <SimpleTable
              caption="Portfolio ECL by risk grade"
              rowKey={(r) => r.risk_grade}
              rows={result.by_risk_grade}
              columns={[
                { key: "g", header: "Grade", strong: true, render: (r) => <Badge tone={["AAA", "AA", "A"].includes(r.risk_grade) ? "green" : ["BBB", "BB", "B"].includes(r.risk_grade) ? "amber" : "rust"}>{r.risk_grade}</Badge> },
                { key: "n", header: "Loans", num: true, render: (r) => fmtInt(r.loan_count) },
                { key: "pd", header: "Avg PD", num: true, render: (r) => fmtPct(r.avg_pd_pct) },
                { key: "ead", header: "EAD", num: true, render: (r) => fmtMoney(r.total_ead) },
                { key: "ecl", header: "ECL", num: true, strong: true, render: (r) => fmtMoney(r.total_ecl, 2) },
                { key: "sh", header: "Share of ECL", num: true, render: (r) => fmtPct(r.ecl_share_pct, 1) },
              ]}
            />
          </Card>

          <Card title="LGD sensitivity table">
            <SimpleTable
              caption="LGD sensitivity"
              rowKey={(r) => r.lgd}
              rows={result.lgd_sensitivity}
              columns={[
                { key: "l", header: "LGD", strong: true, render: (r) => r.lgd_pct },
                { key: "le", header: "Loan ECL", num: true, render: (r) => fmtMoney(r.loan_ecl, 2) },
                { key: "pe", header: "Portfolio ECL", num: true, render: (r) => fmtMoney(exactPortfolioEcl(result, r), 0) },
              ]}
            />
            <p className="muted" style={{ fontSize: 13, marginTop: 12 }}>
              Portfolio ECL is the exact sum of PD × LGD × EAD over the {fmtInt(result.portfolio_summary.loan_count)} loans, rescaled
              linearly for each LGD (ECL is linear in LGD). The API&rsquo;s own <code>portfolio_ecl</code> field uses mean PD × total
              EAD × LGD, which understates the exact figure because larger loans also carry higher PD.
            </p>
          </Card>
        </>
      )}
    </PageShell>
  );
}
