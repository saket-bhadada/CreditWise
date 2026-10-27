import React, { useEffect, useState } from "react";
import { api } from "../api";

const BORROWER_PRESETS = {
  prime: {
    loan_amnt: 10000,
    annual_inc: 115000,
    dti: 9.5,
    fico_score: 775,
    int_rate: 0.072,
    emp_length: "10+ years",
    home_ownership: "OWN",
    purpose: "credit_card",
    term: " 36 months",
    unemployment_rate: 5.0,
    fed_funds_rate: 2.0,
    inflation_rate: 2.2,
  },
  median: {
    loan_amnt: 16000,
    annual_inc: 68000,
    dti: 18.5,
    fico_score: 705,
    int_rate: 0.132,
    emp_length: "5 years",
    home_ownership: "MORTGAGE",
    purpose: "debt_consolidation",
    term: " 36 months",
    unemployment_rate: 5.0,
    fed_funds_rate: 2.0,
    inflation_rate: 2.2,
  },
  subprime: {
    loan_amnt: 28000,
    annual_inc: 42000,
    dti: 33.5,
    fico_score: 625,
    int_rate: 0.238,
    emp_length: "< 1 year",
    home_ownership: "RENT",
    purpose: "small_business",
    term: " 60 months",
    unemployment_rate: 7.5,
    fed_funds_rate: 4.0,
    inflation_rate: 4.5,
  },
};

