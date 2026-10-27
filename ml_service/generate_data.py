"""
Synthetic Fallback Data Generator for CreditWise.
Generates a realistic 10,000-row loan portfolio merged with macroeconomic indicators.
Used when raw CSV files are absent or for quick local benchmarking.
"""

import numpy as np
import pandas as pd
from datetime import datetime
from config import DATA_DIR, GENERATED_FILE

def generate_synthetic_loan_data(n_samples: int = 10000, random_seed: int = 42) -> pd.DataFrame:
    """
    Generates a realistic loan book chronologically distributed between 2012-01 and 2018-12.
    Probability of default is synthesized using a calibrated logistic risk equation
    driven by both borrower creditworthiness and macroeconomic pressure.
    """
    np.random.seed(random_seed)
    
    # 1. Chronological Monthly Dates (2012-01 to 2018-12, 84 months)
    date_range = pd.date_range(start="2012-01-01", end="2018-12-01", freq="MS")
    # Weighted slightly towards later years representing loan book expansion
    month_weights = np.linspace(0.8, 1.4, len(date_range))
    month_weights /= month_weights.sum()
    chosen_dates = np.random.choice(date_range, size=n_samples, p=month_weights)
    issue_d = [pd.Timestamp(d).strftime("%Y-%m") for d in chosen_dates]
    
    # 2. Historical-like Macro Trends mapped by year/month
    # 2012-2018 saw unemployment decline from ~8.2% to 3.8%, Fed rate raise from ~0.1% to 2.4%
    macro_lookup = {}
    for dt in date_range:
        year_frac = dt.year + (dt.month - 1) / 12.0
        # Smooth macro paths with noise
        unemp = max(3.5, 8.2 - (year_frac - 2012) * 0.7 + np.random.normal(0, 0.15))
        fed = max(0.08, 0.12 if dt.year < 2016 else 0.12 + (year_frac - 2016) * 0.75 + np.random.normal(0, 0.08))
        infl = max(0.5, 1.8 + 0.4 * np.sin((year_frac - 2012) * np.pi) + np.random.normal(0, 0.2))
        macro_lookup[dt.strftime("%Y-%m")] = (round(unemp, 2), round(fed, 2), round(infl, 2))
        
    unemployment_rates = []
    fed_funds_rates = []
    inflation_rates = []
    for d in issue_d:
        u, f, i = macro_lookup[d]
        unemployment_rates.append(u)
        fed_funds_rates.append(f)
        inflation_rates.append(i)
        
    # 3. Borrower Features
    loan_amnt = np.round(np.random.choice(
        [5000, 7500, 10000, 12000, 15000, 18000, 20000, 25000, 30000, 35000, 40000],
        size=n_samples,
        p=[0.08, 0.08, 0.16, 0.12, 0.15, 0.10, 0.11, 0.08, 0.06, 0.04, 0.02]
    ) + np.random.uniform(-500, 500, size=n_samples), -2)
    loan_amnt = np.clip(loan_amnt, 1000, 40000)

    # Annual income (log-normal distribution)
    annual_inc = np.round(np.exp(np.random.normal(11.0, 0.45, size=n_samples)), -2)
    annual_inc = np.clip(annual_inc, 18000, 280000)

    # DTI (Debt-to-Income ratio, %)
    dti = np.round(np.random.gamma(shape=3.5, scale=5.0, size=n_samples), 2)
    dti = np.clip(dti, 3.0, 44.0)

    # FICO score (bimodal credit distribution: prime and near-prime)
    fico_prime = np.random.normal(735, 30, size=int(n_samples * 0.70))
    fico_sub = np.random.normal(660, 25, size=n_samples - int(n_samples * 0.70))
    fico_score = np.concatenate([fico_prime, fico_sub])
    np.random.shuffle(fico_score)
    fico_score = np.clip(np.round(fico_score), 600, 840).astype(int)

    # Interest rate depends on FICO score and loan amount
    base_int = 0.28 - (fico_score - 600) / (840 - 600) * 0.20
    int_rate = np.clip(np.round(base_int + np.random.normal(0, 0.02, size=n_samples), 4), 0.0532, 0.2899)

    # Categorical borrower attributes
    emp_choices = ["< 1 year", "1 year", "2 years", "3 years", "5 years", "10+ years"]
    emp_weights = [0.10, 0.08, 0.10, 0.12, 0.22, 0.38]
    emp_length = np.random.choice(emp_choices, size=n_samples, p=emp_weights)

    home_choices = ["MORTGAGE", "RENT", "OWN"]
    home_ownership = np.random.choice(home_choices, size=n_samples, p=[0.50, 0.40, 0.10])

    purpose_choices = [
        "debt_consolidation",
        "credit_card",
        "home_improvement",
        "major_purchase",
        "small_business",
        "other",
    ]
    purpose = np.random.choice(purpose_choices, size=n_samples, p=[0.56, 0.22, 0.08, 0.04, 0.03, 0.07])

    term_choices = [" 36 months", " 60 months"]
    term = np.random.choice(term_choices, size=n_samples, p=[0.72, 0.28])

    # 4. Synthesize Zero-Leakage Ground Truth Target 'default'
    # Logistic credit scoring function with sensitivity to macro shocks
    z = (
        -2.20
        + 0.000030 * (loan_amnt - 15000)
        - 0.000010 * (annual_inc - 70000)
        + 0.045000 * (dti - 18.0)
        - 0.018000 * (fico_score - 700)
        + 12.00000 * (int_rate - 0.13)
        + 0.140000 * (np.array(unemployment_rates) - 5.5)
        + 0.080000 * (np.array(fed_funds_rates) - 1.2)
        + 0.060000 * (np.array(inflation_rates) - 2.0)
        + 0.18 * (home_ownership == "RENT")
        + 0.25 * (purpose == "small_business")
        + 0.22 * (term == " 60 months")
    )
    # Add idiosyncratic random borrower risk
    z += np.random.normal(0, 0.35, size=n_samples)
    default_prob = 1.0 / (1.0 + np.exp(-z))
    default = (np.random.uniform(0, 1, size=n_samples) < default_prob).astype(int)

    df = pd.DataFrame({
        "issue_d": issue_d,
        "loan_amnt": loan_amnt,
        "annual_inc": annual_inc,
        "dti": dti,
        "fico_score": fico_score,
        "int_rate": int_rate,
        "emp_length": emp_length,
        "home_ownership": home_ownership,
        "purpose": purpose,
        "term": term,
        "unemployment_rate": unemployment_rates,
        "fed_funds_rate": fed_funds_rates,
        "inflation_rate": inflation_rates,
        "default": default,
    })

    # Sort chronologically by issue_d
    df = df.sort_values("issue_d").reset_index(drop=True)
    return df

if __name__ == "__main__":
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print(f"Generating synthetic fallback dataset with 10,000 samples...")
    dataset = generate_synthetic_loan_data(10000)
    dataset.to_csv(GENERATED_FILE, index=False)
    print(f"Saved fallback dataset to: {GENERATED_FILE}")
    print(f"Shape: {dataset.shape}, Overall Default Rate: {dataset['default'].mean():.2%}")
