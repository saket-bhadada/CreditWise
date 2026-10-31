import React from "react";

/** Shared tooltip. `format` receives (value, entry) and returns a string. */
export function ChartTip({ active, payload, label, format, title }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="chart-tip">
      <div className="tip-title">{title ? title(label, payload) : label}</div>
      {payload.map((p, i) => (
        <div className="row" key={i}>
          <span style={{ color: p.color || p.payload?.fill }}>{p.name}</span>
          <strong>{format ? format(p.value, p) : p.value}</strong>
        </div>
      ))}
    </div>
  );
}

export function Legend({ items }) {
  return (
    <div className="chart-legend" role="list">
      {items.map((it) => (
        <span className="key" role="listitem" key={it.label}>
          <span className="sw" style={{ background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

export const AXIS_STYLE = { fontSize: 12.5, fill: "#47443d" };
export const GRID_STROKE = "#e1dbcc";

/** Wraps a chart with an accessible text summary for screen readers. */
export function ChartFrame({ height = 300, summary, children }) {
  return (
    <div className="chart-box" style={{ height }} role="img" aria-label={summary}>
      {children}
    </div>
  );
}
