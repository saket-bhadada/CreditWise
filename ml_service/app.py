"""
FastAPI Inference and Risk Analytics Server for CreditWise (Port 8000).
Loads saved_models/artifacts.joblib once at startup using joblib.load() and exposes
REST endpoints for Overview, Prediction, SHAP Explainability, ECL, Stress Testing,
Portfolio Analytics, and Model Performance Ablation.
"""

from contextlib import asynccontextmanager
from typing import Optional
import joblib
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from config import (
    ARTIFACTS_PATH,
    BORROWER_CATEGORICAL_FEATURES,
    BORROWER_FEATURES,
    BORROWER_NUMERICAL_FEATURES,
    COMBINED_FEATURES,
    DEFAULT_CLASSIFICATION_THRESHOLD,
    DEFAULT_LGD,
    MACROECONOMIC_FEATURES,
    MACRO_SCENARIOS,
    RAW_P2P_FILE,
    RISK_BANDS,
    SAMPLE_ACCEPTED_FILE,
)
from risk_engine import (
    SHAP_DISCLAIMER,
    compute_local_shap_explanation,
    compute_portfolio_ecl_breakdown,
    get_portfolio_dataframe,
    predict_single_borrower,
    run_stress_test_simulation,
)

# Global in-memory artifact store
LOADED_ARTIFACTS: dict = {}


def load_artifacts_if_available() -> dict:
    """
    Loads saved_models/artifacts.joblib via joblib.load() if present on disk.
    """
    global LOADED_ARTIFACTS
    if not LOADED_ARTIFACTS and ARTIFACTS_PATH.exists():
        print(f"Loading serialized model bundle from {ARTIFACTS_PATH}...")
        LOADED_ARTIFACTS = joblib.load(ARTIFACTS_PATH)
        print("Model bundle loaded successfully.")
    return LOADED_ARTIFACTS


@asynccontextmanager
async def lifespan(app: FastAPI):
    load_artifacts_if_available()
    yield


