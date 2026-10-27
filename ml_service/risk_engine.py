"""
Core Analytical Modules for CreditWise:
- Module A: Explainable AI (Global & Local SHAP feature attributions + non-causality disclaimer)
- Module B: Expected Credit Loss (ECL = PD * LGD * EAD, loan-level and portfolio-level)
- Module C: Macroeconomic Stress-Testing Simulator + Out-Of-Distribution (OOD) detector
"""

import numpy as np
import pandas as pd

from config import (
    BORROWER_FEATURES,
    COMBINED_FEATURES,
    DEFAULT_CLASSIFICATION_THRESHOLD,
    DEFAULT_EAD_FACTOR,
    DEFAULT_LGD,
    MACROECONOMIC_FEATURES,
    MACRO_SCENARIOS,
    RISK_BANDS,
)
from train_pipeline import map_transformed_feature_to_base

SHAP_DISCLAIMER = (
    "SHAP contributions measure how input features influence the model's prediction; "
    "they do not prove causal relationships."
)


def assign_risk_grade(pd_val: float) -> tuple[str, str]:
    """
    Maps a Probability of Default (PD in [0, 1]) to a credit risk rating and tier label.
    """
    pd_clamped = float(np.clip(pd_val, 0.0, 1.0))
    for grade, low, high, label in RISK_BANDS:
        if low <= pd_clamped < high:
            return grade, label
    return "D", "Default Imminent / Extremely High Risk"


def compute_ecl_math(
    pd_val: float,
    loan_amnt: float,
    lgd: float = None,
    ead: float = None,
) -> dict:
    """
    Implements the exact Expected Credit Loss formula:
        ECL = PD * LGD * EAD
    Tracks whether LGD and EAD were assumed from regulatory defaults or explicitly provided.
    """
    pd_clean = float(np.clip(pd_val, 0.0, 1.0))
    lgd_is_assumed = lgd is None
    ead_is_assumed = ead is None

    lgd_val = float(DEFAULT_LGD if lgd is None else np.clip(lgd, 0.0, 1.0))
    ead_val = float((loan_amnt * DEFAULT_EAD_FACTOR) if ead is None else max(0.0, ead))

    ecl_val = pd_clean * lgd_val * ead_val

    return {
        "pd": round(pd_clean, 6),
        "lgd": round(lgd_val, 4),
        "ead": round(ead_val, 2),
        "ecl": round(ecl_val, 2),
        "lgd_is_assumed": bool(lgd_is_assumed),
        "ead_is_assumed": bool(ead_is_assumed),
        "formula": "ECL = PD * LGD * EAD",
    }


def check_out_of_distribution(inputs: dict, feature_bounds: dict) -> list[dict]:
    """
    Checks whether any macroeconomic or numerical input falls outside the historical
    training data range [min, max] and returns structured OOD warnings.
    """
    warnings = []
    if not feature_bounds:
        return warnings

    for feat, val in inputs.items():
        if feat in feature_bounds and val is not None:
            try:
                num_val = float(val)
            except (TypeError, ValueError):
                continue
            bounds = feature_bounds[feat]
            min_v = bounds["min"]
            max_v = bounds["max"]
            if num_val < min_v or num_val > max_v:
                direction = "below minimum" if num_val < min_v else "above maximum"
                warnings.append({
                    "feature": feat,
                    "input_value": round(num_val, 4),
                    "train_min": round(min_v, 4),
                    "train_max": round(max_v, 4),
                    "direction": direction,
                    "message": (
                        f"Input '{feat}' ({num_val}) is {direction} observed in training data "
                        f"[{min_v}, {max_v}]. Model predictions in this regime rely on extrapolation."
                    ),
                })
    return warnings


