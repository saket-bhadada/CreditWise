import React, { useEffect, useState } from "react";
import { api } from "../api";

export default function Overview() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    api
      .getOverview()
      .then((res) => {
        setData(res);
        setError(null);
      })
      .catch((err) => {
        setError(err.message || "Failed to load overview from backend.");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="card">Loading System Overview...</div>;
  }

  if (error) {
    return (
      <div className="alert-box alert-danger">
        <strong>Backend Connection Error:</strong> {error}. Ensure FastAPI (Port 8000) and Express Gateway (Port 5000) are running.
      </div>
    );
  }

  const stats = data.dataset_stats || {};
  const splits = stats.splits || {};
  const catalog = data.features?.catalog || [];

  return (
    <div>
      {!data.artifacts_loaded && (
        <div className="alert-box alert-warning">
          <strong>Model Status Notice:</strong> Serialized bundle{" "}
          <code>saved_models/artifacts.joblib</code> has not been generated yet.
          Run <code>python train_pipeline.py</code> in <code>ml_service/</code> to train all 8 models and serialize Joblib artifacts.
        </div>
      )}

      <div className="grid-4" style={{ marginBottom: "18px" }}>
        <div className="metric-box">
          <div className="metric-label">Dataset Source &amp; Size</div>
          <div className="metric-value">
            {(stats.total_rows || 0).toLocaleString()} Loans
          </div>
          <div className="metric-sub">{stats.source_name}</div>
        </div>

        <div className="metric-box warning">
          <div className="metric-label">Historical Default Rate</div>
          <div className="metric-value">
            {((stats.default_rate || 0) * 100).toFixed(2)}%
          </div>
          <div className="metric-sub">
            Period: {stats.date_min} to {stats.date_max}
          </div>
        </div>

        <div className="metric-box success">
          <div className="metric-label">Active Combined Model</div>
          <div className="metric-value">{data.active_combined_model}</div>
          <div className="metric-sub">
            Validation Threshold: {data.optimal_threshold}
          </div>
        </div>

        <div className="metric-box">
          <div className="metric-label">Artifact Bundle Status</div>
          <div className="metric-value">
            {data.artifacts_loaded ? "Joblib Loaded" : "Pre-Training"}
          </div>
          <div className="metric-sub">{data.trained_timestamp}</div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            Chronological Train / Validation / Test Split (Zero Time Leakage)
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Partition</th>
                <th>Split Share</th>
                <th>Loan Count</th>
                <th>Date Period (issue_d)</th>
                <th>Default Rate</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Train Set</strong></td>
                <td>70%</td>
                <td>{(splits.train?.rows || 0).toLocaleString()}</td>
                <td>
                  {splits.train?.date_start} &rarr; {splits.train?.date_end}
                </td>
                <td>{((splits.train?.default_rate || 0) * 100).toFixed(2)}%</td>
              </tr>
              <tr>
                <td><strong>Validation Set</strong></td>
                <td>15%</td>
                <td>{(splits.validation?.rows || 0).toLocaleString()}</td>
                <td>
                  {splits.validation?.date_start} &rarr;{" "}
                  {splits.validation?.date_end}
                </td>
                <td>
                  {((splits.validation?.default_rate || 0) * 100).toFixed(2)}%
                </td>
              </tr>
              <tr>
                <td><strong>Test Set (Held-Out)</strong></td>
                <td>15%</td>
                <td>{(splits.test?.rows || 0).toLocaleString()}</td>
                <td>
                  {splits.test?.date_start} &rarr; {splits.test?.date_end}
                </td>
                <td>{((splits.test?.default_rate || 0) * 100).toFixed(2)}%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title">Quantitative System Methodology</div>
          <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
            <div>
              <strong>1. Zero Post-Origination Leakage:</strong>{" "}
              {data.methodology?.leakage_prevention}
            </div>
            <div>
              <strong>2. Time-Aware Partitioning:</strong>{" "}
              {data.methodology?.chronological_splitting}
            </div>
            <div>
              <strong>3. Expected Credit Loss Accounting:</strong>{" "}
              <code>{data.methodology?.ecl_formula}</code>
            </div>
            <div>
              <strong>4. Explainability Scope:</strong>{" "}
              {data.methodology?.shap_disclaimer}
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          Feature Dictionary &amp; Historical Training Bounds (Track A vs. Track B)
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Feature Name</th>
              <th>Category</th>
              <th>Data Type</th>
              <th>Train Min</th>
              <th>Train Median</th>
              <th>Train Max</th>
            </tr>
          </thead>
          <tbody>
            {catalog.map((feat) => (
              <tr key={feat.name}>
                <td>
                  <code>{feat.name}</code>
                </td>
                <td>
                  <span
                    className={`badge ${
                      feat.category.includes("Macro")
                        ? "badge-macro"
                        : "badge-borrower"
                    }`}
                  >
                    {feat.category}
                  </span>
                </td>
                <td>{feat.type}</td>
                <td>
                  {feat.bounds?.min !== undefined ? feat.bounds.min : "N/A"}
                </td>
                <td>
                  {feat.bounds?.median !== undefined
                    ? feat.bounds.median
                    : "Categorical"}
                </td>
                <td>
                  {feat.bounds?.max !== undefined ? feat.bounds.max : "N/A"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
