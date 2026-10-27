import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { api } from "../api";

const SCENARIO_PRESETS = {
  baseline: {
    label: "1. Baseline Scenario",
    unemployment_rate: 5.0,
    fed_funds_rate: 2.0,
    inflation_rate: 2.2,
  },
  downturn: {
    label: "2. Economic Downturn",
    unemployment_rate: 8.2,
    fed_funds_rate: 4.5,
    inflation_rate: 5.0,
  },
  severe: {
    label: "3. Severe Adverse Scenario",
    unemployment_rate: 11.0,
    fed_funds_rate: 6.0,
    inflation_rate: 7.5,
  },
};

export default function StressSimulator({ borrowerInputs }) {
  const [selectedScenario, setSelectedScenario] = useState("downturn");
  const [customMacro, setCustomMacro] = useState(SCENARIO_PRESETS.downturn);
  const [simResult, setSimResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const runSimulation = (scenarioKey, macroOverrides = null) => {
    setLoading(true);
    const payload = {
      scenario: scenarioKey,
      custom_macro: macroOverrides,
      borrower: borrowerInputs,
    };
    api
      .runStressSimulation(payload)
      .then((res) => {
        setSimResult(res);
        setError(null);
      })
      .catch((err) => setError(err.message || "Stress simulation failed."))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    runSimulation("downturn", null);
  }, []);

  const handleSelectPreset = (key) => {
    setSelectedScenario(key);
    const p = SCENARIO_PRESETS[key];
    setCustomMacro({
      unemployment_rate: p.unemployment_rate,
      fed_funds_rate: p.fed_funds_rate,
      inflation_rate: p.inflation_rate,
    });
    runSimulation(key, null);
  };

  const handleCustomChange = (field, val) => {
    setSelectedScenario("custom");
    setCustomMacro((prev) => ({
      ...prev,
      [field]: parseFloat(val) || 0,
    }));
  };

  const handleRunCustom = (e) => {
    e.preventDefault();
    runSimulation("custom", customMacro);
  };

  if (loading && !simResult) {
    return <div className="card">Running Macroeconomic Portfolio Stress Test...</div>;
  }

  if (error) {
    return <div className="alert-box alert-danger">{error}</div>;
  }

  const impact = simResult?.portfolio_impact || {};
  const segments = simResult?.segment_comparison || [];
  const oodWarnings = simResult?.out_of_range_warnings || [];

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
          <span>Macroeconomic Stress-Testing Scenario Selector</span>
          <div style={{ display: "flex", gap: "8px" }}>
            {Object.entries(SCENARIO_PRESETS).map(([key, cfg]) => (
              <button
                key={key}
                type="button"
                className={`btn ${
                  selectedScenario === key ? "" : "btn-secondary"
                }`}
                onClick={() => handleSelectPreset(key)}
              >
                {cfg.label}
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleRunCustom}>
          <div className="form-grid" style={{ alignItems: "end" }}>
            <div className="form-group">
              <label>
                Unemployment Rate (UNRATE %):{" "}
                <strong>{customMacro.unemployment_rate}%</strong>
              </label>
              <input
                type="range"
                min="3.0"
                max="15.0"
                step="0.2"
                value={customMacro.unemployment_rate}
                onChange={(e) =>
                  handleCustomChange("unemployment_rate", e.target.value)
                }
              />
              <input
                type="number"
                step="0.1"
                value={customMacro.unemployment_rate}
                onChange={(e) =>
                  handleCustomChange("unemployment_rate", e.target.value)
                }
                style={{ marginTop: "4px" }}
              />
            </div>

            <div className="form-group">
              <label>
                Federal Funds Rate (FEDFUNDS %):{" "}
                <strong>{customMacro.fed_funds_rate}%</strong>
              </label>
              <input
                type="range"
                min="0.0"
                max="9.0"
                step="0.25"
                value={customMacro.fed_funds_rate}
                onChange={(e) =>
                  handleCustomChange("fed_funds_rate", e.target.value)
                }
              />
              <input
                type="number"
                step="0.1"
                value={customMacro.fed_funds_rate}
                onChange={(e) =>
                  handleCustomChange("fed_funds_rate", e.target.value)
                }
                style={{ marginTop: "4px" }}
              />
            </div>

            <div className="form-group">
              <label>
                CPI Inflation Rate (YoY %):{" "}
                <strong>{customMacro.inflation_rate}%</strong>
              </label>
              <input
                type="range"
                min="-1.0"
                max="12.0"
                step="0.2"
                value={customMacro.inflation_rate}
                onChange={(e) =>
                  handleCustomChange("inflation_rate", e.target.value)
                }
              />
              <input
                type="number"
                step="0.1"
                value={customMacro.inflation_rate}
                onChange={(e) =>
                  handleCustomChange("inflation_rate", e.target.value)
                }
                style={{ marginTop: "4px" }}
              />
            </div>

            <div>
              <button type="submit" className="btn" disabled={loading}>
                {loading ? "Simulating..." : "Run Custom Stress Shock"}
              </button>
            </div>
          </div>
        </form>
      </div>

      {oodWarnings.length > 0 && (
        <div className="alert-box alert-danger">
          <strong>
            Out-of-Distribution (OOD) Historical Range Alert ({oodWarnings.length} Variable(s) Flagged):
          </strong>
          <ul style={{ marginTop: "6px", paddingLeft: "20px" }}>
            {oodWarnings.map((w, idx) => (
              <li key={idx}>
                <strong>{w.feature}</strong> = {w.input_value}% is {w.direction}{" "}
                observed in historical training data [{w.train_min}%,{" "}
                {w.train_max}%]. Predictions represent regime extrapolation.
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="alert-box alert-info">
        <strong>Structural Model Scope Limitation:</strong>{" "}
        {simResult?.methodology_limitation_note}
      </div>

      <div className="grid-4" style={{ marginBottom: "18px" }}>
        <div className="metric-box">
          <div className="metric-label">Baseline vs. Stressed Mean PD</div>
          <div className="metric-value">
            {impact.baseline_avg_pd_pct}% &rarr; {impact.stressed_avg_pd_pct}%
          </div>
          <div className="metric-sub">
            PD Shift: {impact.delta_pd_pct_points >= 0 ? "+" : ""}
            {impact.delta_pd_pct_points} percentage points
          </div>
        </div>

        <div className="metric-box">
          <div className="metric-label">Baseline Portfolio ECL</div>
          <div className="metric-value">
            ${(impact.baseline_total_ecl || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="metric-sub">
            Across {impact.loan_count} Held-Out Test Loans
          </div>
        </div>

        <div className="metric-box danger">
          <div className="metric-label">Stressed Portfolio ECL</div>
          <div className="metric-value">
            ${(impact.stressed_total_ecl || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="metric-sub">{simResult?.scenario_name}</div>
        </div>

        <div
          className={`metric-box ${
            impact.delta_ecl > 0 ? "danger" : "success"
          }`}
        >
          <div className="metric-label">Net Portfolio Loss Shock (&Delta; ECL)</div>
          <div className="metric-value">
            {impact.delta_ecl >= 0 ? "+" : ""}$
            {(impact.delta_ecl || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </div>
          <div className="metric-sub">
            Percentage Change:{" "}
            <strong>
              {impact.pct_change_ecl >= 0 ? "+" : ""}
              {impact.pct_change_ecl}%
            </strong>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            Portfolio Expected Credit Loss by Segment: Baseline vs. Stressed ($)
          </div>
          <div style={{ width: "100%", height: 320 }}>
            <ResponsiveContainer>
              <BarChart
                data={segments}
                margin={{ top: 10, right: 20, left: 20, bottom: 30 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="purpose"
                  angle={-15}
                  textAnchor="end"
                  interval={0}
                />
                <YAxis />
                <Tooltip
                  formatter={(v) => `$${Number(v).toLocaleString()}`}
                />
                <Legend />
                <Bar
                  dataKey="baseline_ecl"
                  name="Baseline ECL ($)"
                  fill="#475569"
                />
                <Bar
                  dataKey="stressed_ecl"
                  name="Stressed ECL ($)"
                  fill="#dc2626"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            Side-by-Side Segment Stress Comparison Table
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Loan Purpose</th>
                <th>Loans</th>
                <th>Base PD</th>
                <th>Stress PD</th>
                <th>Baseline ECL</th>
                <th>Stressed ECL</th>
                <th>Loss Change (%)</th>
              </tr>
            </thead>
            <tbody>
              {segments.map((seg) => (
                <tr key={seg.purpose}>
                  <td>
                    <strong>{seg.purpose}</strong>
                  </td>
                  <td>{seg.loan_count}</td>
                  <td>{seg.baseline_avg_pd_pct}%</td>
                  <td>{seg.stressed_avg_pd_pct}%</td>
                  <td>${seg.baseline_ecl.toLocaleString()}</td>
                  <td>
                    <strong>${seg.stressed_ecl.toLocaleString()}</strong>
                  </td>
                  <td
                    style={{
                      color: seg.delta_ecl > 0 ? "#dc2626" : "#16a34a",
                      fontWeight: 700,
                    }}
                  >
                    {seg.pct_change >= 0 ? `+${seg.pct_change}%` : `${seg.pct_change}%`}
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
