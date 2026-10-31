import React, { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend as RLegend, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import PageShell from "../components/layout/PageShell";
import { Alert, Badge, Card, DataState, Kpi, SimpleTable } from "../components/ui";
import { AXIS_STYLE, ChartFrame, ChartTip, GRID_STROKE, Legend } from "../components/charts/ChartParts";
import { api } from "../api/client";
import { useApi } from "../hooks/useApi";
import { fmtInt, fmtNum, fmtSigned } from "../lib/format";

const MODELS = ["LogisticRegression", "DecisionTree", "RandomForest", "XGBoost"];
const A_COLOR = "var(--c6)";
const B_COLOR = "var(--c2)";

/** Merge two ROC step curves onto one numeric x-axis (FPR). */
function mergeCurves(a = [], b = []) {
  const xs = [...new Set([...a.map((p) => p.fpr), ...b.map((p) => p.fpr)])].sort((x, y) => x - y);
  const at = (curve, x) => {
    let best = null;
    for (const p of curve) if (p.fpr <= x) best = p.tpr;
    return best;
  };
  return xs.map((x) => ({ fpr: x, a: at(a, x), b: at(b, x), diag: x }));
}

function Confusion({ cm, title, tone }) {
  if (!cm) return null;
  const total = cm.tn + cm.fp + cm.fn + cm.tp;
  const cell = (label, v, good) => (
    <td style={{ background: good ? "var(--green-soft)" : "var(--rust-soft)", textAlign: "center" }}>
      <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.6, color: "var(--ink-3)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800 }}>{fmtInt(v)}</div>
      <div className="muted" style={{ fontSize: 12 }}>{total ? ((v / total) * 100).toFixed(1) : 0}%</div>
    </td>
  );
  return (
    <div>
      <h3 style={{ marginBottom: 8, fontSize: 16 }}>
        <Badge tone={tone}>{title}</Badge>
      </h3>
      <div className="table-wrap">
        <table className="dt" style={{ minWidth: 0 }}>
          <thead>
            <tr>
              <th scope="col">Actual \ Predicted</th>
              <th scope="col" style={{ textAlign: "center" }}>Performing</th>
              <th scope="col" style={{ textAlign: "center" }}>Default</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Performing</th>
              {cell("TRUE NEG", cm.tn, true)}
              {cell("FALSE POS", cm.fp, false)}
            </tr>
            <tr>
              <th scope="row">Default</th>
              {cell("FALSE NEG", cm.fn, false)}
              {cell("TRUE POS", cm.tp, true)}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function PerfBody({ data }) {
  const [model, setModel] = useState("XGBoost");
  const A = data.track_a_borrower_only;
  const B = data.track_b_combined;
  const ablation = data.ablation_comparison;
  const a = A.find((m) => m.model_name === model) || A[0];
  const b = B.find((m) => m.model_name === model) || B[0];
  const identical = ablation.filter((r) => r.track_a_auc === r.track_b_auc && r.track_a_f1 === r.track_b_f1).map((r) => r.model_name);
  const roc = useMemo(() => mergeCurves(a?.roc_curve, b?.roc_curve), [a, b]);
  const cal = useMemo(
    () =>
      (b?.calibration_curve || []).map((pt) => ({ pred: pt.prob_pred, true_b: pt.prob_true, ideal: pt.prob_pred })),
    [b]
  );
  const calA = useMemo(() => (a?.calibration_curve || []).map((pt) => ({ pred: pt.prob_pred, true_a: pt.prob_true })), [a]);
  const calMerged = useMemo(() => {
    const m = new Map();
    cal.forEach((p) => m.set(p.pred, { ...p }));
    calA.forEach((p) => m.set(p.pred, { ...(m.get(p.pred) || { pred: p.pred, ideal: p.pred }), true_a: p.true_a }));
    return [...m.values()].sort((x, y) => x.pred - y.pred);
  }, [cal, calA]);
  const best = [...ablation].sort((x, y) => y.track_b_auc - x.track_b_auc)[0];

  const metricCols = [
    { key: "m", header: "Model", strong: true, render: (r) => r.model_name },
    { key: "acc", header: "Accuracy", num: true, render: (r) => fmtNum(r.accuracy) },
    { key: "pre", header: "Precision", num: true, render: (r) => fmtNum(r.precision) },
    { key: "rec", header: "Recall", num: true, render: (r) => fmtNum(r.recall) },
    { key: "f1", header: "F1", num: true, strong: true, render: (r) => fmtNum(r.f1_score) },
    { key: "auc", header: "ROC-AUC", num: true, strong: true, render: (r) => fmtNum(r.roc_auc) },
    { key: "br", header: "Brier", num: true, render: (r) => fmtNum(r.brier_score) },
  ];

  return (
    <>
      {!data.artifacts_loaded && (
        <Alert tone="warn" title="Model not trained.">
          These metrics are the service's reference benchmark values, not results from a trained model. Run{" "}
          <code>python train_pipeline.py</code> in <code>ml_service/</code>.
        </Alert>
      )}

      <div className="grid cols-3">
        <Kpi label="Best Track A model (borrower-only)" value={data.best_borrower_model} sub={`ROC-AUC ${fmtNum(A.find((m) => m.model_name === data.best_borrower_model)?.roc_auc)}`} tone="green" text />
        <Kpi label="Best Track B model (combined)" value={data.best_combined_model} sub={`ROC-AUC ${fmtNum(B.find((m) => m.model_name === data.best_combined_model)?.roc_auc)}`} tone="rust" text />
        <Kpi label="Calibrated classification threshold" value={data.optimal_threshold} sub="Tuned on the chronological validation partition" text />
      </div>

      {identical.length > 0 && (
        <Alert tone="info" title="Why Track A and Track B match for some models.">
          {identical.join(", ")} score identically on both tracks. The training sample was originated in one month, so the macro
          features are constant and carry no signal for these models. Real ablation gains require macro history across several
          months or years.
        </Alert>
      )}

      <Card title="Ablation summary" sub="Track A (borrower-only) vs Track B (borrower + macro)">
        <SimpleTable
          caption="Ablation comparison"
          rowKey={(r) => r.model_name}
          rows={ablation}
          columns={[
            { key: "m", header: "Algorithm", strong: true, render: (r) => r.model_name },
            { key: "a1", header: "AUC · A", num: true, render: (r) => fmtNum(r.track_a_auc) },
            { key: "b1", header: "AUC · B", num: true, strong: true, render: (r) => fmtNum(r.track_b_auc) },
            { key: "g", header: "AUC gain", num: true, render: (r) => <span className={r.auc_gain > 0 ? "neg" : r.auc_gain < 0 ? "pos" : "muted"}>{fmtSigned(r.auc_gain, 4)}</span> },
            { key: "f1a", header: "F1 · A", num: true, render: (r) => fmtNum(r.track_a_f1) },
            { key: "f1b", header: "F1 · B", num: true, strong: true, render: (r) => fmtNum(r.track_b_f1) },
            { key: "ra", header: "Recall · A", num: true, render: (r) => fmtNum(r.track_a_recall) },
            { key: "rb", header: "Recall · B", num: true, render: (r) => fmtNum(r.track_b_recall) },
            { key: "ba", header: "Brier · A", num: true, render: (r) => fmtNum(r.track_a_brier) },
            { key: "bb", header: "Brier · B", num: true, render: (r) => fmtNum(r.track_b_brier) },
          ]}
        />
        <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>
          Brier score: lower is better. Positive AUC gain (green) means macro features helped.
        </p>
      </Card>

      <div className="grid cols-1">
        <Card title="Track A · borrower-only" sub="Held-out test set">
          <SimpleTable caption="Track A metrics" rowKey={(r) => r.model_name} rows={A} columns={metricCols} />
        </Card>
        <Card title="Track B · borrower + macro" sub="Held-out test set">
          <SimpleTable caption="Track B metrics" rowKey={(r) => r.model_name} rows={B} columns={metricCols} />
        </Card>
      </div>

      <Card title="ROC-AUC by algorithm" sub="Higher is better · axis starts at 0.5 (random chance)">
        <Legend items={[{ label: "Track A", color: A_COLOR }, { label: "Track B", color: B_COLOR }]} />
        <ChartFrame height={290} summary={`ROC-AUC per algorithm. Best combined: ${best?.model_name} ${best?.track_b_auc}`}>
          <ResponsiveContainer>
            <BarChart data={ablation} margin={{ top: 8, right: 10, bottom: 22, left: 6 }}>
              <CartesianGrid vertical={false} stroke={GRID_STROKE} />
              <XAxis dataKey="model_name" tick={AXIS_STYLE} interval={0} />
              <YAxis domain={[0.5, 0.8]} tick={AXIS_STYLE} tickFormatter={(v) => v.toFixed(2)} width={48} label={{ value: "ROC-AUC", angle: -90, position: "insideLeft", offset: 10, style: { ...AXIS_STYLE, textAnchor: "middle" } }} />
              <ReferenceLine y={0.5} stroke="#47443d" strokeDasharray="4 4" />
              <Tooltip cursor={{ fill: "rgba(24,23,22,0.05)" }} content={<ChartTip format={(v) => Number(v).toFixed(4)} />} />
              <Bar dataKey="track_a_auc" name="Track A" fill={A_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              <Bar dataKey="track_b_auc" name="Track B" fill={B_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
      </Card>

      <Card
        title={`Model detail · ${model}`}
        actions={
          <div className="toolbar">
            <label htmlFor="perf-model">Algorithm</label>
            <select id="perf-model" value={model} onChange={(e) => setModel(e.target.value)}>
              {MODELS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
        }
      >
        <Legend items={[{ label: "Track A", color: A_COLOR }, { label: "Track B", color: B_COLOR }, { label: "Chance / ideal", color: "#47443d" }]} />
        <div className="grid cols-2" style={{ marginBottom: 0 }}>
          <div>
            <div className="kpi-label" style={{ marginBottom: 6 }}>ROC curve</div>
            <ChartFrame height={300} summary={`ROC curves for ${model}`}>
              <ResponsiveContainer>
                <LineChart data={roc} margin={{ top: 8, right: 14, bottom: 26, left: 6 }}>
                  <CartesianGrid stroke={GRID_STROKE} />
                  <XAxis type="number" dataKey="fpr" domain={[0, 1]} tick={AXIS_STYLE} tickFormatter={(v) => v.toFixed(1)} label={{ value: "False positive rate", position: "insideBottom", offset: -14, style: AXIS_STYLE }} />
                  <YAxis type="number" domain={[0, 1]} tick={AXIS_STYLE} tickFormatter={(v) => v.toFixed(1)} width={58} label={{ value: "True positive rate", angle: -90, position: "insideLeft", offset: 0, style: { ...AXIS_STYLE, textAnchor: "middle" } }} />
                  <Tooltip content={<ChartTip title={(l) => `FPR ${Number(l).toFixed(3)}`} format={(v) => Number(v).toFixed(3)} />} />
                  <Line dataKey="diag" name="Chance" stroke="#47443d" strokeDasharray="5 5" dot={false} strokeWidth={1.4} isAnimationActive={false} />
                  <Line dataKey="a" name="Track A" stroke={A_COLOR} strokeWidth={2.4} dot={false} type="stepAfter" connectNulls isAnimationActive={false} />
                  <Line dataKey="b" name="Track B" stroke={B_COLOR} strokeWidth={2.4} dot={false} type="stepAfter" connectNulls isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartFrame>
          </div>
          <div>
            <div className="kpi-label" style={{ marginBottom: 6 }}>Calibration curve</div>
            <ChartFrame height={300} summary={`Calibration curve for ${model}`}>
              <ResponsiveContainer>
                <LineChart data={calMerged} margin={{ top: 8, right: 14, bottom: 26, left: 6 }}>
                  <CartesianGrid stroke={GRID_STROKE} />
                  <XAxis type="number" dataKey="pred" domain={[0, "dataMax"]} tick={AXIS_STYLE} tickFormatter={(v) => v.toFixed(2)} label={{ value: "Mean predicted probability", position: "insideBottom", offset: -14, style: AXIS_STYLE }} />
                  <YAxis type="number" domain={[0, "auto"]} tick={AXIS_STYLE} tickFormatter={(v) => v.toFixed(2)} width={62} label={{ value: "Observed default rate", angle: -90, position: "insideLeft", offset: 0, style: { ...AXIS_STYLE, textAnchor: "middle" } }} />
                  <Tooltip content={<ChartTip title={(l) => `Predicted ${Number(l).toFixed(3)}`} format={(v) => Number(v).toFixed(3)} />} />
                  <Line dataKey="ideal" name="Perfect calibration" stroke="#47443d" strokeDasharray="5 5" dot={false} strokeWidth={1.4} isAnimationActive={false} />
                  <Line dataKey="true_a" name="Track A" stroke={A_COLOR} strokeWidth={2.2} connectNulls dot={{ r: 3 }} isAnimationActive={false} />
                  <Line dataKey="true_b" name="Track B" stroke={B_COLOR} strokeWidth={2.2} connectNulls dot={{ r: 3 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartFrame>
            <p className="muted" style={{ fontSize: 12.5 }}>
              Each point is a probability bin on a small held-out set, so individual bins are noisy.
            </p>
          </div>
        </div>
      </Card>

      <Card title={`Confusion matrices · ${model}`} sub={`Threshold ${b?.threshold ?? data.optimal_threshold}`}>
        <div className="grid cols-2" style={{ marginBottom: 0 }}>
          <Confusion cm={a?.confusion_matrix} title="Track A · borrower-only" tone="default" />
          <Confusion cm={b?.confusion_matrix} title="Track B · borrower + macro" tone="rust" />
        </div>
      </Card>
    </>
  );
}

export default function Performance() {
  const state = useApi((signal) => api.performance({ signal }), []);
  return (
    <PageShell
      title="Model Performance / Ablation"
      description="Compare model variants and evaluate performance with key metrics. Results come from the held-out test evaluation stored with the serialized ML pipeline."
      note="Better models. Clearer insights."
    >
      <DataState state={state} onRetry={state.reload}>
        {(data) => <PerfBody data={data} />}
      </DataState>
    </PageShell>
  );
}