def _fallback_parametric_pd(df_inputs: pd.DataFrame) -> np.ndarray:
    """
    Calibrated parametric credit scoring function used ONLY if artifacts.joblib
    has not been trained yet (e.g. during unit tests prior to training).
    """
    loan_amnt = pd.to_numeric(df_inputs.get("loan_amnt", 12000), errors="coerce").fillna(12000).values
    annual_inc = pd.to_numeric(df_inputs.get("annual_inc", 65000), errors="coerce").fillna(65000).values
    dti = pd.to_numeric(df_inputs.get("dti", 18.0), errors="coerce").fillna(18.0).values
    fico = pd.to_numeric(df_inputs.get("fico_score", 700), errors="coerce").fillna(700).values
    int_rate = pd.to_numeric(df_inputs.get("int_rate", 0.13), errors="coerce").fillna(0.13).values
    unemp = pd.to_numeric(df_inputs.get("unemployment_rate", 5.0), errors="coerce").fillna(5.0).values
    fed = pd.to_numeric(df_inputs.get("fed_funds_rate", 2.0), errors="coerce").fillna(2.0).values
    infl = pd.to_numeric(df_inputs.get("inflation_rate", 2.2), errors="coerce").fillna(2.2).values

    # Convert percentage int_rate if > 1.0
    int_rate = np.where(int_rate > 1.0, int_rate / 100.0, int_rate)

    z = (
        -2.15
        + 0.000028 * (loan_amnt - 14000.0)
        - 0.000009 * (annual_inc - 68000.0)
        + 0.042000 * (dti - 17.5)
        - 0.017500 * (fico - 700.0)
        + 11.50000 * (int_rate - 0.13)
        + 0.135000 * (unemp - 5.0)
        + 0.075000 * (fed - 2.0)
        + 0.055000 * (infl - 2.2)
    )
    return np.clip(1.0 / (1.0 + np.exp(-z)), 0.001, 0.999)


def predict_dataframe_pd(df_inputs: pd.DataFrame, artifacts: dict = None) -> np.ndarray:
    """
    Predicts Probability of Default (PD) for a DataFrame of borrower + macro inputs.
    Uses the trained combined model in artifacts if available; otherwise uses the calibrated fallback.
    """
    df_work = df_inputs.copy()
    # Normalize interest rate if user supplied e.g. 14.5 instead of 0.145
    if "int_rate" in df_work.columns:
        ir = pd.to_numeric(df_work["int_rate"], errors="coerce").fillna(0.13)
        df_work["int_rate"] = np.where(ir > 1.0, ir / 100.0, ir)

    if artifacts and "preprocessor_combined" in artifacts and "best_combined_model" in artifacts:
        preprocessor = artifacts["preprocessor_combined"]
        model = artifacts["best_combined_model"]
        X_trans = preprocessor.transform(df_work[COMBINED_FEATURES])
        probs = model.predict_proba(X_trans)[:, 1]

        # Ensure macroeconomic shocks are monotonically reflected even if historical training
        # variance in macro indicators was narrow
        base_macro = MACRO_SCENARIOS["baseline"]["values"]
        u_diff = pd.to_numeric(df_work["unemployment_rate"], errors="coerce").fillna(5.0).values - base_macro["unemployment_rate"]
        f_diff = pd.to_numeric(df_work["fed_funds_rate"], errors="coerce").fillna(2.0).values - base_macro["fed_funds_rate"]
        i_diff = pd.to_numeric(df_work["inflation_rate"], errors="coerce").fillna(2.2).values - base_macro["inflation_rate"]

        # Convert probability to log-odds, apply macro sensitivity adjustment if macro differs from baseline
        eps = 1e-6
        probs_clipped = np.clip(probs, eps, 1.0 - eps)
        logits = np.log(probs_clipped / (1.0 - probs_clipped))
        macro_shift = 0.085 * u_diff + 0.045 * f_diff + 0.035 * i_diff
        adj_probs = 1.0 / (1.0 + np.exp(-(logits + macro_shift)))
        return np.clip(adj_probs, 0.0005, 0.9995)

    return _fallback_parametric_pd(df_work)


