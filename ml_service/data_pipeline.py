"""
Data Engineering Pipeline for CreditWise.
Handles loading the full 3.28 GB Mendeley P2P + Macro dataset (P2P_Macro_Data.csv) across all 50 US states,
sample datasets, or fallback generated data.
Enforces zero data leakage, chronological date alignment, time-aware splitting,
feature bound recording, and scikit-learn preprocessing pipelines.
"""

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

from config import (
    BORROWER_CATEGORICAL_FEATURES,
    BORROWER_FEATURES,
    BORROWER_NUMERICAL_FEATURES,
    COMBINED_FEATURES,
    GENERATED_FILE,
    LEAKAGE_COLUMNS,
    MACROECONOMIC_FEATURES,
    RAW_P2P_FILE,
    SAMPLE_ACCEPTED_FILE,
    TARGET_COLUMN,
    TEST_RATIO,
    TRAIN_RATIO,
    VAL_RATIO,
)
from generate_data import generate_synthetic_loan_data

# Historical US Macroeconomic Lookup Table (2007-2019)
HISTORICAL_MACRO_BY_YEAR = {
    2007: {"unemployment_rate": 4.6, "fed_funds_rate": 5.02, "inflation_rate": 2.85},
    2008: {"unemployment_rate": 5.8, "fed_funds_rate": 1.92, "inflation_rate": 3.84},
    2009: {"unemployment_rate": 9.3, "fed_funds_rate": 0.16, "inflation_rate": -0.36},
    2010: {"unemployment_rate": 9.6, "fed_funds_rate": 0.18, "inflation_rate": 1.64},
    2011: {"unemployment_rate": 8.9, "fed_funds_rate": 0.10, "inflation_rate": 3.16},
    2012: {"unemployment_rate": 8.1, "fed_funds_rate": 0.14, "inflation_rate": 2.07},
    2013: {"unemployment_rate": 7.4, "fed_funds_rate": 0.11, "inflation_rate": 1.46},
    2014: {"unemployment_rate": 6.2, "fed_funds_rate": 0.09, "inflation_rate": 1.62},
    2015: {"unemployment_rate": 5.3, "fed_funds_rate": 0.13, "inflation_rate": 0.12},
    2016: {"unemployment_rate": 4.9, "fed_funds_rate": 0.39, "inflation_rate": 1.26},
    2017: {"unemployment_rate": 4.4, "fed_funds_rate": 1.00, "inflation_rate": 2.13},
    2018: {"unemployment_rate": 3.9, "fed_funds_rate": 1.83, "inflation_rate": 2.44},
    2019: {"unemployment_rate": 3.7, "fed_funds_rate": 2.16, "inflation_rate": 1.81},
}

SUBGRADE_TO_FICO = {
    "A1": 790, "A2": 775, "A3": 760, "A4": 750, "A5": 740,
    "B1": 730, "B2": 720, "B3": 710, "B4": 705, "B5": 700,
    "C1": 695, "C2": 690, "C3": 685, "C4": 680, "C5": 675,
    "D1": 670, "D2": 665, "D3": 660, "D4": 655, "D5": 650,
    "E1": 645, "E2": 640, "E3": 635, "E4": 630, "E5": 625,
    "F1": 620, "F2": 615, "F3": 610, "F4": 605, "F5": 600,
    "G1": 595, "G2": 590, "G3": 585, "G4": 580, "G5": 575,
}

GRADE_TO_FICO = {
    "A": 760, "B": 715, "C": 685, "D": 660, "E": 635, "F": 610, "G": 585
}


def parse_issue_date(series: pd.Series) -> pd.Series:
    """
    Standardizes various LendingClub issue_d formats (e.g., 'Aug-12', 'Dec-2015', '2016-05')
    into chronological 'YYYY-MM' strings.
    """
    s = series.astype(str).str.strip()
    parsed = pd.to_datetime(s, format="%b-%y", errors="coerce")
    mask = parsed.isna()
    if mask.any():
        parsed.loc[mask] = pd.to_datetime(s[mask], format="%b-%Y", errors="coerce")
    mask = parsed.isna()
    if mask.any():
        parsed.loc[mask] = pd.to_datetime(s[mask], errors="coerce")
    parsed = parsed.fillna(pd.Timestamp("2015-06-01"))
    return parsed.dt.strftime("%Y-%m")


def clean_int_rate(series: pd.Series) -> pd.Series:
    """
    Normalizes interest rate to a decimal float in [0.0, 1.0] (e.g., 13.5% -> 0.135).
    """
    if series.dtype == object:
        vals = series.astype(str).str.replace("%", "", regex=False).str.strip()
        vals = pd.to_numeric(vals, errors="coerce")
    else:
        vals = pd.to_numeric(series, errors="coerce")
    median_val = vals.median()
    if pd.notna(median_val) and median_val > 1.0:
        vals = vals / 100.0
    return vals.clip(0.01, 0.40)


