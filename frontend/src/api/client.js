/**
 * CreditWise API client - the single place that talks to the backend.
 *
 * Base URL is configurable: VITE_API_BASE_URL (default "/api", proxied by Vite in dev).
 * Works against either the Node/Express gateway (:5000) or FastAPI (:8000 directly);
 * both expose the same /api/* routes.
 *
 * Contract (verified against ml_service/app.py and backend/server.js):
 *   GET  /health              -> { gateway?, ml_service? | status, artifacts_loaded }
 *   GET  /api/overview        -> system, dataset, model and feature metadata
 *   POST /api/predict         -> PD, grade, ECL for one borrower
 *   POST /api/explain         -> local + global SHAP
 *   POST /api/ecl             -> loan-level ECL, LGD sensitivity, portfolio ECL
 *   POST /api/stress          -> portfolio impact under a macro scenario
 *   GET  /api/portfolio?purpose=ALL
 *   GET  /api/performance     -> Track A / Track B model evaluation
 *
 * This client never fabricates data: every failure becomes an ApiError that the UI
 * must render as an error state.
 */
import axios from "axios";

const RAW_BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";
export const API_BASE = String(RAW_BASE).replace(/\/+$/, "");
const TIMEOUT_MS = Number(import.meta.env.VITE_API_TIMEOUT_MS) || 20000;

const http = axios.create({ timeout: TIMEOUT_MS, headers: { Accept: "application/json" } });

export class ApiError extends Error {
  constructor({ kind, message, status = null, endpoint = "", url = "", detail = null, hint = "" }) {
    super(message);
    this.name = "ApiError";
    this.kind = kind; // NETWORK | TIMEOUT | HTTP | PARSE | ABORTED
    this.status = status;
    this.endpoint = endpoint;
    this.url = url;
    this.detail = detail;
    this.hint = hint;
  }
}

const START_HINT =
  "Start the ML service (cd ml_service && python app.py) and the gateway (cd backend && npm start), " +
  "or point VITE_API_BASE_URL at a running API.";

function healthUrl() {
  if (/^https?:\/\//i.test(API_BASE)) return `${new URL(API_BASE).origin}/health`;
  return "/health";
}

function describeValidation(detail) {
  // FastAPI/Pydantic 422: { detail: [{ loc: [...], msg: "..." }] }
  if (Array.isArray(detail)) {
    return detail
      .map((d) => `${(d.loc || []).filter((p) => p !== "body").join(".") || "request"}: ${d.msg}`)
      .join("; ");
  }
  return null;
}

function toApiError(err, { endpoint, url }) {
  if (axios.isCancel(err)) {
    return new ApiError({ kind: "ABORTED", message: "Request cancelled.", endpoint, url });
  }
  if (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT") {
    return new ApiError({
      kind: "TIMEOUT",
      message: `The request timed out after ${Math.round(TIMEOUT_MS / 1000)}s.`,
      endpoint,
      url,
      hint: "The backend is reachable but slow or stuck. Check the ml_service logs.",
    });
  }
  if (err.response) {
    const { status, data } = err.response;
    const gatewayDetail = data && typeof data === "object" ? data.detail ?? data.message : null;
    const validation = describeValidation(gatewayDetail?.detail ?? gatewayDetail ?? data?.detail);
    let message;
    if (validation) message = `The backend rejected the input (${validation}).`;
    else if (status === 503) message = "The gateway is running but the Python ML service is unreachable.";
    else if (status === 502 || status === 504 || (status === 500 && (data === "" || data == null)))
      message = "The API gateway is not responding (the dev proxy could not reach it).";
    else if (status === 404) message = `Endpoint not found (${endpoint}). Is VITE_API_BASE_URL correct?`;
    else if (status >= 500) message = `The backend returned a server error (HTTP ${status}).`;
    else message = `The backend returned HTTP ${status}.`;
    return new ApiError({
      kind: "HTTP",
      message,
      status,
      endpoint,
      url,
      detail: data,
      hint: status >= 500 ? START_HINT : "",
    });
  }
  return new ApiError({
    kind: "NETWORK",
    message: "Cannot reach the CreditWise API (network error).",
    endpoint,
    url,
    detail: err.message,
    hint: START_HINT,
  });
}

/** Require top-level keys so a wrong/HTML/partial response fails loudly instead of rendering garbage. */
function assertShape(data, keys, endpoint, url) {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    throw new ApiError({
      kind: "PARSE",
      message: `Unexpected response from ${endpoint}: expected a JSON object.`,
      endpoint,
      url,
      detail: typeof data === "string" ? data.slice(0, 120) : data,
      hint: "If this looks like HTML, the dev proxy or VITE_API_BASE_URL is pointing at the frontend instead of the API.",
    });
  }
  const missing = keys.filter((k) => !(k in data));
  if (missing.length) {
    throw new ApiError({
      kind: "PARSE",
      message: `Response from ${endpoint} is missing field(s): ${missing.join(", ")}.`,
      endpoint,
      url,
      detail: Object.keys(data),
    });
  }
  return data;
}

async function call({ method, path, absolute = false, data, params, signal, keys = [] }) {
  const url = absolute ? path : `${API_BASE}${path}`;
  const endpoint = `${method} ${path}`;
  try {
    const res = await http.request({ method, url, data, params, signal });
    return assertShape(res.data, keys, endpoint, url);
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw toApiError(err, { endpoint, url });
  }
}

export const api = {
  health: (opts = {}) => call({ method: "GET", path: healthUrl(), absolute: true, ...opts }),

  getOverview: (opts = {}) =>
    call({
      method: "GET",
      path: "/overview",
      keys: ["artifacts_loaded", "dataset_stats", "features", "methodology", "risk_bands"],
      ...opts,
    }),

  predict: (borrower, opts = {}) =>
    call({
      method: "POST",
      path: "/predict",
      data: borrower,
      keys: ["pd", "pd_pct", "risk_grade", "ecl", "out_of_range_warnings"],
      ...opts,
    }),

  explain: (borrower, opts = {}) =>
    call({
      method: "POST",
      path: "/explain",
      data: borrower,
      keys: ["prediction", "local_shap", "global_shap", "base_value_log_odds"],
      ...opts,
    }),

  ecl: (body, opts = {}) =>
    call({
      method: "POST",
      path: "/ecl",
      data: body,
      keys: ["loan_level", "lgd_sensitivity", "portfolio_summary", "by_risk_grade"],
      ...opts,
    }),

  stress: (body, opts = {}) =>
    call({
      method: "POST",
      path: "/stress",
      data: body,
      keys: ["portfolio_impact", "segment_comparison", "stressed_macro", "baseline_macro"],
      ...opts,
    }),

  portfolio: (purpose = "ALL", opts = {}) =>
    call({
      method: "GET",
      path: "/portfolio",
      params: { purpose },
      keys: ["portfolio_summary", "by_risk_grade", "by_purpose", "pd_histogram", "loans"],
      ...opts,
    }),

  performance: (opts = {}) =>
    call({
      method: "GET",
      path: "/performance",
      keys: ["track_a_borrower_only", "track_b_combined", "ablation_comparison"],
      ...opts,
    }),
};