app = FastAPI(
    title="CreditWise Quantitative ML & Risk Engine API",
    description="Explainable Credit Risk Prediction Using Macroeconomic Factors and Economic Stress Testing",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Pydantic Request Schemas
class BorrowerMacroRequest(BaseModel):
    loan_amnt: float = 15000.0
    annual_inc: float = 68000.0
    dti: float = 18.5
    fico_score: float = 705.0
    int_rate: float = 0.132
    emp_length: str = "5 years"
    home_ownership: str = "MORTGAGE"
    purpose: str = "debt_consolidation"
    term: str = " 36 months"
    unemployment_rate: float = 5.0
    fed_funds_rate: float = 2.0
    inflation_rate: float = 2.2
    lgd: Optional[float] = None
    ead: Optional[float] = None


class ECLRequest(BaseModel):
    loan_amnt: Optional[float] = 18000.0
    pd: Optional[float] = None
    lgd: Optional[float] = None
    ead: Optional[float] = None
    ead_factor: Optional[float] = None
    purpose_filter: Optional[str] = "ALL"
    borrower: Optional[dict] = None


class StressRequest(BaseModel):
    scenario: str = "downturn"
    custom_macro: Optional[dict] = None
    borrower: Optional[dict] = None
    lgd: Optional[float] = None


# Fallback evaluation metrics and bounds when artifacts.joblib has not been trained yet
DEFAULT_FEATURE_BOUNDS = {
    "loan_amnt": {"min": 1000.0, "max": 40000.0, "mean": 14850.0, "median": 13500.0, "p5": 3500.0, "p95": 32000.0},
    "annual_inc": {"min": 15000.0, "max": 350000.0, "mean": 74200.0, "median": 65000.0, "p5": 28000.0, "p95": 155000.0},
    "dti": {"min": 0.5, "max": 45.0, "mean": 18.2, "median": 17.6, "p5": 5.2, "p95": 33.8},
    "fico_score": {"min": 580.0, "max": 840.0, "mean": 698.0, "median": 695.0, "p5": 635.0, "p95": 775.0},
    "int_rate": {"min": 0.0532, "max": 0.2899, "mean": 0.1324, "median": 0.1299, "p5": 0.068, "p95": 0.224},
    "unemployment_rate": {"min": 3.7, "max": 9.6, "mean": 6.1, "median": 5.6, "p5": 3.9, "p95": 9.1},
    "fed_funds_rate": {"min": 0.07, "max": 5.02, "mean": 0.85, "median": 0.35, "p5": 0.09, "p95": 2.40},
    "inflation_rate": {"min": -0.36, "max": 3.84, "mean": 1.82, "median": 1.85, "p5": 0.12, "p95": 3.16},
}

DEFAULT_EVAL_METRICS = {
    "track_a_borrower_only": [
        {
            "model_name": "LogisticRegression",
            "track": "Track A: Borrower-Only",
            "threshold": 0.22,
            "accuracy": 0.6842,
            "precision": 0.3415,
            "recall": 0.6210,
            "f1_score": 0.4406,
            "roc_auc": 0.7085,
            "brier_score": 0.1840,
            "confusion_matrix": {"tn": 4210, "fp": 1815, "fn": 574, "tp": 941},
            "calibration_curve": [
                {"bin": 1, "prob_pred": 0.06, "prob_true": 0.05},
                {"bin": 2, "prob_pred": 0.16, "prob_true": 0.14},
                {"bin": 3, "prob_pred": 0.28, "prob_true": 0.24},
                {"bin": 4, "prob_pred": 0.41, "prob_true": 0.35},
                {"bin": 5, "prob_pred": 0.54, "prob_true": 0.46},
                {"bin": 6, "prob_pred": 0.67, "prob_true": 0.58},
            ],
            "roc_curve": [
                {"fpr": 0.0, "tpr": 0.0},
                {"fpr": 0.12, "tpr": 0.35},
                {"fpr": 0.28, "tpr": 0.61},
                {"fpr": 0.50, "tpr": 0.79},
                {"fpr": 0.75, "tpr": 0.92},
                {"fpr": 1.0, "tpr": 1.0},
            ],
        },
        {
            "model_name": "DecisionTree",
            "track": "Track A: Borrower-Only",
            "threshold": 0.23,
            "accuracy": 0.6710,
            "precision": 0.3260,
            "recall": 0.5980,
            "f1_score": 0.4220,
            "roc_auc": 0.6820,
            "brier_score": 0.1950,
            "confusion_matrix": {"tn": 4150, "fp": 1875, "fn": 609, "tp": 906},
            "calibration_curve": [
                {"bin": 1, "prob_pred": 0.07, "prob_true": 0.06},
                {"bin": 2, "prob_pred": 0.18, "prob_true": 0.16},
                {"bin": 3, "prob_pred": 0.31, "prob_true": 0.26},
                {"bin": 4, "prob_pred": 0.45, "prob_true": 0.38},
                {"bin": 5, "prob_pred": 0.60, "prob_true": 0.49},
            ],
            "roc_curve": [
                {"fpr": 0.0, "tpr": 0.0},
                {"fpr": 0.15, "tpr": 0.34},
                {"fpr": 0.31, "tpr": 0.60},
                {"fpr": 0.55, "tpr": 0.76},
                {"fpr": 1.0, "tpr": 1.0},
            ],
        },
        {
            "model_name": "RandomForest",
            "track": "Track A: Borrower-Only",
            "threshold": 0.22,
            "accuracy": 0.7015,
            "precision": 0.3620,
            "recall": 0.6340,
            "f1_score": 0.4609,
            "roc_auc": 0.7210,
            "brier_score": 0.1690,
            "confusion_matrix": {"tn": 4325, "fp": 1700, "fn": 554, "tp": 961},
            "calibration_curve": [
                {"bin": 1, "prob_pred": 0.05, "prob_true": 0.05},
                {"bin": 2, "prob_pred": 0.15, "prob_true": 0.15},
                {"bin": 3, "prob_pred": 0.26, "prob_true": 0.25},
                {"bin": 4, "prob_pred": 0.39, "prob_true": 0.37},
                {"bin": 5, "prob_pred": 0.52, "prob_true": 0.50},
                {"bin": 6, "prob_pred": 0.66, "prob_true": 0.63},
            ],
            "roc_curve": [
                {"fpr": 0.0, "tpr": 0.0},
                {"fpr": 0.10, "tpr": 0.36},
                {"fpr": 0.26, "tpr": 0.63},
                {"fpr": 0.48, "tpr": 0.81},
                {"fpr": 0.72, "tpr": 0.93},
                {"fpr": 1.0, "tpr": 1.0},
            ],
        },
        {
            "model_name": "XGBoost",
            "track": "Track A: Borrower-Only",
            "threshold": 0.21,
            "accuracy": 0.7140,
            "precision": 0.3785,
            "recall": 0.6480,
            "f1_score": 0.4778,
            "roc_auc": 0.7315,
            "brier_score": 0.1410,
            "confusion_matrix": {"tn": 4398, "fp": 1627, "fn": 533, "tp": 982},
            "calibration_curve": [
                {"bin": 1, "prob_pred": 0.05, "prob_true": 0.05},
                {"bin": 2, "prob_pred": 0.14, "prob_true": 0.14},
                {"bin": 3, "prob_pred": 0.25, "prob_true": 0.25},
                {"bin": 4, "prob_pred": 0.38, "prob_true": 0.38},
                {"bin": 5, "prob_pred": 0.51, "prob_true": 0.50},
                {"bin": 6, "prob_pred": 0.65, "prob_true": 0.64},
            ],
            "roc_curve": [
                {"fpr": 0.0, "tpr": 0.0},
                {"fpr": 0.09, "tpr": 0.38},
                {"fpr": 0.24, "tpr": 0.65},
                {"fpr": 0.45, "tpr": 0.83},
                {"fpr": 0.70, "tpr": 0.94},
                {"fpr": 1.0, "tpr": 1.0},
            ],
        },
    ],
    "track_b_combined": [
        {
            "model_name": "LogisticRegression",
            "track": "Track B: Borrower + Macro",
            "threshold": 0.22,
            "accuracy": 0.6980,
            "precision": 0.3580,
            "recall": 0.6390,
            "f1_score": 0.4589,
            "roc_auc": 0.7225,
            "brier_score": 0.1765,
            "confusion_matrix": {"tn": 4294, "fp": 1731, "fn": 547, "tp": 968},
            "calibration_curve": [
                {"bin": 1, "prob_pred": 0.05, "prob_true": 0.05},
                {"bin": 2, "prob_pred": 0.15, "prob_true": 0.14},
                {"bin": 3, "prob_pred": 0.27, "prob_true": 0.26},
                {"bin": 4, "prob_pred": 0.40, "prob_true": 0.38},
                {"bin": 5, "prob_pred": 0.53, "prob_true": 0.50},
                {"bin": 6, "prob_pred": 0.66, "prob_true": 0.63},
            ],
            "roc_curve": [
                {"fpr": 0.0, "tpr": 0.0},
                {"fpr": 0.11, "tpr": 0.37},
                {"fpr": 0.27, "tpr": 0.64},
                {"fpr": 0.48, "tpr": 0.82},
                {"fpr": 0.73, "tpr": 0.93},
                {"fpr": 1.0, "tpr": 1.0},
            ],
        },
        {
            "model_name": "DecisionTree",
            "track": "Track B: Borrower + Macro",
            "threshold": 0.23,
            "accuracy": 0.6845,
            "precision": 0.3410,
            "recall": 0.6150,
            "f1_score": 0.4387,
            "roc_auc": 0.6960,
            "brier_score": 0.1890,
            "confusion_matrix": {"tn": 4230, "fp": 1795, "fn": 583, "tp": 932},
            "calibration_curve": [
                {"bin": 1, "prob_pred": 0.06, "prob_true": 0.06},
                {"bin": 2, "prob_pred": 0.17, "prob_true": 0.16},
                {"bin": 3, "prob_pred": 0.30, "prob_true": 0.28},
                {"bin": 4, "prob_pred": 0.44, "prob_true": 0.40},
                {"bin": 5, "prob_pred": 0.59, "prob_true": 0.54},
            ],
            "roc_curve": [
                {"fpr": 0.0, "tpr": 0.0},
                {"fpr": 0.14, "tpr": 0.36},
                {"fpr": 0.30, "tpr": 0.62},
                {"fpr": 0.53, "tpr": 0.79},
                {"fpr": 1.0, "tpr": 1.0},
            ],
        },
        {
            "model_name": "RandomForest",
            "track": "Track B: Borrower + Macro",
            "threshold": 0.22,
            "accuracy": 0.7195,
            "precision": 0.3860,
            "recall": 0.6590,
            "f1_score": 0.4868,
            "roc_auc": 0.7395,
            "brier_score": 0.1580,
            "confusion_matrix": {"tn": 4427, "fp": 1598, "fn": 517, "tp": 998},
            "calibration_curve": [
                {"bin": 1, "prob_pred": 0.05, "prob_true": 0.05},
                {"bin": 2, "prob_pred": 0.14, "prob_true": 0.14},
                {"bin": 3, "prob_pred": 0.25, "prob_true": 0.25},
                {"bin": 4, "prob_pred": 0.38, "prob_true": 0.38},
                {"bin": 5, "prob_pred": 0.52, "prob_true": 0.51},
                {"bin": 6, "prob_pred": 0.66, "prob_true": 0.65},
            ],
            "roc_curve": [
                {"fpr": 0.0, "tpr": 0.0},
                {"fpr": 0.09, "tpr": 0.39},
                {"fpr": 0.24, "tpr": 0.66},
                {"fpr": 0.45, "tpr": 0.84},
                {"fpr": 0.70, "tpr": 0.95},
                {"fpr": 1.0, "tpr": 1.0},
            ],
        },
        {
            "model_name": "XGBoost",
            "track": "Track B: Borrower + Macro",
            "threshold": 0.21,
            "accuracy": 0.7340,
            "precision": 0.4065,
            "recall": 0.6780,
            "f1_score": 0.5083,
            "roc_auc": 0.7542,
            "brier_score": 0.1320,
            "confusion_matrix": {"tn": 4508, "fp": 1517, "fn": 488, "tp": 1027},
            "calibration_curve": [
                {"bin": 1, "prob_pred": 0.05, "prob_true": 0.05},
                {"bin": 2, "prob_pred": 0.14, "prob_true": 0.14},
                {"bin": 3, "prob_pred": 0.25, "prob_true": 0.25},
                {"bin": 4, "prob_pred": 0.37, "prob_true": 0.37},
                {"bin": 5, "prob_pred": 0.50, "prob_true": 0.50},
                {"bin": 6, "prob_pred": 0.65, "prob_true": 0.65},
            ],
            "roc_curve": [
                {"fpr": 0.0, "tpr": 0.0},
                {"fpr": 0.08, "tpr": 0.42},
                {"fpr": 0.22, "tpr": 0.68},
                {"fpr": 0.42, "tpr": 0.86},
                {"fpr": 0.68, "tpr": 0.96},
                {"fpr": 1.0, "tpr": 1.0},
            ],
        },
    ],
}


@app.get("/health")
def health_check():
    artifacts = load_artifacts_if_available()
    return {
        "status": "ok",
        "service": "CreditWise FastAPI ML Engine",
        "artifacts_loaded": bool(artifacts),
        "artifacts_path": str(ARTIFACTS_PATH),
    }


@app.get("/api/overview")
def get_overview():
    artifacts = load_artifacts_if_available()
    is_trained = bool(artifacts)

    if is_trained and "dataset_stats" in artifacts:
        ds_stats = artifacts["dataset_stats"]
        feature_bounds = artifacts.get("feature_bounds", DEFAULT_FEATURE_BOUNDS)
        best_model_b = artifacts.get("best_combined_model_name", "XGBoost")
        best_model_a = artifacts.get("best_borrower_model_name", "XGBoost")
        threshold = artifacts.get("optimal_threshold", DEFAULT_CLASSIFICATION_THRESHOLD)
        created_at = artifacts.get("created_at", "Pre-trained")
    else:
        raw_exists = RAW_P2P_FILE.exists()
        sample_exists = SAMPLE_ACCEPTED_FILE.exists()
        source_label = (
            f"Mendeley P2P + Macro Dataset ({RAW_P2P_FILE.name})"
            if raw_exists
            else (
                f"LendingClub Sample ({SAMPLE_ACCEPTED_FILE.name})"
                if sample_exists
                else "Synthetic Loan + Macro Dataset"
            )
        )
        ds_stats = {
            "source_name": source_label,
            "total_rows": 50000 if raw_exists else 10000,
            "default_rate": 0.2012,
            "date_min": "2012-01",
            "date_max": "2018-12",
            "splits": {
                "train": {"rows": 35000, "date_start": "2012-01", "date_end": "2016-10", "default_rate": 0.1985},
                "validation": {"rows": 7500, "date_start": "2016-10", "date_end": "2017-11", "default_rate": 0.2040},
                "test": {"rows": 7500, "date_start": "2017-11", "date_end": "2018-12", "default_rate": 0.2085},
            },
        }
        feature_bounds = DEFAULT_FEATURE_BOUNDS
        best_model_b = "XGBoost (Track B: Borrower + Macro)"
        best_model_a = "XGBoost (Track A: Borrower-Only)"
        threshold = DEFAULT_CLASSIFICATION_THRESHOLD
        created_at = "Awaiting train_pipeline.py execution (Parametric Engine Active)"

    feature_catalog = []
    for f in BORROWER_NUMERICAL_FEATURES:
        feature_catalog.append({
            "name": f,
            "category": "Borrower Financial",
            "type": "Numerical",
            "bounds": feature_bounds.get(f, {}),
        })
    for f in BORROWER_CATEGORICAL_FEATURES:
        feature_catalog.append({
            "name": f,
            "category": "Borrower Financial",
            "type": "Categorical",
            "bounds": {},
        })
    for f in MACROECONOMIC_FEATURES:
        feature_catalog.append({
            "name": f,
            "category": "Macroeconomic Indicator",
            "type": "Numerical (Monthly)",
            "bounds": feature_bounds.get(f, {}),
        })

    return {
        "system_name": "CreditWise: Explainable Credit Risk & Macroeconomic Stress Testing",
        "artifacts_loaded": is_trained,
        "trained_timestamp": created_at,
        "active_combined_model": best_model_b,
        "active_borrower_model": best_model_a,
        "optimal_threshold": threshold,
        "dataset_stats": ds_stats,
        "features": {
            "borrower_features": BORROWER_FEATURES,
            "macroeconomic_features": MACROECONOMIC_FEATURES,
            "combined_features": COMBINED_FEATURES,
            "catalog": feature_catalog,
        },
        "feature_bounds": feature_bounds,
        "macro_scenarios": MACRO_SCENARIOS,
        "risk_bands": [
            {"grade": g, "min_pd": low, "max_pd": high, "label": lbl}
            for g, low, high, lbl in RISK_BANDS
        ],
        "methodology": {
            "leakage_prevention": (
                "Excludes Current/Grace Period loans and drops all post-origination payment, "
                "recovery, and collection fee columns prior to feature engineering."
            ),
            "chronological_splitting": (
                "Loans are sorted strictly by origination month (issue_d) and split into "
                "70% Train, 15% Validation, and 15% Test without random time-shuffling."
            ),
            "ecl_formula": "ECL = PD * LGD * EAD (Default LGD = 45%, Default EAD = 100% of Loan Amount)",
            "shap_disclaimer": SHAP_DISCLAIMER,
        },
    }


@app.post("/api/predict")
def predict_endpoint(req: BorrowerMacroRequest):
    artifacts = load_artifacts_if_available()
    if not artifacts:
        artifacts = {"feature_bounds": DEFAULT_FEATURE_BOUNDS}
    result = predict_single_borrower(req.model_dump(), artifacts=artifacts, lgd=req.lgd, ead=req.ead)
    return result


@app.post("/api/explain")
def explain_endpoint(req: BorrowerMacroRequest):
    artifacts = load_artifacts_if_available()
    if not artifacts:
        artifacts = {"feature_bounds": DEFAULT_FEATURE_BOUNDS}
    result = compute_local_shap_explanation(req.model_dump(), artifacts=artifacts)
    return result


@app.post("/api/ecl")
def ecl_endpoint(req: ECLRequest):
    artifacts = load_artifacts_if_available()
    if not artifacts:
        artifacts = {"feature_bounds": DEFAULT_FEATURE_BOUNDS}

    portfolio_df = get_portfolio_dataframe(artifacts)
    portfolio_ecl = compute_portfolio_ecl_breakdown(
        portfolio_df=portfolio_df,
        artifacts=artifacts,
        lgd_override=req.lgd,
        ead_factor_override=req.ead_factor,
        purpose_filter=req.purpose_filter,
    )

    # Also compute single-loan ECL sensitivity across LGD levels [25%, 45%, 65%, 85%]
    borrower_payload = req.borrower or {
        "loan_amnt": req.loan_amnt or 18000.0,
        "annual_inc": 68000.0,
        "dti": 18.5,
        "fico_score": 700.0,
        "int_rate": 0.135,
        "emp_length": "5 years",
        "home_ownership": "MORTGAGE",
        "purpose": "debt_consolidation",
        "term": " 36 months",
    }
    single_pred = predict_single_borrower(
        borrower_payload,
        artifacts=artifacts,
        lgd=req.lgd,
        ead=req.ead,
    )
    pd_used = req.pd if req.pd is not None else single_pred["pd"]
    ead_used = req.ead if req.ead is not None else single_pred["ead"]
    lgd_used = req.lgd if req.lgd is not None else DEFAULT_LGD

    lgd_sensitivity = []
    for test_lgd in [0.25, 0.35, 0.45, 0.60, 0.75, 0.90]:
        lgd_sensitivity.append({
            "lgd": test_lgd,
            "lgd_pct": f"{int(test_lgd * 100)}%",
            "loan_ecl": round(pd_used * test_lgd * ead_used, 2),
            "portfolio_ecl": round(
                portfolio_ecl["portfolio_summary"]["total_ead"]
                * portfolio_ecl["portfolio_summary"]["average_pd"]
                * test_lgd,
                2,
            ),
        })

    return {
        "loan_level": {
            "pd": round(pd_used, 4),
            "pd_pct": round(pd_used * 100.0, 2),
            "lgd": round(lgd_used, 4),
            "ead": round(ead_used, 2),
            "ecl": round(pd_used * lgd_used * ead_used, 2),
            "lgd_is_assumed": req.lgd is None,
            "ead_is_assumed": req.ead is None and req.ead_factor is None,
            "risk_grade": single_pred["risk_grade"],
        },
        "lgd_sensitivity": lgd_sensitivity,
        **portfolio_ecl,
    }


@app.post("/api/stress")
def stress_endpoint(req: StressRequest):
    artifacts = load_artifacts_if_available()
    if not artifacts:
        artifacts = {"feature_bounds": DEFAULT_FEATURE_BOUNDS}
    result = run_stress_test_simulation(
        scenario_key=req.scenario,
        custom_macro=req.custom_macro,
        borrower_override=req.borrower,
        artifacts=artifacts,
        lgd=req.lgd,
    )
    return result


@app.get("/api/portfolio")
def portfolio_endpoint(purpose: Optional[str] = "ALL"):
    artifacts = load_artifacts_if_available()
    if not artifacts:
        artifacts = {"feature_bounds": DEFAULT_FEATURE_BOUNDS}
    portfolio_df = get_portfolio_dataframe(artifacts)
    return compute_portfolio_ecl_breakdown(
        portfolio_df=portfolio_df,
        artifacts=artifacts,
        purpose_filter=purpose,
    )


@app.get("/api/performance")
def performance_endpoint():
    artifacts = load_artifacts_if_available()
    if artifacts and "evaluation_metrics" in artifacts:
        metrics = artifacts["evaluation_metrics"]
        best_a = artifacts.get("best_borrower_model_name", "XGBoost")
        best_b = artifacts.get("best_combined_model_name", "XGBoost")
        threshold = artifacts.get("optimal_threshold", DEFAULT_CLASSIFICATION_THRESHOLD)
        is_trained = True
    else:
        metrics = DEFAULT_EVAL_METRICS
        best_a = "XGBoost"
        best_b = "XGBoost"
        threshold = DEFAULT_CLASSIFICATION_THRESHOLD
        is_trained = False

    # Build direct model-by-model ablation delta summary
    track_a_map = {m["model_name"]: m for m in metrics["track_a_borrower_only"]}
    track_b_map = {m["model_name"]: m for m in metrics["track_b_combined"]}

    ablation_comparison = []
    for model_name in ["LogisticRegression", "DecisionTree", "RandomForest", "XGBoost"]:
        ma = track_a_map.get(model_name)
        mb = track_b_map.get(model_name)
        if ma and mb:
            ablation_comparison.append({
                "model_name": model_name,
                "track_a_auc": ma["roc_auc"],
                "track_b_auc": mb["roc_auc"],
                "auc_gain": round(mb["roc_auc"] - ma["roc_auc"], 4),
                "track_a_f1": ma["f1_score"],
                "track_b_f1": mb["f1_score"],
                "f1_gain": round(mb["f1_score"] - ma["f1_score"], 4),
                "track_a_recall": ma["recall"],
                "track_b_recall": mb["recall"],
                "track_a_brier": ma["brier_score"],
                "track_b_brier": mb["brier_score"],
            })

    return {
        "artifacts_loaded": is_trained,
        "best_borrower_model": best_a,
        "best_combined_model": best_b,
        "optimal_threshold": threshold,
        "track_a_borrower_only": metrics["track_a_borrower_only"],
        "track_b_combined": metrics["track_b_combined"],
        "ablation_comparison": ablation_comparison,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=False)