def load_and_clean_dataset(max_rows: int = 80000) -> tuple[pd.DataFrame, str]:
    """
    Streams across the full 3.28 GB Mendeley P2P + Macro dataset (P2P_Macro_Data.csv)
    in chunks so all 50 US states and origination years (2008-2019) are represented.
    Cleans post-origination leakage, resolves binary default target, and aligns macro features.
    """
    source_name = "generated_fallback"
    df_raw = None

    if RAW_P2P_FILE.exists():
        source_name = f"Mendeley US P2P + Macro Dataset ({RAW_P2P_FILE.name} - Full 3.28 GB Scan)"
        desired_cols = [
            "loan_amnt", "annual_inc", "dti", "int_rate", "emp_length",
            "home_ownership", "purpose", "term", "issue_d", "loan_status",
            "grade", "sub_grade", "FEDFUNDS", "unem_rate", "CPIUS", "cpi"
        ]
        header_cols = pd.read_csv(RAW_P2P_FILE, nrows=0).columns.tolist()
        use_cols = [c for c in desired_cols if c in header_cols]

        valid_paid = {"Fully Paid", "Does not meet the credit policy. Status:Fully Paid"}
        valid_default = {
            "Charged Off",
            "Default",
            "Does not meet the credit policy. Status:Charged Off",
        }
        valid_all = valid_paid | valid_default

        sampled_chunks = []
        chunk_size = 300000
        # Sample ~6% of resolved rows from every chunk across the entire 2.7M row file
        for chunk in pd.read_csv(RAW_P2P_FILE, usecols=use_cols, chunksize=chunk_size, low_memory=False):
            status_s = chunk["loan_status"].astype(str).str.strip()
            resolved = chunk.loc[status_s.isin(valid_all)]
            if len(resolved) > 0:
                take_n = min(len(resolved), max(2000, int(max_rows / 9)))
                sampled_chunks.append(resolved.sample(n=take_n, random_state=42))

        df_raw = pd.concat(sampled_chunks, ignore_index=True)
        if max_rows and len(df_raw) > max_rows:
            df_raw = df_raw.sample(n=max_rows, random_state=42).reset_index(drop=True)

    elif SAMPLE_ACCEPTED_FILE.exists():
        source_name = f"LendingClub Sample + FRED Macro ({SAMPLE_ACCEPTED_FILE.name})"
        df_raw = pd.read_csv(SAMPLE_ACCEPTED_FILE, low_memory=False)

    elif GENERATED_FILE.exists():
        source_name = f"Synthetic Loan + Macro Dataset ({GENERATED_FILE.name})"
        df_raw = pd.read_csv(GENERATED_FILE, low_memory=False)
        if "default" in df_raw.columns and all(c in df_raw.columns for c in COMBINED_FEATURES):
            df_raw = df_raw.sort_values("issue_d").reset_index(drop=True)
            return df_raw, source_name
    else:
        source_name = "Synthetic Loan + Macro Dataset (Auto-Generated)"
        df_raw = generate_synthetic_loan_data(n_samples=10000)
        df_raw.to_csv(GENERATED_FILE, index=False)
        return df_raw, source_name

    # 1. Drop any post-origination leakage columns if present
    cols_to_drop = [c for c in LEAKAGE_COLUMNS if c in df_raw.columns]
    if cols_to_drop:
        df_raw = df_raw.drop(columns=cols_to_drop)

    # 2. Target Variable Resolution & Filtering Unresolved Loans
    if "loan_status" in df_raw.columns:
        status_clean = df_raw["loan_status"].astype(str).str.strip()
        valid_paid = ["Fully Paid", "Does not meet the credit policy. Status:Fully Paid"]
        valid_default = [
            "Charged Off",
            "Default",
            "Does not meet the credit policy. Status:Charged Off",
        ]
        keep_mask = status_clean.isin(valid_paid + valid_default)
        df_raw = df_raw.loc[keep_mask].copy()
        df_raw[TARGET_COLUMN] = status_clean.loc[df_raw.index].isin(valid_default).astype(int)
    elif TARGET_COLUMN not in df_raw.columns:
        raise ValueError("Dataset must contain either 'loan_status' or 'default' target column.")

    # 3. Date Standardization
    if "issue_d" in df_raw.columns:
        df_raw["issue_d"] = parse_issue_date(df_raw["issue_d"])
    else:
        df_raw["issue_d"] = "2015-06"

    # Filter out truncated very late 2018/2019 cohorts where 36/60m loans haven't had time to mature
    # (prevents survival bias in the held-out test set)
    df_raw = df_raw[df_raw["issue_d"] <= "2017-12"].copy()

    # 4. Borrower Numerical Feature Alignment
    df_raw["loan_amnt"] = pd.to_numeric(df_raw.get("loan_amnt", 12000), errors="coerce").fillna(12000).clip(500, 50000)
    df_raw["annual_inc"] = pd.to_numeric(df_raw.get("annual_inc", 65000), errors="coerce").fillna(65000).clip(10000, 500000)
    df_raw["dti"] = pd.to_numeric(df_raw.get("dti", 16.5), errors="coerce").fillna(16.5).clip(0.0, 60.0)
    df_raw["int_rate"] = clean_int_rate(df_raw["int_rate"]) if "int_rate" in df_raw.columns else 0.13

    # FICO Score resolution
    if "fico_score" in df_raw.columns:
        df_raw["fico_score"] = pd.to_numeric(df_raw["fico_score"], errors="coerce").fillna(695).clip(300, 850)
    elif "fico_range_low" in df_raw.columns:
        fico_low = pd.to_numeric(df_raw["fico_range_low"], errors="coerce")
        fico_high = pd.to_numeric(df_raw.get("fico_range_high", fico_low + 4), errors="coerce")
        df_raw["fico_score"] = ((fico_low + fico_high) / 2.0).fillna(695).clip(300, 850)
    elif "sub_grade" in df_raw.columns:
        mapped_fico = df_raw["sub_grade"].astype(str).str.strip().map(SUBGRADE_TO_FICO)
        if "grade" in df_raw.columns:
            mapped_fico = mapped_fico.fillna(df_raw["grade"].astype(str).str.strip().map(GRADE_TO_FICO))
        dti_adj = (18.0 - df_raw["dti"]) * 0.4
        df_raw["fico_score"] = (mapped_fico.fillna(690) + dti_adj).round().clip(550, 840)
    elif "grade" in df_raw.columns:
        mapped_fico = df_raw["grade"].astype(str).str.strip().map(GRADE_TO_FICO).fillna(690)
        df_raw["fico_score"] = mapped_fico.clip(550, 840)
    else:
        df_raw["fico_score"] = 695.0

    # 5. Borrower Categorical Feature Alignment
    df_raw["emp_length"] = df_raw.get("emp_length", pd.Series(["5 years"] * len(df_raw), index=df_raw.index)).fillna("Unknown").astype(str).str.strip()
    df_raw["home_ownership"] = df_raw.get("home_ownership", pd.Series(["RENT"] * len(df_raw), index=df_raw.index)).fillna("OTHER").astype(str).str.strip().str.upper()
    df_raw["home_ownership"] = df_raw["home_ownership"].replace({"ANY": "OTHER", "NONE": "OTHER"})
    df_raw["purpose"] = df_raw.get("purpose", pd.Series(["debt_consolidation"] * len(df_raw), index=df_raw.index)).fillna("other").astype(str).str.strip().str.lower()
    df_raw["term"] = df_raw.get("term", pd.Series([" 36 months"] * len(df_raw), index=df_raw.index)).fillna(" 36 months").astype(str).str.strip()

    # 6. Macroeconomic Feature Alignment (Cross-State & Monthly Variation)
    issue_years = pd.to_datetime(df_raw["issue_d"] + "-01", errors="coerce").dt.year.fillna(2015).astype(int)

    # Unemployment Rate (%)
    if "unemployment_rate" in df_raw.columns:
        unemp = pd.to_numeric(df_raw["unemployment_rate"], errors="coerce")
    elif "unem_rate" in df_raw.columns:
        unemp = pd.to_numeric(df_raw["unem_rate"], errors="coerce")
        if unemp.median() < 1.0:
            unemp = unemp * 100.0
    else:
        unemp = issue_years.map(lambda y: HISTORICAL_MACRO_BY_YEAR.get(y, HISTORICAL_MACRO_BY_YEAR[2015])["unemployment_rate"])
    df_raw["unemployment_rate"] = unemp.fillna(5.5).round(2).clip(2.5, 15.0)

    # Federal Funds Rate (%)
    if "fed_funds_rate" in df_raw.columns:
        fed = pd.to_numeric(df_raw["fed_funds_rate"], errors="coerce")
    elif "FEDFUNDS" in df_raw.columns:
        fed = pd.to_numeric(df_raw["FEDFUNDS"], errors="coerce")
    else:
        fed = issue_years.map(lambda y: HISTORICAL_MACRO_BY_YEAR.get(y, HISTORICAL_MACRO_BY_YEAR[2015])["fed_funds_rate"])
    df_raw["fed_funds_rate"] = fed.fillna(1.2).round(2).clip(0.0, 10.0)

    # Inflation Rate (YoY % with state-level CPI differential)
    if "inflation_rate" in df_raw.columns:
        infl = pd.to_numeric(df_raw["inflation_rate"], errors="coerce")
    elif "cpi" in df_raw.columns or "CPIUS" in df_raw.columns:
        base_infl = issue_years.map(lambda y: HISTORICAL_MACRO_BY_YEAR.get(y, HISTORICAL_MACRO_BY_YEAR[2015])["inflation_rate"])
        if "cpi" in df_raw.columns:
            cpi_col = pd.to_numeric(df_raw["cpi"], errors="coerce").fillna(100.0)
            cpi_dev = (cpi_col - cpi_col.median()) / 15.0
            infl = base_infl + cpi_dev
        else:
            infl = base_infl
    else:
        infl = issue_years.map(lambda y: HISTORICAL_MACRO_BY_YEAR.get(y, HISTORICAL_MACRO_BY_YEAR[2015])["inflation_rate"])
    df_raw["inflation_rate"] = infl.fillna(2.0).round(2).clip(-1.0, 12.0)

    # Keep only standardized columns + issue_d + target
    final_cols = ["issue_d"] + COMBINED_FEATURES + [TARGET_COLUMN]
    df_clean = df_raw[final_cols].copy()

    # Sort chronologically by issue_d
    df_clean = df_clean.sort_values("issue_d").reset_index(drop=True)
    return df_clean, source_name


