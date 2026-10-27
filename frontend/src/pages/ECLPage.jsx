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

export default function ECLPage({ borrowerInputs }) {
  const [lgdOverride, setLgdOverride] = useState("");
  const [eadFactorOverride, setEadFactorOverride] = useState("");
  const [purposeFilter, setPurposeFilter] = useState("ALL");
  const [eclData, setEclData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchECL = (lgdVal, eadFactorVal, purp) => {
    setLoading(true);
    const payload = {
      loan_amnt: borrowerInputs?.loan_amnt || 16000,
      borrower: borrowerInputs,
      purpose_filter: purp,
      lgd: lgdVal !== "" ? parseFloat(lgdVal) : null,
      ead_factor: eadFactorVal !== "" ? parseFloat(eadFactorVal) : null,
    };
    api
      .calculateECL(payload)
      .then((res) => {
        setEclData(res);
        setError(null);
      })
      .catch((err) => setError(err.message || "ECL calculation failed."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchECL(lgdOverride, eadFactorOverride, purposeFilter);
  }, [borrowerInputs]);

  const handleApplyOverrides = (e) => {
    e.preventDefault();
    fetchECL(lgdOverride, eadFactorOverride, purposeFilter);
  };

  const handleResetDefaults = () => {
    setLgdOverride("");
    setEadFactorOverride("");
    setPurposeFilter("ALL");
    fetchECL("", "", "ALL");
  };

  if (loading && !eclData) {
    return <div className="card">Calculating Expected Credit Loss (ECL)...</div>;
  }

  if (error) {
    return <div className="alert-box alert-danger">{error}</div>;
  }

  const loanLevel = eclData?.loan_level || {};
  const portSummary = eclData?.portfolio_summary || {};
  const byGrade = eclData?.by_risk_grade || [];
  const sensitivity = eclData?.lgd_sensitivity || [];

  return (
    <div>
      <div className="formula-banner">
        Expected Credit Loss Formula: ECL = PD &times; LGD &times; EAD
      </div>

      <div className="alert-box alert-info">
        <strong>Parameter Governance (Assumed vs. Observed):</strong> When historical post-default recovery records are unavailable at origination, LGD defaults to the standard unsecured retail benchmark of <strong>45% (0.45)</strong> (<code>lgd_is_assumed = true</code>) and EAD defaults to <strong>100% of Loan Principal</strong> (<code>ead_is_assumed = true</code>). You can override both parameters below to perform sensitivity analysis.
      </div>

      <div className="card">
        <div className="card-title">
          LGD &amp; EAD Parameter Sensitivity Controls
        </div>
        <form onSubmit={handleApplyOverrides}>
          <div className="form-grid" style={{ alignItems: "end" }}>
            <div className="form-group">
              <label>
                Loss Given Default (LGD Decimal, Default = 0.45 Assumed)
              </label>
              <input
                type="number"
                step="0.05"
                min="0.05"
                max="1.00"
                placeholder="0.45 (Assumed Default)"
                value={lgdOverride}
                onChange={(e) => setLgdOverride(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>
                EAD Utilization Factor (Decimal, Default = 1.00 Assumed)
              </label>
              <input
                type="number"
                step="0.05"
                min="0.10"
                max="1.50"
                placeholder="1.00 (100% of Principal)"
                value={eadFactorOverride}
                onChange={(e) => setEadFactorOverride(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Portfolio Purpose Filter</label>
              <select
                value={purposeFilter}
                onChange={(e) => setPurposeFilter(e.target.value)}
              >
                <option value="ALL">ALL LOAN PURPOSES</option>
                <option value="debt_consolidation">debt_consolidation</option>
                <option value="credit_card">credit_card</option>
                <option value="home_improvement">home_improvement</option>
                <option value="major_purchase">major_purchase</option>
                <option value="small_business">small_business</option>
                <option value="other">other</option>
              </select>
            </div>

            <div style={{ display: "flex", gap: "8px" }}>
              <button type="submit" className="btn">
                Recalculate ECL
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleResetDefaults}
              >
                Reset to Assumed Defaults
              </button>
            </div>
          </div>
        </form>
      </div>

      <div className="grid-4" style={{ marginBottom: "18px" }}>
        <div className="metric-box">
          <div className="metric-label">Active Loan ECL</div>
          <div className="metric-value">
            ${(loanLevel.ecl || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="metric-sub">
            PD: {loanLevel.pd_pct}% | EAD: ${(loanLevel.ead || 0).toLocaleString()}
          </div>
        </div>

        <div className="metric-box warning">
          <div className="metric-label">LGD Parameter Status</div>
          <div className="metric-value">
            {((portSummary.lgd_used || 0.45) * 100).toFixed(1)}%
          </div>
          <div className="metric-sub">
            {portSummary.lgd_is_assumed
              ? "Assumed Regulatory Benchmark"
              : "Custom User Override"}
          </div>
        </div>

        <div className="metric-box danger">
          <div className="metric-label">Total Portfolio ECL</div>
          <div className="metric-value">
            ${(portSummary.total_ecl || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="metric-sub">
            Across {portSummary.loan_count} Portfolio Loans
          </div>
        </div>

        <div className="metric-box">
          <div className="metric-label">Portfolio Expected Loss Rate</div>
          <div className="metric-value">{portSummary.loss_rate_pct}%</div>
          <div className="metric-sub">
            Total EAD: ${(portSummary.total_ead || 0).toLocaleString()}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            Portfolio-Level ECL Breakdown by Credit Risk Grade
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Risk Grade</th>
                <th>Loans</th>
                <th>Mean PD</th>
                <th>Total Exposure (EAD)</th>
                <th>Expected Credit Loss (ECL)</th>
                <th>Share of Total ECL</th>
              </tr>
            </thead>
            <tbody>
              {byGrade.map((g) => (
                <tr key={g.risk_grade}>
                  <td>
                    <strong>Grade {g.risk_grade}</strong>
                  </td>
                  <td>{g.loan_count}</td>
                  <td>{g.avg_pd_pct}%</td>
                  <td>${g.total_ead.toLocaleString()}</td>
                  <td>
                    <strong>
                      ${g.total_ecl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </strong>
                  </td>
                  <td>{g.ecl_share_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title">
            LGD Sensitivity Analysis (Impact of Recovery Rate Assumptions)
          </div>
          <div style={{ width: "100%", height: 260, marginBottom: "12px" }}>
            <ResponsiveContainer>
              <BarChart data={sensitivity}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="lgd_pct" />
                <YAxis />
                <Tooltip
                  formatter={(v) => `$${Number(v).toLocaleString()}`}
                />
                <Bar
                  dataKey="portfolio_ecl"
                  name="Portfolio ECL ($)"
                  fill="#2563eb"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Assumed LGD (%)</th>
                <th>Implied Recovery Rate</th>
                <th>Single Loan ECL ($)</th>
                <th>Portfolio Total ECL ($)</th>
              </tr>
            </thead>
            <tbody>
              {sensitivity.map((s) => (
                <tr key={s.lgd_pct}>
                  <td>
                    <strong>{s.lgd_pct}</strong>{" "}
                    {s.lgd === 0.45 ? "(Default)" : ""}
                  </td>
                  <td>{Math.round((1 - s.lgd) * 100)}%</td>
                  <td>${s.loan_ecl.toLocaleString()}</td>
                  <td>
                    <strong>${s.portfolio_ecl.toLocaleString()}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
