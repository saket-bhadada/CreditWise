# CreditWise: Explainable Credit Risk Prediction Using Macroeconomic Factors and Economic Stress Testing

An end-to-end quantitative credit risk decision-support system that predicts borrower Probability of Default (PD), explains predictions using global and local SHAP attributions, calculates loan-level and portfolio-level Expected Credit Loss (`ECL = PD * LGD * EAD`), and runs macroeconomic stress-testing simulations with Out-Of-Distribution (OOD) detection.

---

## System Architecture

```text
CreditWise/
├── ml_service/                      # Python FastAPI + Scikit-Learn/XGBoost/SHAP/Joblib (Port 8000)
│   ├── saved_models/                # Stores serialized artifacts.joblib
│   ├── data/                        # Mendeley US P2P + Macro Dataset & Sample CSVs
│   ├── config.py                    # Feature definitions, macro stress scenarios, risk bands
│   ├── generate_data.py             # Fallback 10,000-row realistic loan + macro generator
│   ├── data_pipeline.py             # Zero-leakage cleaning, macro date alignment, chronological split
│   ├── train_pipeline.py            # Trains LR, DT, RF, XGB on Track A & Track B, saves artifacts.joblib
│   ├── risk_engine.py               # PD, SHAP, ECL (PD*LGD*EAD), Stress Testing & OOD engine
│   ├── app.py                       # FastAPI REST server loading artifacts.joblib at startup
│   ├── test_engine.py               # Pytest unit suite for ECL math, PD bounds, and stress testing
│   └── requirements.txt
├── backend/                         # Node.js + Express API Gateway (Port 5000)
│   ├── package.json
│   └── server.js                    # Proxies /api/* requests to FastAPI on Port 8000
└── frontend/                        # Plain React.js (.jsx) + Vite + Recharts (Port 5173)
    ├── package.json
    ├── vite.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api.js
        └── pages/
            ├── Overview.jsx
            ├── BorrowerRisk.jsx
            ├── Explainability.jsx
            ├── ECLPage.jsx
            ├── StressSimulator.jsx
            ├── PortfolioPage.jsx
            └── PerformancePage.jsx
```

---

## Quick Start Commands (When Ready to Train & Run)

### 1. Run Unit Tests (`ml_service/`)
```bash
cd ml_service
pytest test_engine.py -v
```

### 2. Train Models & Serialize `artifacts.joblib` (`ml_service/`)
```bash
cd ml_service
python train_pipeline.py
```

### 3. Start FastAPI ML Service (`http://localhost:8000`)
```bash
cd ml_service
uvicorn app:app --host 0.0.0.0 --port 8000
```

### 4. Start Node/Express Gateway (`http://localhost:5000`)
```bash
cd backend
npm install
npm start
```

### 5. Start React Frontend Dashboard (`http://localhost:5173`)
```bash
cd frontend
npm install
npm run dev
```
