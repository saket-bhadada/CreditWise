import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { api } from "../api";

export default function PortfolioPage() {
  const [purposeFilter, setPurposeFilter] = useState("ALL");
  const [gradeFilter, setGradeFilter] = useState("ALL");
  const [portfolioData, setPortfolioData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    api
      .getPortfolio(purposeFilter)
      .then((res) => {
        setPortfolioData(res);
        setError(null);
      })
      .catch((err) => setError(err.message || "Failed to load portfolio data."))
      .finally(() => setLoading(false));
  }, [purposeFilter]);

  if (loading && !portfolioData) {
    return <div className="card">Loading Test Portfolio Analytics...</div>;
  }

  if (error) {
    return <div className="alert-box alert-danger">{error}</div>;
  }

  const summary = portfolioData?.portfolio_summary || {};
  const histogram = portfolioData?.pd_histogram || [];
  const byPurpose = portfolioData?.by_purpose || [];
  const byOwnership = portfolioData?.by_home_ownership || [];
  const rawLoans = portfolioData?.loans || [];

  const filteredLoans =
    gradeFilter === "ALL"
      ? rawLoans
      : rawLoans.filter((l) => l.risk_grade === gradeFilter);

  return (
    <div>
      <div className="grid-4" style={{ marginBottom: "18px" }}>
        <div className="metric-box">
          <div className="metric-label">Portfolio Loan Count</div>
          <div className="metric-value">{summary.loan_count} Loans</div>
          <div className="metric-sub">Held-Out Test Sample</div>
        </div>

        <div className="metric-box warning">
          <div className="metric-label">Mean Portfolio PD</div>
          <div className="metric-value">{summary.average_pd_pct}%</div>
          <div className="metric-sub">Weighted Average Probability</div>
        </div>

        <div className="metric-box">
          <div className="metric-label">Total Exposure at Default (EAD)</div>
          <div className="metric-value">
            ${(summary.total_ead || 0).toLocaleString()}
          </div>
          <div className="metric-sub">Principal Outstanding</div>
        </div>

        <div className="metric-box danger">
          <div className="metric-label">Total Expected Credit Loss (ECL)</div>
          <div className="metric-value">
            ${(summary.total_ecl || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="metric-sub">
            Portfolio Loss Rate: {summary.loss_rate_pct}%
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            Portfolio Default Probability (PD) Distribution Histogram
          </div>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart data={histogram}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="bucket" />
                <YAxis />
                <Tooltip />
                <Bar
                  dataKey="count"
                  name="Number of Loans"
                  fill="#2563eb"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            Expected Credit Loss Grouped by Loan Purpose ($)
          </div>
          <div style={{ width: "100%", height: 280 }}>
            <ResponsiveContainer>
              <BarChart
                data={byPurpose}
                layout="vertical"
                margin={{ left: 50, right: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="purpose" type="category" width={120} />
                <Tooltip
                  formatter={(v) => `$${Number(v).toLocaleString()}`}
                />
                <Bar dataKey="total_ecl" name="Total ECL ($)" fill="#dc2626" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            Concentration &amp; Expected Loss by Loan Purpose
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Loan Purpose</th>
                <th>Loans</th>
                <th>Mean PD</th>
                <th>Total EAD ($)</th>
                <th>Total ECL ($)</th>
              </tr>
            </thead>
            <tbody>
              {byPurpose.map((p) => (
                <tr key={p.purpose}>
                  <td><strong>{p.purpose}</strong></td>
                  <td>{p.loan_count}</td>
                  <td>{p.avg_pd_pct}%</td>
                  <td>${p.total_ead.toLocaleString()}</td>
                  <td><strong>${p.total_ecl.toLocaleString()}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title">
            Concentration &amp; Expected Loss by Home Ownership
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Home Ownership</th>
                <th>Loans</th>
                <th>Mean PD</th>
                <th>Total EAD ($)</th>
                <th>Total ECL ($)</th>
              </tr>
            </thead>
            <tbody>
              {byOwnership.map((o) => (
                <tr key={o.home_ownership}>
                  <td><strong>{o.home_ownership}</strong></td>
                  <td>{o.loan_count}</td>
                  <td>{o.avg_pd_pct}%</td>
                  <td>${o.total_ead.toLocaleString()}</td>
                  <td><strong>${o.total_ecl.toLocaleString()}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div
          className="card-title"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>
            Filterable Portfolio Loan Records (Showing {filteredLoans.length} Records)
          </span>
          <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
            <label style={{ fontSize: "12px", fontWeight: 600 }}>
              Filter Purpose:
            </label>
            <select
              value={purposeFilter}
              onChange={(e) => setPurposeFilter(e.target.value)}
              style={{ padding: "5px 8px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
            >
              <option value="ALL">All Purposes</option>
              <option value="debt_consolidation">debt_consolidation</option>
              <option value="credit_card">credit_card</option>
              <option value="home_improvement">home_improvement</option>
              <option value="major_purchase">major_purchase</option>
              <option value="small_business">small_business</option>
              <option value="other">other</option>
            </select>

            <label style={{ fontSize: "12px", fontWeight: 600 }}>
              Filter Risk Grade:
            </label>
            <select
              value={gradeFilter}
              onChange={(e) => setGradeFilter(e.target.value)}
              style={{ padding: "5px 8px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
            >
              <option value="ALL">All Grades</option>
              <option value="AAA">Grade AAA</option>
              <option value="AA">Grade AA</option>
              <option value="A">Grade A</option>
              <option value="BBB">Grade BBB</option>
              <option value="BB">Grade BB</option>
              <option value="B">Grade B</option>
              <option value="CCC">Grade CCC</option>
              <option value="D">Grade D</option>
            </select>
          </div>
        </div>

        <div style={{ maxHeight: "420px", overflowY: "auto" }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Loan ID</th>
                <th>Origination</th>
                <th>Amount ($)</th>
                <th>Income ($)</th>
                <th>DTI (%)</th>
                <th>FICO</th>
                <th>Int Rate</th>
                <th>Purpose</th>
                <th>UNRATE</th>
                <th>PD (%)</th>
                <th>Grade</th>
                <th>ECL ($)</th>
              </tr>
            </thead>
            <tbody>
              {filteredLoans.slice(0, 60).map((loan) => (
                <tr key={loan.loan_id}>
                  <td><code>{loan.loan_id}</code></td>
                  <td>{loan.issue_d}</td>
                  <td>${Number(loan.loan_amnt).toLocaleString()}</td>
                  <td>${Number(loan.annual_inc).toLocaleString()}</td>
                  <td>{loan.dti}%</td>
                  <td>{loan.fico_score}</td>
                  <td>{(Number(loan.int_rate) * 100).toFixed(2)}%</td>
                  <td>{loan.purpose}</td>
                  <td>{loan.unemployment_rate}%</td>
                  <td><strong>{(Number(loan.pd) * 100).toFixed(2)}%</strong></td>
                  <td>
                    <span
                      className={`badge ${
                        loan.pd >= 0.2 ? "badge-high" : "badge-low"
                      }`}
                    >
                      {loan.risk_grade}
                    </span>
                  </td>
                  <td><strong>${Number(loan.ecl).toLocaleString()}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
