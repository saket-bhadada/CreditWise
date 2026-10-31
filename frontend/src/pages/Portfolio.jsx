import React, { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import PageShell from "../components/layout/PageShell";
import { Alert, Badge, Card, DataState, EmptyState, Kpi, SimpleTable } from "../components/ui";
import { AXIS_STYLE, ChartFrame, ChartTip, GRID_STROKE } from "../components/charts/ChartParts";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { PURPOSE_LABELS } from "../lib/schema";
import { fmtFracPct, fmtInt, fmtMoney, fmtMoneyCompact, fmtPct } from "../lib/format";

const GRADES = ["AAA", "AA", "A", "BBB", "BB", "B", "CCC", "D"];
const GRADE_COLORS = { AAA: "#4f8a5b", AA: "#6f9f68", A: "#9bb06a", BBB: "#d9a441", BB: "#d9823a", B: "#c9602e", CCC: "#bd4b2a", D: "#8d2f1a" };
const gradeTone = (g) => (["AAA", "AA", "A"].includes(g) ? "green" : ["BBB", "BB", "B"].includes(g) ? "amber" : "rust");
const PURPOSES = ["ALL", "debt_consolidation", "credit_card", "home_improvement", "major_purchase", "small_business", "car", "medical", "moving", "house", "vacation", "other"];

function PortfolioBody({ data, purpose, grade, onGrade }) {
  const s = data.portfolio_summary;
  const purposeRows = useMemo(
    () => [...data.by_purpose].sort((a, b) => b.loan_count - a.loan_count).map((p) => ({ ...p, label: PURPOSE_LABELS[p.purpose] || p.purpose })),
    [data]
  );
  const loans = data.loans || [];
  const shown = grade === "ALL" ? loans : loans.filter((l) => l.risk_grade === grade);
  const avgFico = loans.length ? loans.reduce((a, l) => a + Number(l.fico_score), 0) / loans.length : null;
  const avgExposure = s.loan_count ? s.total_ead / s.loan_count : null;
  const truncated = loans.length < s.loan_count;

  return (
    <>
      <div className="grid cols-4">
        <Kpi label="Total loans" value={fmtInt(s.loan_count)} sub="Held-out test tranche" />
        <Kpi label="Total exposure" value={fmtMoneyCompact(s.total_ead)} sub="Principal exposure at default" tone="rust" />
        <Kpi label="Avg. FICO score" value={avgFico ? Math.round(avgFico) : "—"} sub={truncated ? `Mean of the ${loans.length} loans returned` : "Credit quality indicator"} tone="green" />
        <Kpi label="Avg. loan amount" value={fmtMoney(avgExposure)} sub="Exposure ÷ loans" tone="amber" />
      </div>

      <div className="grid cols-4">
        <Kpi label="Mean portfolio PD" value={fmtPct(s.average_pd_pct)} sub="Model-predicted" tone="amber" text />
        <Kpi label="Total expected loss" value={fmtMoney(s.total_ecl)} sub={`LGD ${(s.lgd_used * 100).toFixed(0)}%${s.lgd_is_assumed ? " (assumed)" : ""}`} tone="rust" text />
        <Kpi label="Loss rate" value={fmtPct(s.loss_rate_pct)} sub="ECL ÷ EAD" tone="slate" text />
        <Kpi label="Filter" value={purpose === "ALL" ? "All purposes" : PURPOSE_LABELS[purpose] || purpose} sub="Applied by the backend" text />
      </div>

      <div className="grid cols-2">
        <Card title="Loan purpose mix" sub="Number of loans">
          <ChartFrame height={Math.max(280, purposeRows.length * 34 + 40)} summary="Loan count by purpose">
            <ResponsiveContainer>
              <BarChart data={purposeRows} layout="vertical" margin={{ top: 4, right: 30, bottom: 20, left: 4 }}>
                <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
                <XAxis type="number" tick={AXIS_STYLE} allowDecimals={false} label={{ value: "Loans", position: "insideBottom", offset: -10, style: AXIS_STYLE }} />
                <YAxis type="category" dataKey="label" width={130} tick={AXIS_STYLE} interval={0} />
                <Tooltip cursor={{ fill: "rgba(24,23,22,0.05)" }} content={<ChartTip format={(v, p) => `${fmtInt(v)} loans · mean PD ${fmtPct(p.payload.avg_pd_pct)}`} />} />
                <Bar dataKey="loan_count" name="Loans" fill="var(--c1)" radius={[0, 3, 3, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Card>

        <Card title="Risk grade distribution" sub="Loans per grade">
          <ChartFrame height={Math.max(280, purposeRows.length * 34 + 40)} summary="Loan count by risk grade">
            <ResponsiveContainer>
              <BarChart data={GRADES.map((g) => data.by_risk_grade.find((x) => x.risk_grade === g) || { risk_grade: g, loan_count: 0, total_ead: 0, total_ecl: 0, avg_pd_pct: 0 })} margin={{ top: 8, right: 10, bottom: 22, left: 6 }}>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis dataKey="risk_grade" tick={AXIS_STYLE} label={{ value: "Risk grade (AAA = lowest PD)", position: "insideBottom", offset: -12, style: AXIS_STYLE }} />
                <YAxis tick={AXIS_STYLE} allowDecimals={false} width={44} />
                <Tooltip cursor={{ fill: "rgba(24,23,22,0.05)" }} content={<ChartTip title={(l) => `Grade ${l}`} format={(v, p) => `${fmtInt(v)} loans · ${fmtMoneyCompact(p.payload.total_ead)} EAD`} />} />
                <Bar dataKey="loan_count" name="Loans" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {GRADES.map((g) => (
                    <Cell key={g} fill={GRADE_COLORS[g]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="PD distribution" sub="Loans per predicted-PD bucket">
          <ChartFrame height={290} summary="Histogram of predicted default probability">
            <ResponsiveContainer>
              <BarChart data={data.pd_histogram} margin={{ top: 8, right: 10, bottom: 22, left: 6 }}>
                <CartesianGrid vertical={false} stroke={GRID_STROKE} />
                <XAxis dataKey="bucket" tick={AXIS_STYLE} label={{ value: "Predicted PD", position: "insideBottom", offset: -12, style: AXIS_STYLE }} />
                <YAxis tick={AXIS_STYLE} allowDecimals={false} width={44} />
                <Tooltip cursor={{ fill: "rgba(24,23,22,0.05)" }} content={<ChartTip title={(l) => `PD ${l}`} format={(v, p) => `${fmtInt(v)} loans · ECL ${fmtMoney(p.payload.total_ecl)}`} />} />
                <Bar dataKey="count" name="Loans" fill="var(--c5)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Card>

        <Card title="Expected loss by purpose" sub="Total ECL ($)">
          <ChartFrame height={290} summary="Total expected credit loss by loan purpose">
            <ResponsiveContainer>
              <BarChart data={[...purposeRows].sort((a, b) => b.total_ecl - a.total_ecl)} layout="vertical" margin={{ top: 4, right: 30, bottom: 20, left: 4 }}>
                <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
                <XAxis type="number" tick={AXIS_STYLE} tickFormatter={fmtMoneyCompact} label={{ value: "Total ECL", position: "insideBottom", offset: -10, style: AXIS_STYLE }} />
                <YAxis type="category" dataKey="label" width={130} tick={AXIS_STYLE} interval={0} />
                <Tooltip cursor={{ fill: "rgba(24,23,22,0.05)" }} content={<ChartTip format={(v) => fmtMoney(v, 0)} />} />
                <Bar dataKey="total_ecl" name="Total ECL" fill="var(--c2)" radius={[0, 3, 3, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </ChartFrame>
        </Card>
      </div>

      <div className="grid cols-2">
        <Card title="Concentration by purpose">
          <SimpleTable
            caption="Concentration by loan purpose"
            rowKey={(r) => r.purpose}
            rows={purposeRows}
            columns={[
              { key: "l", header: "Purpose", strong: true, render: (r) => r.label },
              { key: "n", header: "Loans", num: true, render: (r) => fmtInt(r.loan_count) },
              { key: "p", header: "Mean PD", num: true, render: (r) => fmtPct(r.avg_pd_pct) },
              { key: "e", header: "EAD", num: true, render: (r) => fmtMoney(r.total_ead) },
              { key: "c", header: "ECL", num: true, strong: true, render: (r) => fmtMoney(r.total_ecl) },
            ]}
          />
        </Card>
        <Card title="Concentration by home ownership">
          <SimpleTable
            caption="Concentration by home ownership"
            rowKey={(r) => r.home_ownership}
            rows={data.by_home_ownership}
            columns={[
              { key: "h", header: "Ownership", strong: true, render: (r) => r.home_ownership },
              { key: "n", header: "Loans", num: true, render: (r) => fmtInt(r.loan_count) },
              { key: "p", header: "Mean PD", num: true, render: (r) => fmtPct(r.avg_pd_pct) },
              { key: "e", header: "EAD", num: true, render: (r) => fmtMoney(r.total_ead) },
              { key: "c", header: "ECL", num: true, strong: true, render: (r) => fmtMoney(r.total_ecl) },
            ]}
          />
        </Card>
      </div>

      <Card
        title="Loan records"
        sub={`${fmtInt(shown.length)} shown${truncated ? ` of ${fmtInt(s.loan_count)} (API returns the first ${loans.length})` : ""}`}
        actions={
          <div className="toolbar">
            <label htmlFor="grade-filter">Risk grade</label>
            <select id="grade-filter" value={grade} onChange={(e) => onGrade(e.target.value)}>
              <option value="ALL">All grades</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>
                  Grade {g}
                </option>
              ))}
            </select>
          </div>
        }
      >
        {shown.length === 0 ? (
          <EmptyState title="No loans match this filter">Try a different risk grade or loan purpose.</EmptyState>
        ) : (
          <SimpleTable
            scrollY
            caption="Portfolio loan records"
            rowKey={(r) => r.loan_id}
            rows={shown}
            className="wide"
            columns={[
              { key: "id", header: "Loan ID", render: (r) => <code className="nowrap">{r.loan_id}</code> },
              { key: "d", header: "Issued", render: (r) => <span className="nowrap">{r.issue_d}</span> },
              { key: "a", header: "Amount", num: true, render: (r) => fmtMoney(r.loan_amnt) },
              { key: "i", header: "Income", num: true, render: (r) => fmtMoney(r.annual_inc) },
              { key: "t", header: "DTI", num: true, render: (r) => `${r.dti}%` },
              { key: "f", header: "FICO", num: true, render: (r) => r.fico_score },
              { key: "r", header: "Rate", num: true, render: (r) => fmtFracPct(r.int_rate) },
              { key: "p", header: "Purpose", render: (r) => PURPOSE_LABELS[r.purpose] || r.purpose },
              { key: "pd", header: "PD", num: true, strong: true, render: (r) => fmtFracPct(r.pd) },
              { key: "g", header: "Grade", render: (r) => <Badge tone={gradeTone(r.risk_grade)}>{r.risk_grade}</Badge> },
              { key: "e", header: "ECL", num: true, strong: true, render: (r) => fmtMoney(r.ecl, 2) },
              { key: "o", header: "Actual", render: (r) => (r.default === 1 ? <Badge tone="rust">Defaulted</Badge> : <Badge>Performing</Badge>) },
            ]}
          />
        )}
      </Card>
    </>
  );
}

export default function Portfolio() {
  const [purpose, setPurpose] = useState("ALL");
  const [grade, setGrade] = useState("ALL");
  const state = useApi((signal) => api.portfolio(purpose, { signal }), [purpose]);

  return (
    <PageShell
      title="Portfolio Analytics"
      description="Explore portfolio distribution and key metrics across the held-out LendingClub test tranche and its risk cohorts."
      note="Distribution & loss analysis · Portfolio concentration"
    >
      <div className="toolbar" style={{ marginBottom: 18 }}>
        <label htmlFor="purpose-filter">Loan purpose</label>
        <select id="purpose-filter" value={purpose} onChange={(e) => { setPurpose(e.target.value); setGrade("ALL"); }}>
          {PURPOSES.map((p) => (
            <option key={p} value={p}>
              {p === "ALL" ? "All purposes" : PURPOSE_LABELS[p] || p}
            </option>
          ))}
        </select>
        {state.loading && state.data && <span className="muted">Refreshing…</span>}
      </div>
      <DataState state={state} onRetry={state.reload}>
        {(data) => (
          <>
            {purpose !== "ALL" && data.portfolio_summary && !data.by_purpose.some((p) => p.purpose === purpose) && (
              <Alert tone="warn" title="No loans for this purpose.">
                The backend returned the full portfolio instead (it ignores a filter that matches no loans).
              </Alert>
            )}
            <PortfolioBody data={data} purpose={purpose} grade={grade} onGrade={setGrade} />
          </>
        )}
      </DataState>
    </PageShell>
  );
}