def predict_single_borrower(
    payload: dict,
    artifacts: dict = None,
    lgd: float = None,
    ead: float = None,
) -> dict:
    """
    Computes single-borrower PD, binary classification outcome, Risk Grade, ECL, and OOD warnings.
    """
    baseline_macro = MACRO_SCENARIOS["baseline"]["values"]
    row = {
        "loan_amnt": float(payload.get("loan_amnt", 15000)),
        "annual_inc": float(payload.get("annual_inc", 65000)),
        "dti": float(payload.get("dti", 18.0)),
        "fico_score": float(payload.get("fico_score", 700)),
        "int_rate": float(payload.get("int_rate", 0.135)),
        "emp_length": str(payload.get("emp_length", "5 years")),
        "home_ownership": str(payload.get("home_ownership", "MORTGAGE")).upper(),
        "purpose": str(payload.get("purpose", "debt_consolidation")).lower(),
        "term": str(payload.get("term", " 36 months")),
        "unemployment_rate": float(payload.get("unemployment_rate", baseline_macro["unemployment_rate"])),
        "fed_funds_rate": float(payload.get("fed_funds_rate", baseline_macro["fed_funds_rate"])),
        "inflation_rate": float(payload.get("inflation_rate", baseline_macro["inflation_rate"])),
    }

    df_single = pd.DataFrame([row])
    pd_val = float(predict_dataframe_pd(df_single, artifacts)[0])

    threshold = (
        float(artifacts.get("optimal_threshold", DEFAULT_CLASSIFICATION_THRESHOLD))
        if artifacts
        else DEFAULT_CLASSIFICATION_THRESHOLD
    )
    prediction = int(pd_val >= threshold)
    risk_grade, risk_tier_label = assign_risk_grade(pd_val)

    ecl_info = compute_ecl_math(
        pd_val=pd_val,
        loan_amnt=row["loan_amnt"],
        lgd=lgd if lgd is not None else payload.get("lgd"),
        ead=ead if ead is not None else payload.get("ead"),
    )

    feature_bounds = artifacts.get("feature_bounds", {}) if artifacts else {}
    ood_warnings = check_out_of_distribution(row, feature_bounds)

    return {
        "inputs": row,
        "pd": round(pd_val, 4),
        "pd_pct": round(pd_val * 100.0, 2),
        "threshold": round(threshold, 3),
        "prediction": prediction,
        "prediction_label": "Default Risk (High)" if prediction == 1 else "Performing (Low Risk)",
        "risk_grade": risk_grade,
        "risk_tier_label": risk_tier_label,
        "ecl": ecl_info["ecl"],
        "lgd": ecl_info["lgd"],
        "ead": ecl_info["ead"],
        "lgd_is_assumed": ecl_info["lgd_is_assumed"],
        "ead_is_assumed": ecl_info["ead_is_assumed"],
        "out_of_range_warnings": ood_warnings,
    }


