import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { api } from "../api";

export default function Explainability({ borrowerInputs }) {
  const [expData, setExpData] = useState(null);
  const [stressCompare, setStressCompare] = useState(null);
  const [stressScenario, setStressScenario] = useState("downturn");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadExplanations = (scenarioKey) => {
    setLoading(true);
    Promise.all([
      api.explainBorrower(borrowerInputs),
      api.runStressSimulation({
        scenario: scenarioKey,
        borrower: borrowerInputs,
      }),
    ])
      .then(([explainRes, stressRes]) => {
        setExpData(explainRes);
        setStressCompare(stressRes.borrower_comparison);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || "Failed to compute SHAP explanations.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadExplanations(stressScenario);
  }, [borrowerInputs, stressScenario]);

  if (loading) {
    return <div className="card">Computing Global &amp; Local SHAP Attributions...</div>;
  }

  if (error) {
    return <div className="alert-box alert-danger">{error}</div>;
  }

  const globalShap = expData?.global_shap || [];
  const localShap = expData?.local_shap || [];
  const catSummary = expData?.category_summary || {
    borrower_importance_pct: 80,
    macroeconomic_importance_pct: 20,
  };
  const shapShifts = stressCompare?.shap_shifts || [];

  return (
    <div>
      <div className="alert-box alert-warning">
        <strong>Methodological Disclaimer (Non-Causality):</strong>{" "}
        {expData?.disclaimer ||
          "SHAP values explain model behavior and feature attributions; they do not establish causality."}
      </div>

      <div className="grid-3" style={{ marginBottom: "18px" }}>
        <div className="metric-box">
          <div className="metric-label">Borrower Financial Feature Share</div>
          <div className="metric-value">
            {catSummary.borrower_importance_pct}%
          </div>
          <div className="metric-sub">
            Share of total global mean(|SHAP|) importance
          </div>
        </div>

        <div className="metric-box warning">
          <div className="metric-label">Macroeconomic Feature Share</div>
          <div className="metric-value">
            {catSummary.macroeconomic_importance_pct}%
          </div>
          <div className="metric-sub">
            UNRATE, FEDFUNDS &amp; Inflation combined impact
          </div>
        </div>

        <div className="metric-box">
          <div className="metric-label">Active Borrower Predicted PD</div>
          <div className="metric-value">
            {expData?.prediction?.pd_pct}% (Grade {expData?.prediction?.risk_grade})
          </div>
          <div className="metric-sub">
            Base Log-Odds: {expData?.base_value_log_odds}
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            Global Feature Importance: Mean(|SHAP|) — Borrower vs. Macroeconomic
          </div>
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <BarChart
                data={globalShap}
                layout="vertical"
                margin={{ top: 10, right: 25, left: 60, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="feature" type="category" width={120} />
                <Tooltip
                  formatter={(val, name, props) => [
                    `${val} (${props.payload.importance_pct}%)`,
                    `Mean |SHAP| [${props.payload.category}]`,
                  ]}
                />
                <Bar dataKey="mean_abs_shap" name="Mean |SHAP|">
                  {globalShap.map((entry, index) => (
                    <Cell
                      key={`cell-g-${index}`}
                      fill={
                        entry.category === "Macroeconomic"
                          ? "#2563eb"
                          : "#475569"
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "6px" }}>
            Blue bars represent <strong>Macroeconomic Indicators</strong>; Slate bars represent <strong>Borrower Financial Features</strong>.
          </div>
        </div>

        <div className="card">
          <div className="card-title">
            Individual Borrower Local SHAP Contributions (Log-Odds Impact)
          </div>
          <div style={{ width: "100%", height: 340 }}>
            <ResponsiveContainer>
              <BarChart
                data={localShap}
                layout="vertical"
                margin={{ top: 10, right: 25, left: 60, bottom: 10 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="feature" type="category" width={120} />
                <ReferenceLine x={0} stroke="#0f172a" />
                <Tooltip
                  formatter={(val, name, props) => [
                    val,
                    `${props.payload.direction} (Value: ${props.payload.feature_value})`,
                  ]}
                />
                <Bar dataKey="shap_value" name="Local SHAP Attribution">
                  {localShap.map((entry, index) => (
                    <Cell
                      key={`cell-l-${index}`}
                      fill={entry.shap_value >= 0 ? "#dc2626" : "#16a34a"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", marginTop: "6px" }}>
            Red bars (+) push predicted default probability <strong>higher</strong>; Green bars (&minus;) push default probability <strong>lower</strong>.
          </div>
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
            Individual Borrower SHAP Attribution Table: Baseline vs. Stressed Macroeconomic Conditions
          </span>
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 600 }}>
              Compare Against Stress Scenario:
            </span>
            <select
              value={stressScenario}
              onChange={(e) => setStressScenario(e.target.value)}
              style={{ padding: "5px 8px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
            >
              <option value="downturn">Economic Downturn</option>
              <option value="severe">Severe Adverse Scenario</option>
            </select>
          </div>
        </div>

        <table className="data-table">
          <thead>
            <tr>
              <th>Feature</th>
              <th>Category</th>
              <th>Borrower Input Value</th>
              <th>Baseline SHAP</th>
              <th>Stressed SHAP ({stressScenario.toUpperCase()})</th>
              <th>SHAP Shift (&Delta;)</th>
              <th>Risk Attribution Direction</th>
            </tr>
          </thead>
          <tbody>
            {shapShifts.map((row) => {
              const localMatch = localShap.find((l) => l.feature === row.feature);
              return (
                <tr key={row.feature}>
                  <td>
                    <code>{row.feature}</code>
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        row.category === "Macroeconomic"
                          ? "badge-macro"
                          : "badge-borrower"
                      }`}
                    >
                      {row.category}
                    </span>
                  </td>
                  <td>
                    {localMatch?.feature_value !== undefined
                      ? String(localMatch.feature_value)
                      : "-"}
                  </td>
                  <td>{row.baseline_shap}</td>
                  <td>
                    <strong>{row.stressed_shap}</strong>
                  </td>
                  <td
                    style={{
                      color:
                        row.shap_delta > 0
                          ? "#dc2626"
                          : row.shap_delta < 0
                          ? "#16a34a"
                          : "#475569",
                      fontWeight: row.shap_delta !== 0 ? 700 : 400,
                    }}
                  >
                    {row.shap_delta > 0 ? `+${row.shap_delta}` : row.shap_delta}
                  </td>
                  <td>
                    <span
                      className={`badge ${
                        row.stressed_shap >= 0 ? "badge-high" : "badge-low"
                      }`}
                    >
                      {row.stressed_shap >= 0
                        ? "Increases Default Risk (+)"
                        : "Decreases Default Risk (-)"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
