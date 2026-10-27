"""
Configuration settings for CreditWise Machine Learning and Risk Engine service.
Contains feature lists, macro scenarios, file paths, and default risk parameters.
"""

from pathlib import Path

# Paths
BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
SAVED_MODELS_DIR = BASE_DIR / "saved_models"
ARTIFACTS_PATH = SAVED_MODELS_DIR / "artifacts.joblib"

RAW_P2P_FILE = DATA_DIR / "P2P_Macro_Data.csv"
SAMPLE_ACCEPTED_FILE = DATA_DIR / "accepted_2007_to_2018Q4_sample.csv"
GENERATED_FILE = DATA_DIR / "generated_loans_macro.csv"

# Feature definitions
BORROWER_NUMERICAL_FEATURES = [
    "loan_amnt",
    "annual_inc",
    "dti",
    "fico_score",
    "int_rate",
]

BORROWER_CATEGORICAL_FEATURES = [
    "emp_length",
    "home_ownership",
    "purpose",
    "term",
]

BORROWER_FEATURES = BORROWER_NUMERICAL_FEATURES + BORROWER_CATEGORICAL_FEATURES

MACROECONOMIC_FEATURES = [
    "unemployment_rate",
    "fed_funds_rate",
    "inflation_rate",
]

COMBINED_FEATURES = BORROWER_FEATURES + MACROECONOMIC_FEATURES

# Target definition
TARGET_COLUMN = "default"

# Post-origination / leakage columns to strictly exclude
LEAKAGE_COLUMNS = [
    "recoveries",
    "collection_recovery_fee",
    "total_pymnt",
    "total_pymnt_inv",
    "total_rec_prncp",
    "total_rec_int",
    "total_rec_late_fee",
    "last_pymnt_d",
    "last_pymnt_amnt",
    "next_pymnt_d",
    "last_credit_pull_d",
    "last_fico_range_high",
    "last_fico_range_low",
    "pymnt_plan",
    "settlement_status",
    "debt_settlement_flag",
    "hardship_flag",
]

# Macroeconomic Stress Scenarios (Historical & Hypothetical)
MACRO_SCENARIOS = {
    "baseline": {
        "name": "Baseline Scenario (Historical Median)",
        "description": "Historical median conditions in a stable macroeconomic environment.",
        "values": {
            "unemployment_rate": 5.0,
            "fed_funds_rate": 2.0,
            "inflation_rate": 2.2,
        },
    },
    "downturn": {
        "name": "Economic Downturn (Elevated Stress)",
        "description": "Rising unemployment and tightened monetary conditions reflecting a moderate recession.",
        "values": {
            "unemployment_rate": 8.2,
            "fed_funds_rate": 4.5,
            "inflation_rate": 5.0,
        },
    },
    "severe": {
        "name": "Severe Adverse Scenario (Crisis Level)",
        "description": "Deep stagflationary recession with double-digit unemployment and rate hikes.",
        "values": {
            "unemployment_rate": 11.0,
            "fed_funds_rate": 6.0,
            "inflation_rate": 7.5,
        },
    },
}

# Regulatory and Default Expected Credit Loss (ECL) Assumptions
DEFAULT_LGD = 0.45  # Basel II / CECL uncollateralized retail default assumption
DEFAULT_EAD_FACTOR = 1.0  # Assumes 100% of loan_amnt is exposed at default if unpaid

# Risk Rating Bands based on Probability of Default (PD)
RISK_BANDS = [
    ("AAA", 0.00, 0.02, "Prime Low-Risk"),
    ("AA", 0.02, 0.05, "Prime Standard"),
    ("A", 0.05, 0.08, "High Quality"),
    ("BBB", 0.08, 0.12, "Investment Grade Upper"),
    ("BB", 0.12, 0.18, "Subprime Moderate Risk"),
    ("B", 0.18, 0.25, "Subprime High Risk"),
    ("CCC", 0.25, 0.35, "Vulnerable / Speculative"),
    ("D", 0.35, 1.00, "Default Imminent / Extremely High Risk"),
]

# Chronological split ratios
TRAIN_RATIO = 0.70
VAL_RATIO = 0.15
TEST_RATIO = 0.15

# Default classification threshold if not calibrated
DEFAULT_CLASSIFICATION_THRESHOLD = 0.20