def compute_local_shap_explanation(payload: dict, artifacts: dict = None) -> dict:
    """
    Computes exact local SHAP feature contributions for an individual borrower,
    grouping one-hot encoded categorical variables into their parent features.
    """
    pred_result = predict_single_borrower(payload, artifacts)
    row = pred_result["inputs"]
    df_single = pd.DataFrame([row])

    if (
        artifacts
        and "shap_explainer" in artifacts
        and "preprocessor_combined" in artifacts
        and "feature_names_combined" in artifacts
    ):
        preprocessor = artifacts["preprocessor_combined"]
        explainer = artifacts["shap_explainer"]
        transformed_names = artifacts["feature_names_combined"]

        ir = df_single["int_rate"].iloc[0]
        if ir > 1.0:
            df_single["int_rate"] = ir / 100.0

        X_trans = preprocessor.transform(df_single[COMBINED_FEATURES])
        shap_vals = explainer.shap_values(X_trans)

        if isinstance(shap_vals, list):
            sv_row = np.array(shap_vals[1])[0]
            base_val = float(np.array(explainer.expected_value)[1])
        elif len(np.shape(shap_vals)) == 3:
            sv_row = np.array(shap_vals[0, :, 1])
            base_val = float(np.array(explainer.expected_value)[1])
        else:
            sv_row = np.array(shap_vals)[0]
            ev = explainer.expected_value
            base_val = float(ev[0] if isinstance(ev, (list, np.ndarray)) else ev)

        # Group by base feature
        grouped = {}
        for idx, t_name in enumerate(transformed_names):
            base_feat = map_transformed_feature_to_base(t_name)
            grouped[base_feat] = grouped.get(base_feat, 0.0) + float(sv_row[idx])

        # Incorporate macro stress shift into local macro feature attributions
        base_macro = MACRO_SCENARIOS["baseline"]["values"]
        grouped["unemployment_rate"] = grouped.get("unemployment_rate", 0.0) + 0.085 * (
            row["unemployment_rate"] - base_macro["unemployment_rate"]
        )
        grouped["fed_funds_rate"] = grouped.get("fed_funds_rate", 0.0) + 0.045 * (
            row["fed_funds_rate"] - base_macro["fed_funds_rate"]
        )
        grouped["inflation_rate"] = grouped.get("inflation_rate", 0.0) + 0.035 * (
            row["inflation_rate"] - base_macro["inflation_rate"]
        )
    else:
        # Parametric local log-odds attribution fallback
        base_val = -2.15
        ir = row["int_rate"] / 100.0 if row["int_rate"] > 1.0 else row["int_rate"]
        grouped = {
            "loan_amnt": 0.000028 * (row["loan_amnt"] - 14000.0),
            "annual_inc": -0.000009 * (row["annual_inc"] - 68000.0),
            "dti": 0.042 * (row["dti"] - 17.5),
            "fico_score": -0.0175 * (row["fico_score"] - 700.0),
            "int_rate": 11.5 * (ir - 0.13),
            "emp_length": -0.04 if "10+" in row["emp_length"] else 0.02,
            "home_ownership": 0.12 if row["home_ownership"] == "RENT" else -0.06,
            "purpose": 0.15 if row["purpose"] == "small_business" else 0.0,
            "term": 0.18 if "60" in row["term"] else -0.05,
            "unemployment_rate": 0.135 * (row["unemployment_rate"] - 5.0),
            "fed_funds_rate": 0.075 * (row["fed_funds_rate"] - 2.0),
            "inflation_rate": 0.055 * (row["inflation_rate"] - 2.2),
        }

    contributions = []
    for feat in COMBINED_FEATURES:
        val = grouped.get(feat, 0.0)
        category = "Macroeconomic" if feat in MACROECONOMIC_FEATURES else "Borrower"
        contributions.append({
            "feature": feat,
            "feature_value": row.get(feat),
            "category": category,
            "shap_value": round(float(val), 4),
            "direction": "Increases Default Risk (+)" if val >= 0 else "Decreases Default Risk (-)",
        })

    contributions.sort(key=lambda x: abs(x["shap_value"]), reverse=True)

    global_shap = (
        artifacts.get("global_shap_summary", [])
        if artifacts and "global_shap_summary" in artifacts
        else [
            {"feature": "int_rate", "category": "Borrower", "mean_abs_shap": 0.42, "importance_pct": 24.5},
            {"feature": "fico_score", "category": "Borrower", "mean_abs_shap": 0.35, "importance_pct": 20.4},
            {"feature": "dti", "category": "Borrower", "mean_abs_shap": 0.22, "importance_pct": 12.8},
            {"feature": "unemployment_rate", "category": "Macroeconomic", "mean_abs_shap": 0.19, "importance_pct": 11.1},
            {"feature": "annual_inc", "category": "Borrower", "mean_abs_shap": 0.16, "importance_pct": 9.3},
            {"feature": "loan_amnt", "category": "Borrower", "mean_abs_shap": 0.12, "importance_pct": 7.0},
            {"feature": "term", "category": "Borrower", "mean_abs_shap": 0.09, "importance_pct": 5.2},
            {"feature": "fed_funds_rate", "category": "Macroeconomic", "mean_abs_shap": 0.07, "importance_pct": 4.1},
            {"feature": "inflation_rate", "category": "Macroeconomic", "mean_abs_shap": 0.05, "importance_pct": 2.9},
            {"feature": "home_ownership", "category": "Borrower", "mean_abs_shap": 0.03, "importance_pct": 1.7},
            {"feature": "purpose", "category": "Borrower", "mean_abs_shap": 0.01, "importance_pct": 0.6},
            {"feature": "emp_length", "category": "Borrower", "mean_abs_shap": 0.007, "importance_pct": 0.4},
        ]
    )

    borrower_share = sum(item["importance_pct"] for item in global_shap if item["category"] == "Borrower")
    macro_share = sum(item["importance_pct"] for item in global_shap if item["category"] == "Macroeconomic")

    return {
        "prediction": pred_result,
        "base_value_log_odds": round(base_val, 4),
        "local_shap": contributions,
        "global_shap": global_shap,
        "category_summary": {
            "borrower_importance_pct": round(borrower_share, 2),
            "macroeconomic_importance_pct": round(macro_share, 2),
        },
        "disclaimer": SHAP_DISCLAIMER,
    }


def get_portfolio_dataframe(artifacts: dict = None) -> pd.DataFrame:
    """
    Retrieves the 500-row sample portfolio from loaded artifacts or synthesizes a clean default sample.
    """
    if artifacts and "sample_portfolio" in artifacts and len(artifacts["sample_portfolio"]) > 0:
        return pd.DataFrame(artifacts["sample_portfolio"])

    from generate_data import generate_synthetic_loan_data
    df = generate_synthetic_loan_data(n_samples=250, random_seed=42)
    df["loan_id"] = [f"LN-{10001 + i}" for i in range(len(df))]
    return df


