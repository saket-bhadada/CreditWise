/**
 * API Client for CreditWise Frontend.
 * Connects to the Node.js/Express Gateway (http://localhost:5000/api)
 * with automatic fallback to FastAPI (http://localhost:8000/api).
 */

import axios from "axios";

const GATEWAY_BASE = "http://localhost:5000/api";
const DIRECT_ML_BASE = "http://localhost:8000/api";

async function requestWithFallback(method, path, data = null, params = null) {
  try {
    const res = await axios({
      method,
      url: `${GATEWAY_BASE}${path}`,
      data,
      params,
      timeout: 20000,
    });
    return res.data;
  } catch (gatewayErr) {
    // Fallback to direct FastAPI port 8000 if Node gateway is not running
    const res = await axios({
      method,
      url: `${DIRECT_ML_BASE}${path}`,
      data,
      params,
      timeout: 20000,
    });
    return res.data;
  }
}

export const api = {
  getOverview: () => requestWithFallback("GET", "/overview"),
  predictBorrower: (payload) => requestWithFallback("POST", "/predict", payload),
  explainBorrower: (payload) => requestWithFallback("POST", "/explain", payload),
  calculateECL: (payload) => requestWithFallback("POST", "/ecl", payload),
  runStressSimulation: (payload) => requestWithFallback("POST", "/stress", payload),
  getPortfolio: (purpose = "ALL") =>
    requestWithFallback("GET", "/portfolio", null, { purpose }),
  getPerformance: () => requestWithFallback("GET", "/performance"),
};

export const DEFAULT_BORROWER_INPUTS = {
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
};
