"""
Pytest Unit Test Suite for CreditWise Risk Engine & Data Pipeline.
Tests ECL mathematical accuracy (ECL = PD * LGD * EAD), PD probability bounds,
chronological splitting without data leakage, OOD warning detection, and Stress Testing.
"""

import numpy as np
import pandas as pd
import pytest

from config import DEFAULT_LGD
from data_pipeline import chronological_split, compute_feature_bounds
from generate_data import generate_synthetic_loan_data
from risk_engine import (
    SHAP_DISCLAIMER,
    assign_risk_grade,
    check_out_of_distribution,
    compute_ecl_math,
    compute_local_shap_explanation,
    predict_single_borrower,
    run_stress_test_simulation,
)


def test_ecl_mathematical_identity_default_assumptions():
    """Verifies ECL = PD * LGD * EAD with default LGD=0.45 and EAD=loan_amnt."""
    pd_val = 0.12
    loan_amnt = 20000.0
    res = compute_ecl_math(pd_val=pd_val, loan_amnt=loan_amnt)

    expected_ecl = round(pd_val * DEFAULT_LGD * loan_amnt, 2)
    assert res["lgd"] == 0.45
    assert res["ead"] == 20000.0
    assert res["ecl"] == expected_ecl
    assert res["lgd_is_assumed"] is True
    assert res["ead_is_assumed"] is True


def test_ecl_custom_lgd_and_ead_overrides():
    """Verifies ECL = PD * LGD * EAD when custom LGD and EAD are explicitly supplied."""
    pd_val = 0.25
    loan_amnt = 15000.0
    custom_lgd = 0.60
    custom_ead = 12000.0

    res = compute_ecl_math(
        pd_val=pd_val, loan_amnt=loan_amnt, lgd=custom_lgd, ead=custom_ead
    )
    assert res["lgd"] == 0.60
    assert res["ead"] == 12000.0
    assert res["ecl"] == round(0.25 * 0.60 * 12000.0, 2)
    assert res["lgd_is_assumed"] is False
    assert res["ead_is_assumed"] is False


def test_pd_probability_bounds_and_risk_grades():
    """Verifies predicted PD is strictly bounded in [0, 1] and maps to valid risk grades."""
    low_risk_borrower = {
        "loan_amnt": 8000,
        "annual_inc": 140000,
        "dti": 8.0,
        "fico_score": 790,
        "int_rate": 0.065,
        "emp_length": "10+ years",
        "home_ownership": "OWN",
        "purpose": "credit_card",
        "term": " 36 months",
        "unemployment_rate": 4.2,
        "fed_funds_rate": 1.5,
        "inflation_rate": 1.8,
    }
    high_risk_borrower = {
        "loan_amnt": 35000,
        "annual_inc": 32000,
        "dti": 38.0,
        "fico_score": 610,
        "int_rate": 0.255,
        "emp_length": "< 1 year",
        "home_ownership": "RENT",
        "purpose": "small_business",
        "term": " 60 months",
        "unemployment_rate": 9.5,
        "fed_funds_rate": 5.2,
        "inflation_rate": 6.0,
    }

    pred_low = predict_single_borrower(low_risk_borrower)
    pred_high = predict_single_borrower(high_risk_borrower)

    assert 0.0 <= pred_low["pd"] <= 1.0
    assert 0.0 <= pred_high["pd"] <= 1.0
    assert pred_high["pd"] > pred_low["pd"]
    assert pred_high["ecl"] > pred_low["ecl"]

    grade, _ = assign_risk_grade(0.015)
    assert grade == "AAA"
    grade_d, _ = assign_risk_grade(0.45)
    assert grade_d == "D"


def test_out_of_distribution_warning_detector():
    """Verifies OOD detector flags macroeconomic inputs outside historical training bounds."""
    bounds = {
        "unemployment_rate": {"min": 3.7, "max": 9.6},
        "fed_funds_rate": {"min": 0.07, "max": 5.02},
        "inflation_rate": {"min": -0.36, "max": 3.84},
    }
    in_bounds_input = {
        "unemployment_rate": 5.5,
        "fed_funds_rate": 2.0,
        "inflation_rate": 2.2,
    }
    assert len(check_out_of_distribution(in_bounds_input, bounds)) == 0

    extreme_input = {
        "unemployment_rate": 12.5,  # > 9.6
        "fed_funds_rate": 6.5,      # > 5.02
        "inflation_rate": 2.0,      # in range
    }
    warnings = check_out_of_distribution(extreme_input, bounds)
    flagged_features = {w["feature"] for w in warnings}
    assert "unemployment_rate" in flagged_features
    assert "fed_funds_rate" in flagged_features
    assert "inflation_rate" not in flagged_features


def test_stress_testing_simulation_monotonicity():
    """Verifies Severe Adverse macroeconomic scenario increases portfolio PD and ECL vs Baseline."""
    artifacts = {
        "feature_bounds": {
            "unemployment_rate": {"min": 3.7, "max": 9.6},
            "fed_funds_rate": {"min": 0.07, "max": 5.02},
            "inflation_rate": {"min": -0.36, "max": 3.84},
        }
    }
    sim_downturn = run_stress_test_simulation(scenario_key="downturn", artifacts=artifacts)
    sim_severe = run_stress_test_simulation(scenario_key="severe", artifacts=artifacts)

    impact_down = sim_downturn["portfolio_impact"]
    impact_sev = sim_severe["portfolio_impact"]

    assert impact_down["stressed_avg_pd"] > impact_down["baseline_avg_pd"]
    assert impact_down["stressed_total_ecl"] > impact_down["baseline_total_ecl"]
    assert impact_sev["stressed_total_ecl"] > impact_down["stressed_total_ecl"]
    assert len(sim_severe["out_of_range_warnings"]) > 0


def test_shap_explanation_and_disclaimer():
    """Verifies local and global SHAP output structure and non-causality disclaimer."""
    sample = {
        "loan_amnt": 16000,
        "annual_inc": 60000,
        "dti": 20.0,
        "fico_score": 680,
        "int_rate": 0.145,
        "unemployment_rate": 6.0,
        "fed_funds_rate": 2.5,
        "inflation_rate": 3.0,
    }
    exp = compute_local_shap_explanation(sample)
    assert exp["disclaimer"] == SHAP_DISCLAIMER
    assert len(exp["local_shap"]) == 12
    assert len(exp["global_shap"]) == 12


def test_chronological_split_no_time_leakage():
    """Verifies Train, Validation, and Test sets are strictly ordered in time."""
    df = generate_synthetic_loan_data(n_samples=500, random_seed=42)
    train_df, val_df, test_df = chronological_split(df)

    assert len(train_df) + len(val_df) + len(test_df) == 500
    assert train_df["issue_d"].max() <= val_df["issue_d"].min()
    assert val_df["issue_d"].max() <= test_df["issue_d"].min()

    bounds = compute_feature_bounds(train_df)
    assert "loan_amnt" in bounds
    assert bounds["loan_amnt"]["min"] <= bounds["loan_amnt"]["max"]
