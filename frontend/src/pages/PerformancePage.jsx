import React, { useEffect, useState } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { api } from "../api";

export default function PerformancePage() {
  const [perfData, setPerfData] = useState(null);
  const [selectedModel, setSelectedModel] = useState("XGBoost");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    api
      .getPerformance()
      .then((res) => {
        setPerfData(res);
        setError(null);
      })
      .catch((err) =>
        setError(err.message || "Failed to load model evaluation metrics.")
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="card">Loading Ablation Study &amp; Model Metrics...</div>;
  }

  if (error) {
    return <div className="alert-box alert-danger">{error}</div>;
  }

  const trackA = perfData?.track_a_borrower_only || [];
  const trackB = perfData?.track_b_combined || [];
  const ablation = perfData?.ablation_comparison || [];

  const activeA =
    trackA.find((m) => m.model_name === selectedModel) || trackA[0] || {};
  const activeB =
    trackB.find((m) => m.model_name === selectedModel) || trackB[0] || {};

  // Build calibration chart series combining Track A, Track B, and Ideal Diagonal
  const calPoints = (activeB.calibration_curve || []).map((pt, idx) => {
    const ptA = (activeA.calibration_curve || [])[idx] || {};
    return {
      bin: `Bin ${pt.bin}`,
      prob_pred: pt.prob_pred,
      ideal: pt.prob_pred,
      track_b_true: pt.prob_true,
      track_a_true: ptA.prob_true !== undefined ? ptA.prob_true : pt.prob_true,
    };
  });

  return (
    <div>
      <div className="grid-4" style={{ marginBottom: "18px" }}>
        <div className="metric-box success">
          <div className="metric-label">Best Combined Model (Track B)</div>
          <div className="metric-value">{perfData.best_combined_model}</div>
          <div className="metric-sub">Borrower + Macroeconomic Features</div>
        </div>

        <div className="metric-box">
          <div className="metric-label">Best Baseline Model (Track A)</div>
          <div className="metric-value">{perfData.best_borrower_model}</div>
          <div className="metric-sub">Borrower-Only Features</div>
        </div>

        <div className="metric-box warning">
          <div className="metric-label">Selected Decision Threshold</div>
          <div className="metric-value">{perfData.optimal_threshold}</div>
          <div className="metric-sub">Calibrated on Validation Set</div>
        </div>

        <div className="metric-box">
          <div className="metric-label">Metrics Source</div>
          <div className="metric-value">
            {perfData.artifacts_loaded ? "Trained Joblib" : "Benchmark Reference"}
          </div>
          <div className="metric-sub">4 Models &times; 2 Feature Tracks</div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          Ablation Study Summary: Track A (Borrower-Only) vs. Track B (Borrower + Macroeconomic)
        </div>
        <table className="data-table">
          <thead>
            <tr>
              <th>Algorithm</th>
              <th>Track A ROC-AUC</th>
              <th>Track B ROC-AUC</th>
              <th>ROC-AUC Gain (&Delta;)</th>
              <th>Track A F1 (Defaulters)</th>
              <th>Track B F1 (Defaulters)</th>
              <th>Track A Recall</th>
              <th>Track B Recall</th>
              <th>Track A Brier</th>
              <th>Track B Brier (Lower=Better)</th>
            </tr>
          </thead>
          <tbody>
            {ablation.map((row) => (
              <tr key={row.model_name}>
                <td>
                  <strong>{row.model_name}</strong>
                </td>
                <td>{row.track_a_auc}</td>
                <td>
                  <strong>{row.track_b_auc}</strong>
                </td>
                <td
                  style={{
                    color: row.auc_gain >= 0 ? "#16a34a" : "#dc2626",
                    fontWeight: 700,
                  }}
                >
                  {row.auc_gain >= 0 ? `+${row.auc_gain}` : row.auc_gain}
                </td>
                <td>{row.track_a_f1}</td>
                <td>
                  <strong>{row.track_b_f1}</strong>
                </td>
                <td>{(row.track_a_recall * 100).toFixed(1)}%</td>
                <td>
                  <strong>{(row.track_b_recall * 100).toFixed(1)}%</strong>
                </td>
                <td>{row.track_a_brier}</td>
                <td>
                  <strong>{row.track_b_brier}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            Track A (Borrower-Only Baseline) — Full Evaluation Metrics
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Accuracy</th>
                <th>Precision</th>
                <th>Recall (Default)</th>
                <th>F1-Score</th>
                <th>ROC-AUC</th>
                <th>Brier</th>
              </tr>
            </thead>
            <tbody>
              {trackA.map((m) => (
                <tr key={m.model_name}>
                  <td><strong>{m.model_name}</strong></td>
                  <td>{(m.accuracy * 100).toFixed(2)}%</td>
                  <td>{(m.precision * 100).toFixed(2)}%</td>
                  <td>{(m.recall * 100).toFixed(2)}%</td>
                  <td>{m.f1_score}</td>
                  <td><strong>{m.roc_auc}</strong></td>
                  <td>{m.brier_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <div className="card-title">
            Track B (Borrower + Macroeconomic Combined) — Full Evaluation Metrics
          </div>
          <table className="data-table">
            <thead>
              <tr>
                <th>Model</th>
                <th>Accuracy</th>
                <th>Precision</th>
                <th>Recall (Default)</th>
                <th>F1-Score</th>
                <th>ROC-AUC</th>
                <th>Brier</th>
              </tr>
            </thead>
            <tbody>
              {trackB.map((m) => (
                <tr key={m.model_name}>
                  <td><strong>{m.model_name}</strong></td>
                  <td>{(m.accuracy * 100).toFixed(2)}%</td>
                  <td>{(m.precision * 100).toFixed(2)}%</td>
                  <td>{(m.recall * 100).toFixed(2)}%</td>
                  <td>{m.f1_score}</td>
                  <td><strong>{m.roc_auc}</strong></td>
                  <td>{m.brier_score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">
            ROC-AUC Comparison Across Algorithms: Track A vs. Track B
          </div>
          <div style={{ width: "100%", height: 290 }}>
            <ResponsiveContainer>
              <BarChart data={ablation}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="model_name" />
                <YAxis domain={[0.6, 0.82]} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="track_a_auc"
                  name="Track A: Borrower-Only AUC"
                  fill="#64748b"
                />
                <Bar
                  dataKey="track_b_auc"
                  name="Track B: Borrower + Macro AUC"
                  fill="#2563eb"
                />
              </BarChart>
            </ResponsiveContainer>
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
            <span>Probability Calibration Curve ({selectedModel})</span>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              style={{ padding: "4px 8px", borderRadius: "4px", border: "1px solid #cbd5e1" }}
            >
              <option value="LogisticRegression">LogisticRegression</option>
              <option value="DecisionTree">DecisionTree</option>
              <option value="RandomForest">RandomForest</option>
              <option value="XGBoost">XGBoost</option>
            </select>
          </div>
          <div style={{ width: "100%", height: 290 }}>
            <ResponsiveContainer>
              <LineChart data={calPoints}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="prob_pred" name="Predicted Probability" />
                <YAxis domain={[0, 0.8]} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="ideal"
                  name="Perfect Calibration (Diagonal)"
                  stroke="#94a3b8"
                  strokeDasharray="5 5"
                />
                <Line
                  type="monotone"
                  dataKey="track_a_true"
                  name="Track A Empirical Default Rate"
                  stroke="#64748b"
                  strokeWidth={2}
                />
                <Line
                  type="monotone"
                  dataKey="track_b_true"
                  name="Track B Empirical Default Rate"
                  stroke="#2563eb"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          Held-Out Test Set Confusion Matrices ({selectedModel}: Track A vs. Track B)
        </div>
        <div className="grid-2">
          <div>
            <h4 style={{ marginBottom: "8px", color: "#475569" }}>
              Track A (Borrower-Only) — {selectedModel}
            </h4>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Actual \ Predicted</th>
                  <th>Predicted Performing (0)</th>
                  <th>Predicted Default (1)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Actual Performing (0)</strong></td>
                  <td>
                    True Negative (TN):{" "}
                    <strong>{activeA.confusion_matrix?.tn}</strong>
                  </td>
                  <td>
                    False Positive (FP):{" "}
                    <strong>{activeA.confusion_matrix?.fp}</strong>
                  </td>
                </tr>
                <tr>
                  <td><strong>Actual Default (1)</strong></td>
                  <td>
                    False Negative (FN):{" "}
                    <strong>{activeA.confusion_matrix?.fn}</strong>
                  </td>
                  <td>
                    True Positive (TP):{" "}
                    <strong>{activeA.confusion_matrix?.tp}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div>
            <h4 style={{ marginBottom: "8px", color: "#1e40af" }}>
              Track B (Borrower + Macro) — {selectedModel}
            </h4>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Actual \ Predicted</th>
                  <th>Predicted Performing (0)</th>
                  <th>Predicted Default (1)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td><strong>Actual Performing (0)</strong></td>
                  <td>
                    True Negative (TN):{" "}
                    <strong>{activeB.confusion_matrix?.tn}</strong>
                  </td>
                  <td>
                    False Positive (FP):{" "}
                    <strong>{activeB.confusion_matrix?.fp}</strong>
                  </td>
                </tr>
                <tr>
                  <td><strong>Actual Default (1)</strong></td>
                  <td>
                    False Negative (FN):{" "}
                    <strong>{activeB.confusion_matrix?.fn}</strong>
                  </td>
                  <td>
                    True Positive (TP):{" "}
                    <strong>{activeB.confusion_matrix?.tp}</strong>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