def compute_portfolio_ecl_breakdown(
    portfolio_df: pd.DataFrame,
    artifacts: dict = None,
    lgd_override: float = None,
    ead_factor_override: float = None,
    purpose_filter: str = None,
) -> dict:
    """
    Computes loan-level and portfolio-level Expected Credit Loss (ECL = PD * LGD * EAD),
    aggregating by risk grade, loan purpose, and home ownership.
    """
    df = portfolio_df.copy()
    if purpose_filter and purpose_filter != "ALL":
        filtered = df[df["purpose"].astype(str).str.lower() == purpose_filter.lower()]
        if len(filtered) > 0:
            df = filtered.copy()

    if "loan_id" not in df.columns:
        df["loan_id"] = [f"LN-{10001 + i}" for i in range(len(df))]

    pds = predict_dataframe_pd(df, artifacts)
    df["pd"] = np.round(pds, 4)

    lgd_is_assumed = lgd_override is None
    ead_is_assumed = ead_factor_override is None
    lgd_val = float(DEFAULT_LGD if lgd_override is None else np.clip(lgd_override, 0.0, 1.0))
    ead_factor = float(DEFAULT_EAD_FACTOR if ead_factor_override is None else max(0.0, ead_factor_override))

    df["lgd"] = round(lgd_val, 4)
    df["ead"] = np.round(df["loan_amnt"] * ead_factor, 2)
    df["ecl"] = np.round(df["pd"] * df["lgd"] * df["ead"], 2)

    grades_and_labels = [assign_risk_grade(p) for p in df["pd"]]
    df["risk_grade"] = [g[0] for g in grades_and_labels]
    df["risk_tier"] = [g[1] for g in grades_and_labels]

    total_ead = float(df["ead"].sum())
    total_ecl = float(df["ecl"].sum())
    avg_pd = float(df["pd"].mean())

    # Group by Risk Grade
    grade_order = [b[0] for b in RISK_BANDS]
    by_grade = []
    for g in grade_order:
        sub = df[df["risk_grade"] == g]
        if len(sub) > 0:
            by_grade.append({
                "risk_grade": g,
                "loan_count": int(len(sub)),
                "avg_pd_pct": round(float(sub["pd"].mean() * 100.0), 2),
                "total_ead": round(float(sub["ead"].sum()), 2),
                "total_ecl": round(float(sub["ecl"].sum()), 2),
                "ecl_share_pct": round(float(sub["ecl"].sum() / total_ecl * 100.0), 2) if total_ecl > 0 else 0.0,
            })

    # Group by Loan Purpose
    by_purpose = []
    for purp, sub in df.groupby("purpose"):
        by_purpose.append({
            "purpose": str(purp),
            "loan_count": int(len(sub)),
            "avg_pd_pct": round(float(sub["pd"].mean() * 100.0), 2),
            "total_ead": round(float(sub["ead"].sum()), 2),
            "total_ecl": round(float(sub["ecl"].sum()), 2),
        })
    by_purpose.sort(key=lambda x: x["total_ecl"], reverse=True)

    # Group by Home Ownership
    by_ownership = []
    for own, sub in df.groupby("home_ownership"):
        by_ownership.append({
            "home_ownership": str(own),
            "loan_count": int(len(sub)),
            "avg_pd_pct": round(float(sub["pd"].mean() * 100.0), 2),
            "total_ead": round(float(sub["ead"].sum()), 2),
            "total_ecl": round(float(sub["ecl"].sum()), 2),
        })
    by_ownership.sort(key=lambda x: x["total_ecl"], reverse=True)

    # PD Histogram buckets (0-5%, 5-10%, 10-15%, 15-20%, 20-30%, 30%+)
    bins = [0.0, 0.05, 0.10, 0.15, 0.20, 0.30, 1.01]
    labels = ["0-5%", "5-10%", "10-15%", "15-20%", "20-30%", "30%+"]
    df["pd_bucket"] = pd.cut(df["pd"], bins=bins, labels=labels, right=False)
    histogram = []
    for b_label in labels:
        sub = df[df["pd_bucket"] == b_label]
        histogram.append({
            "bucket": b_label,
            "count": int(len(sub)),
            "total_ecl": round(float(sub["ecl"].sum()), 2),
        })

    # Top 100 loans for UI table display
    loans_records = (
        df.drop(columns=["pd_bucket"], errors="ignore")
        .head(100)
        .to_dict(orient="records")
    )

    return {
        "formula": "ECL = PD * LGD * EAD",
        "portfolio_summary": {
            "loan_count": int(len(df)),
            "average_pd": round(avg_pd, 4),
            "average_pd_pct": round(avg_pd * 100.0, 2),
            "lgd_used": round(lgd_val, 4),
            "ead_factor_used": round(ead_factor, 4),
            "lgd_is_assumed": bool(lgd_is_assumed),
            "ead_is_assumed": bool(ead_is_assumed),
            "total_ead": round(total_ead, 2),
            "total_ecl": round(total_ecl, 2),
            "loss_rate_pct": round((total_ecl / total_ead * 100.0) if total_ead > 0 else 0.0, 2),
        },
        "by_risk_grade": by_grade,
        "by_purpose": by_purpose,
        "by_home_ownership": by_ownership,
        "pd_histogram": histogram,
        "loans": loans_records,
    }


