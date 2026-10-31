const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export const fmtInt = (v) => (isNum(v) ? Math.round(v).toLocaleString("en-US") : "—");

export const fmtMoney = (v, digits = 0) =>
  isNum(v)
    ? `$${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
    : "—";

/** Compact money for KPI tiles: $1.93M, $176.3K, $950 */
export function fmtMoneyCompact(v) {
  if (!isNum(v)) return "—";
  const abs = Math.abs(v);
  const sign = v < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e4) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

export const fmtPct = (v, digits = 2) => (isNum(v) ? `${v.toFixed(digits)}%` : "—");

/** Fraction (0.1661) -> "16.61%" */
export const fmtFracPct = (v, digits = 2) => (isNum(v) ? `${(v * 100).toFixed(digits)}%` : "—");

export const fmtNum = (v, digits = 4) => (isNum(v) ? v.toFixed(digits) : "—");

export const fmtSigned = (v, digits = 2, suffix = "") =>
  isNum(v) ? `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(digits)}${suffix}` : "—";

export const fmtSignedMoney = (v, digits = 0) =>
  isNum(v)
    ? `${v >= 0 ? "+" : "−"}$${Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`
    : "—";

/** snake_case -> "Snake case" */
export const humanize = (s) =>
  String(s ?? "")
    .replace(/_/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

/** Format an API timestamp string like "2026-10-29 06:45:12" without inventing a time zone. */
export const fmtStamp = (s) => (s ? String(s) : "—");
