/**
 * CreditWise Backend API Gateway (Node.js + Express, Port 5000).
 * Exposes /api/* endpoints to the React frontend and forwards analytical
 * compute requests to the Python FastAPI ML service (http://localhost:8000).
 */

const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
const PORT = process.env.PORT || 5000;
const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:8000";

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const mlClient = axios.create({
  baseURL: ML_SERVICE_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
});

function handleProxyError(res, error, endpointName) {
  const status = error.response ? error.response.status : 503;
  const detail =
    error.response && error.response.data
      ? error.response.data
      : error.message || "ML FastAPI service unavailable on port 8000";

  console.error(`[Gateway Error] ${endpointName}:`, detail);
  return res.status(status).json({
    error: true,
    endpoint: endpointName,
    message: "Failed to communicate with Python FastAPI ML Service (port 8000).",
    detail,
  });
}

// Health check
app.get("/health", async (req, res) => {
  try {
    const response = await mlClient.get("/health");
    return res.json({
      gateway: "online",
      port: PORT,
      ml_service: response.data,
    });
  } catch (err) {
    return res.status(503).json({
      gateway: "online",
      port: PORT,
      ml_service: { status: "unreachable", detail: err.message },
    });
  }
});

// 1. GET /api/overview
app.get("/api/overview", async (req, res) => {
  try {
    const response = await mlClient.get("/api/overview");
    return res.json(response.data);
  } catch (err) {
    return handleProxyError(res, err, "GET /api/overview");
  }
});

// 2. POST /api/predict
app.post("/api/predict", async (req, res) => {
  try {
    const response = await mlClient.post("/api/predict", req.body);
    return res.json(response.data);
  } catch (err) {
    return handleProxyError(res, err, "POST /api/predict");
  }
});

// 3. POST /api/explain
app.post("/api/explain", async (req, res) => {
  try {
    const response = await mlClient.post("/api/explain", req.body);
    return res.json(response.data);
  } catch (err) {
    return handleProxyError(res, err, "POST /api/explain");
  }
});

// 4. POST /api/ecl
app.post("/api/ecl", async (req, res) => {
  try {
    const response = await mlClient.post("/api/ecl", req.body);
    return res.json(response.data);
  } catch (err) {
    return handleProxyError(res, err, "POST /api/ecl");
  }
});

// 5. POST /api/stress
app.post("/api/stress", async (req, res) => {
  try {
    const response = await mlClient.post("/api/stress", req.body);
    return res.json(response.data);
  } catch (err) {
    return handleProxyError(res, err, "POST /api/stress");
  }
});

// 6. GET /api/portfolio
app.get("/api/portfolio", async (req, res) => {
  try {
    const purpose = req.query.purpose || "ALL";
    const response = await mlClient.get("/api/portfolio", {
      params: { purpose },
    });
    return res.json(response.data);
  } catch (err) {
    return handleProxyError(res, err, "GET /api/portfolio");
  }
});

// 7. GET /api/performance
app.get("/api/performance", async (req, res) => {
  try {
    const response = await mlClient.get("/api/performance");
    return res.json(response.data);
  } catch (err) {
    return handleProxyError(res, err, "GET /api/performance");
  }
});

app.listen(PORT, () => {
  console.log(`CreditWise Node/Express API Gateway running on http://localhost:${PORT}`);
  console.log(`Proxying /api/* requests to FastAPI ML Service at ${ML_SERVICE_URL}`);
});