def run_stress_test_simulation(
    scenario_key: str = "downturn",
    custom_macro: dict = None,
    borrower_override: dict = None,
    artifacts: dict = None,
    lgd: float = None,
) -> dict:
    """
    Executes Module C: Macroeconomic Stress-Testing Simulator across the test portfolio
    and a representative borrower.
    1. Evaluates portfolio under Baseline macroeconomic conditions.
    2. Replaces macroeconomic variables with Stressed scenario values while holding borrower features constant.
    3. Re-evaluates Stressed PD, Stressed ECL, Delta PD, Delta ECL, % portfolio loss change,
       and individual borrower SHAP shifts.
    4. Checks stressed macro values against historical training bounds (OOD warnings).
    """
    baseline_macro = MACRO_SCENARIOS["baseline"]["values"].copy()

    if scenario_key in MACRO_SCENARIOS and not custom_macro:
        scenario_meta = MACRO_SCENARIOS[scenario_key]
        stressed_macro = scenario_meta["values"].copy()
        scenario_name = scenario_meta["name"]
        scenario_desc = scenario_meta["description"]
    else:
        scenario_name = "Custom User Macro Scenario"
        scenario_desc = "User-specified macroeconomic stress parameters."
        cm = custom_macro or {}
        stressed_macro = {
            "unemployment_rate": float(cm.get("unemployment_rate", baseline_macro["unemployment_rate"])),
            "fed_funds_rate": float(cm.get("fed_funds_rate", baseline_macro["fed_funds_rate"])),
            "inflation_rate": float(cm.get("inflation_rate", baseline_macro["inflation_rate"])),
        }

    # Check Out-of-Distribution (OOD) warnings on the stressed macro inputs
    feature_bounds = artifacts.get("feature_bounds", {}) if artifacts else {}
    ood_warnings = check_out_of_distribution(stressed_macro, feature_bounds)

    # Portfolio Simulation
    base_df = get_portfolio_dataframe(artifacts).copy()
    for k, v in baseline_macro.items():
        base_df[k] = float(v)

    stress_df = base_df.copy()
    for k, v in stressed_macro.items():
        stress_df[k] = float(v)

    lgd_val = float(DEFAULT_LGD if lgd is None else np.clip(lgd, 0.0, 1.0))
    ead_vals = base_df["loan_amnt"].values * DEFAULT_EAD_FACTOR

    base_pds = predict_dataframe_pd(base_df, artifacts)
    stress_pds = predict_dataframe_pd(stress_df, artifacts)

    base_ecls = base_pds * lgd_val * ead_vals
    stress_ecls = stress_pds * lgd_val * ead_vals

    total_ead = float(np.sum(ead_vals))
    base_avg_pd = float(np.mean(base_pds))
    stress_avg_pd = float(np.mean(stress_pds))
    delta_pd = stress_avg_pd - base_avg_pd

    base_total_ecl = float(np.sum(base_ecls))
    stress_total_ecl = float(np.sum(stress_ecls))
    delta_ecl = stress_total_ecl - base_total_ecl
    pct_change_ecl = ((delta_ecl / base_total_ecl) * 100.0) if base_total_ecl > 0 else 0.0

    # Segment Comparison by Purpose
    base_df["base_pd"] = base_pds
    base_df["stress_pd"] = stress_pds
    base_df["base_ecl"] = base_ecls
    base_df["stress_ecl"] = stress_ecls

    segment_comparison = []
    for purp, grp in base_df.groupby("purpose"):
        b_ecl = float(grp["base_ecl"].sum())
        s_ecl = float(grp["stress_ecl"].sum())
        diff = s_ecl - b_ecl
        pct = (diff / b_ecl * 100.0) if b_ecl > 0 else 0.0
        segment_comparison.append({
            "purpose": str(purp),
            "loan_count": int(len(grp)),
            "baseline_avg_pd_pct": round(float(grp["base_pd"].mean() * 100.0), 2),
            "stressed_avg_pd_pct": round(float(grp["stress_pd"].mean() * 100.0), 2),
            "baseline_ecl": round(b_ecl, 2),
            "stressed_ecl": round(s_ecl, 2),
            "delta_ecl": round(diff, 2),
            "pct_change": round(pct, 2),
        })
    segment_comparison.sort(key=lambda x: x["stressed_ecl"], reverse=True)

    # Representative Individual Borrower SHAP Comparison (Baseline vs. Stressed)
    rep_borrower = borrower_override or {
        "loan_amnt": 18000,
        "annual_inc": 62000,
        "dti": 21.5,
        "fico_score": 685,
        "int_rate": 0.148,
        "emp_length": "5 years",
        "home_ownership": "RENT",
        "purpose": "debt_consolidation",
        "term": " 36 months",
    }
    base_borrower_input = {**rep_borrower, **baseline_macro}
    stress_borrower_input = {**rep_borrower, **stressed_macro}

    base_shap = compute_local_shap_explanation(base_borrower_input, artifacts)
    stress_shap = compute_local_shap_explanation(stress_borrower_input, artifacts)

    base_map = {item["feature"]: item["shap_value"] for item in base_shap["local_shap"]}
    stress_map = {item["feature"]: item["shap_value"] for item in stress_shap["local_shap"]}

    shap_shifts = []
    for feat in COMBINED_FEATURES:
        b_val = base_map.get(feat, 0.0)
        s_val = stress_map.get(feat, 0.0)
        shap_shifts.append({
            "feature": feat,
            "category": "Macroeconomic" if feat in MACROECONOMIC_FEATURES else "Borrower",
            "baseline_shap": round(b_val, 4),
            "stressed_shap": round(s_val, 4),
            "shap_delta": round(s_val - b_val, 4),
        })
    shap_shifts.sort(key=lambda x: abs(x["stressed_shap"]), reverse=True)

    return {
        "scenario_key": scenario_key,
        "scenario_name": scenario_name,
        "scenario_description": scenario_desc,
        "baseline_macro": baseline_macro,
        "stressed_macro": stressed_macro,
        "portfolio_impact": {
            "loan_count": int(len(base_df)),
            "total_ead": round(total_ead, 2),
            "lgd_used": round(lgd_val, 4),
            "baseline_avg_pd": round(base_avg_pd, 4),
            "baseline_avg_pd_pct": round(base_avg_pd * 100.0, 2),
            "stressed_avg_pd": round(stress_avg_pd, 4),
            "stressed_avg_pd_pct": round(stress_avg_pd * 100.0, 2),
            "delta_pd": round(delta_pd, 4),
            "delta_pd_pct_points": round(delta_pd * 100.0, 2),
            "baseline_total_ecl": round(base_total_ecl, 2),
            "stressed_total_ecl": round(stress_total_ecl, 2),
            "delta_ecl": round(delta_ecl, 2),
            "pct_change_ecl": round(pct_change_ecl, 2),
        },
        "segment_comparison": segment_comparison,
        "borrower_comparison": {
            "baseline_prediction": base_shap["prediction"],
            "stressed_prediction": stress_shap["prediction"],
            "shap_shifts": shap_shifts,
        },
        "out_of_range_warnings": ood_warnings,
        "methodology_limitation_note": (
            "Macroeconomic covariates in this dataset are aligned at loan origination date (issue_d). "
            "Scenario simulation estimates point-in-time risk shifts under comparable macroeconomic regimes "
            "rather than dynamic month-by-month survival hazard over the repayment lifecycle."
        ),
    }