export default function BorrowerRisk({
  borrowerInputs,
  setBorrowerInputs,
  onNavigate,
}) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const runPrediction = (inputsToUse) => {
    setLoading(true);
    api
      .predictBorrower(inputsToUse)
      .then((res) => {
        setResult(res);
        setError(null);
      })
      .catch((err) => setError(err.message || "Prediction request failed."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    runPrediction(borrowerInputs);
  }, []);

  const handleFieldChange = (field, value, isNumeric = true) => {
    const parsed = isNumeric ? parseFloat(value) || 0 : value;
    setBorrowerInputs((prev) => ({ ...prev, [field]: parsed }));
  };

  const applyPreset = (presetKey) => {
    const preset = BORROWER_PRESETS[presetKey];
    setBorrowerInputs(preset);
    runPrediction(preset);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    runPrediction(borrowerInputs);
  };

  return (
    <div>
      <div className="card">
        <div
          className="card-title"
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span>Borrower Financial &amp; Macroeconomic Input Form</span>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => applyPreset("prime")}
            >
              Load Prime Profile
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => applyPreset("median")}
            >
              Load Median Profile
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => applyPreset("subprime")}
            >
              Load Subprime High-Risk
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <h4 style={{ marginBottom: "10px", color: "#334155" }}>
            A. Borrower Credit &amp; Loan Origination Features
          </h4>
          <div className="form-grid" style={{ marginBottom: "16px" }}>
            <div className="form-group">
              <label>Loan Amount ($)</label>
              <input
                type="number"
                step="500"
                min="1000"
                max="50000"
                value={borrowerInputs.loan_amnt}
                onChange={(e) => handleFieldChange("loan_amnt", e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Annual Income ($)</label>
              <input
                type="number"
                step="1000"
                min="10000"
                value={borrowerInputs.annual_inc}
                onChange={(e) =>
                  handleFieldChange("annual_inc", e.target.value)
                }
              />
            </div>

            <div className="form-group">
              <label>Debt-to-Income Ratio (DTI %)</label>
              <input
                type="number"
                step="0.5"
                min="0"
                max="60"
                value={borrowerInputs.dti}
                onChange={(e) => handleFieldChange("dti", e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>FICO Credit Score (300 - 850)</label>
              <input
                type="number"
                step="5"
                min="300"
                max="850"
                value={borrowerInputs.fico_score}
                onChange={(e) =>
                  handleFieldChange("fico_score", e.target.value)
                }
              />
            </div>

            <div className="form-group">
              <label>Interest Rate (Decimal, e.g. 0.132 = 13.2%)</label>
              <input
                type="number"
                step="0.005"
                min="0.03"
                max="0.40"
                value={borrowerInputs.int_rate}
                onChange={(e) => handleFieldChange("int_rate", e.target.value)}
              />
            </div>

            <div className="form-group">
              <label>Employment Length</label>
              <select
                value={borrowerInputs.emp_length}
                onChange={(e) =>
                  handleFieldChange("emp_length", e.target.value, false)
                }
              >
                <option value="< 1 year">&lt; 1 year</option>
                <option value="1 year">1 year</option>
                <option value="2 years">2 years</option>
                <option value="3 years">3 years</option>
                <option value="5 years">5 years</option>
                <option value="10+ years">10+ years</option>
              </select>
            </div>

            <div className="form-group">
              <label>Home Ownership</label>
              <select
                value={borrowerInputs.home_ownership}
                onChange={(e) =>
                  handleFieldChange("home_ownership", e.target.value, false)
                }
              >
                <option value="MORTGAGE">MORTGAGE</option>
                <option value="RENT">RENT</option>
                <option value="OWN">OWN</option>
                <option value="OTHER">OTHER</option>
              </select>
            </div>

            <div className="form-group">
              <label>Loan Purpose</label>
              <select
                value={borrowerInputs.purpose}
                onChange={(e) =>
                  handleFieldChange("purpose", e.target.value, false)
                }
              >
                <option value="debt_consolidation">debt_consolidation</option>
                <option value="credit_card">credit_card</option>
                <option value="home_improvement">home_improvement</option>
                <option value="major_purchase">major_purchase</option>
                <option value="small_business">small_business</option>
                <option value="other">other</option>
              </select>
            </div>

            <div className="form-group">
              <label>Loan Term</label>
              <select
                value={borrowerInputs.term}
                onChange={(e) =>
                  handleFieldChange("term", e.target.value, false)
                }
              >
                <option value=" 36 months">36 months</option>
                <option value=" 60 months">60 months</option>
              </select>
            </div>
          </div>

          <h4 style={{ marginBottom: "10px", color: "#1e40af" }}>
            B. Macroeconomic Environment Inputs at Origination
          </h4>
          <div className="form-grid" style={{ marginBottom: "16px" }}>
            <div className="form-group">
              <label>Unemployment Rate (UNRATE %)</label>
              <input
                type="number"
                step="0.1"
                value={borrowerInputs.unemployment_rate}
                onChange={(e) =>
                  handleFieldChange("unemployment_rate", e.target.value)
                }
              />
            </div>

            <div className="form-group">
              <label>Federal Funds Rate (FEDFUNDS %)</label>
              <input
                type="number"
                step="0.1"
                value={borrowerInputs.fed_funds_rate}
                onChange={(e) =>
                  handleFieldChange("fed_funds_rate", e.target.value)
                }
              />
            </div>

            <div className="form-group">
              <label>CPI Inflation Rate (YoY %)</label>
              <input
                type="number"
                step="0.1"
                value={borrowerInputs.inflation_rate}
                onChange={(e) =>
                  handleFieldChange("inflation_rate", e.target.value)
                }
              />
            </div>
          </div>

          <div style={{ display: "flex", gap: "12px" }}>
            <button type="submit" className="btn" disabled={loading}>
              {loading
                ? "Computing Prediction..."
                : "Predict Default Risk & Calculate ECL"}
            </button>
            {onNavigate && (
              <>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onNavigate("explainability")}
                >
                  Inspect SHAP Attributions &rarr;
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => onNavigate("stress")}
                >
                  Run Stress Test on Borrower &rarr;
                </button>
              </>
            )}
          </div>
        </form>
      </div>

      {error && <div className="alert-box alert-danger">{error}</div>}

      {result && (
        <div>
          {result.out_of_range_warnings &&
            result.out_of_range_warnings.length > 0 && (
              <div className="alert-box alert-warning">
                <strong>Out-of-Distribution (OOD) Warning:</strong>
                <ul style={{ marginTop: "6px", paddingLeft: "20px" }}>
                  {result.out_of_range_warnings.map((w, idx) => (
                    <li key={idx}>{w.message}</li>
                  ))}
                </ul>
              </div>
            )}

          <div className="grid-4" style={{ marginBottom: "18px" }}>
            <div
              className={`metric-box ${
                result.prediction === 1 ? "danger" : "success"
              }`}
            >
              <div className="metric-label">Predicted Default Probability (PD)</div>
              <div className="metric-value">{result.pd_pct}%</div>
              <div className="metric-sub">
                Raw PD: {result.pd} (Threshold: {result.threshold})
              </div>
            </div>

            <div
              className={`metric-box ${
                result.prediction === 1 ? "danger" : "success"
              }`}
            >
              <div className="metric-label">Classification Decision</div>
              <div className="metric-value">
                {result.prediction === 1 ? "HIGH DEFAULT RISK" : "PERFORMING"}
              </div>
              <div className="metric-sub">{result.prediction_label}</div>
            </div>

            <div className="metric-box warning">
              <div className="metric-label">Assigned Risk Rating</div>
              <div className="metric-value">Grade {result.risk_grade}</div>
              <div className="metric-sub">{result.risk_tier_label}</div>
            </div>

            <div className="metric-box">
              <div className="metric-label">Expected Credit Loss (ECL)</div>
              <div className="metric-value">
                ${result.ecl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </div>
              <div className="metric-sub">
                EAD: ${result.ead.toLocaleString()} | LGD:{" "}
                {(result.lgd * 100).toFixed(0)}%
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card-title">
              Loan-Level Expected Credit Loss Accounting Breakdown
            </div>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Symbol</th>
                  <th>Computed Value</th>
                  <th>Parameter Source</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Probability of Default</td>
                  <td><code>PD</code></td>
                  <td><strong>{result.pd_pct}%</strong> ({result.pd})</td>
                  <td>Predicted by Combined ML Model (Borrower + Macro)</td>
                </tr>
                <tr>
                  <td>Loss Given Default</td>
                  <td><code>LGD</code></td>
                  <td><strong>{(result.lgd * 100).toFixed(1)}%</strong> ({result.lgd})</td>
                  <td>
                    {result.lgd_is_assumed
                      ? "Assumed Standard Unsecured Retail LGD (45%)"
                      : "User Override"}
                  </td>
                </tr>
                <tr>
                  <td>Exposure at Default</td>
                  <td><code>EAD</code></td>
                  <td><strong>${result.ead.toLocaleString()}</strong></td>
                  <td>
                    {result.ead_is_assumed
                      ? "Assumed 100% of Principal Loan Amount at Origination"
                      : "User Override"}
                  </td>
                </tr>
                <tr>
                  <td><strong>Expected Credit Loss</strong></td>
                  <td><code>ECL = PD &times; LGD &times; EAD</code></td>
                  <td>
                    <strong>
                      ${result.ecl.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </strong>
                  </td>
                  <td>Exact Point-in-Time Expected Monetary Loss</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