def chronological_split(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    """
    Splits a chronologically sorted DataFrame into Train (70%), Validation (15%), and Test (15%) sets.
    Never shuffles across time to prevent future-to-past data leakage.
    """
    df_sorted = df.sort_values("issue_d").reset_index(drop=True)
    n = len(df_sorted)
    train_end = int(n * TRAIN_RATIO)
    val_end = int(n * (TRAIN_RATIO + VAL_RATIO))

    train_df = df_sorted.iloc[:train_end].reset_index(drop=True)
    val_df = df_sorted.iloc[train_end:val_end].reset_index(drop=True)
    test_df = df_sorted.iloc[val_end:].reset_index(drop=True)

    return train_df, val_df, test_df


def compute_feature_bounds(train_df: pd.DataFrame) -> dict:
    """
    Records the observed minimum, maximum, mean, and median of every numerical and macroeconomic
    feature in the training set for Out-Of-Distribution (OOD) detection during stress testing.
    """
    bounds = {}
    numeric_cols = BORROWER_NUMERICAL_FEATURES + MACROECONOMIC_FEATURES
    for col in numeric_cols:
        if col in train_df.columns:
            series = pd.to_numeric(train_df[col], errors="coerce").dropna()
            bounds[col] = {
                "min": float(np.round(series.min(), 4)),
                "max": float(np.round(series.max(), 4)),
                "mean": float(np.round(series.mean(), 4)),
                "median": float(np.round(series.median(), 4)),
                "p5": float(np.round(np.percentile(series, 5), 4)),
                "p95": float(np.round(np.percentile(series, 95), 4)),
            }
    return bounds


def build_preprocessors() -> tuple[ColumnTransformer, ColumnTransformer]:
    """
    Constructs two scikit-learn ColumnTransformer preprocessing pipelines:
    1. preprocessor_borrower (Track A: Borrower-Only features)
    2. preprocessor_combined (Track B: Borrower + Macroeconomic features)
    """
    num_pipeline_borrower = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])

    cat_pipeline_borrower = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])

    preprocessor_borrower = ColumnTransformer(
        transformers=[
            ("num", num_pipeline_borrower, BORROWER_NUMERICAL_FEATURES),
            ("cat", cat_pipeline_borrower, BORROWER_CATEGORICAL_FEATURES),
        ],
        remainder="drop",
    )

    num_pipeline_combined = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("scaler", StandardScaler()),
    ])

    cat_pipeline_combined = Pipeline([
        ("imputer", SimpleImputer(strategy="most_frequent")),
        ("onehot", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
    ])

    preprocessor_combined = ColumnTransformer(
        transformers=[
            ("num", num_pipeline_combined, BORROWER_NUMERICAL_FEATURES + MACROECONOMIC_FEATURES),
            ("cat", cat_pipeline_combined, BORROWER_CATEGORICAL_FEATURES),
        ],
        remainder="drop",
    )

    return preprocessor_borrower, preprocessor_combined


def get_transformed_feature_names(preprocessor: ColumnTransformer) -> list[str]:
    """
    Extracts clean human-readable feature names from a fitted ColumnTransformer.
    """
    raw_names = preprocessor.get_feature_names_out()
    clean_names = []
    for name in raw_names:
        if "__" in name:
            clean_names.append(name.split("__", 1)[1])
        else:
            clean_names.append(name)
    return clean_names
