/**
 * Input schema for the CreditWise ML service, mirrored from the real backend:
 *   - ml_service/app.py            -> BorrowerMacroRequest / ECLRequest / StressRequest
 *   - ml_service/config.py         -> feature lists and MACRO_SCENARIOS
 *   - saved_models/artifacts.joblib -> OneHotEncoder categories (see CATEGORY_OPTIONS)
 *
 * IMPORTANT (verified against the live service): the trained encoder uses
 * handle_unknown="ignore", so a value that is not in the training categories is
 * silently encoded as all zeros. In particular `term` MUST be "36 months" /
 * "60 months" WITHOUT a leading space; " 36 months" is an unseen category and the
 * term feature is dropped, which changes the PD materially.
 */

export const CATEGORY_OPTIONS = {
  emp_length: [
    "< 1 year",
    "1 year",
    "2 years",
    "3 years",
    "4 years",
    "5 years",
    "6 years",
    "7 years",
    "8 years",
    "9 years",
    "10+ years",
    "Unknown",
  ],
  // The trained encoder has no OTHER category; offering it would be silently ignored.
  home_ownership: ["MORTGAGE", "RENT", "OWN"],
  purpose: [
    "debt_consolidation",
    "credit_card",
    "home_improvement",
    "major_purchase",
    "small_business",
    "car",
    "medical",
    "moving",
    "house",
    "vacation",
    "other",
  ],
  term: ["36 months", "60 months"],
};

export const PURPOSE_LABELS = {
  debt_consolidation: "Debt consolidation",
  credit_card: "Credit card",
  home_improvement: "Home improvement",
  major_purchase: "Major purchase",
  small_business: "Small business",
  car: "Car",
  medical: "Medical",
  moving: "Moving",
  house: "House",
  vacation: "Vacation",
  other: "Other",
};

export const FEATURE_LABELS = {
  loan_amnt: "Loan amount",
  annual_inc: "Annual income",
  dti: "Debt-to-income",
  fico_score: "FICO score",
  int_rate: "Interest rate",
  emp_length: "Employment length",
  home_ownership: "Home ownership",
  purpose: "Loan purpose",
  term: "Loan term",
  unemployment_rate: "Unemployment rate",
  fed_funds_rate: "Fed funds rate",
  inflation_rate: "Inflation rate",
};

export const MACRO_FEATURES = ["unemployment_rate", "fed_funds_rate", "inflation_rate"];

// Numeric field rules used for client-side validation. Ranges are sanity limits for
// obviously invalid input, NOT model bounds (the backend reports real out-of-range
// conditions itself via out_of_range_warnings).
export const NUMERIC_RULES = {
  loan_amnt: { label: "Loan amount", min: 500, max: 1_000_000, step: 100, unit: "$" },
  annual_inc: { label: "Annual income", min: 1, max: 10_000_000, step: 1000, unit: "$" },
  dti: { label: "Debt-to-income", min: 0, max: 100, step: 0.1, unit: "%" },
  fico_score: { label: "FICO score", min: 300, max: 850, step: 1, unit: "" },
  int_rate: { label: "Interest rate", min: 0.001, max: 1, step: 0.001, unit: "decimal" },
  unemployment_rate: { label: "Unemployment rate", min: 0, max: 30, step: 0.1, unit: "%" },
  fed_funds_rate: { label: "Fed funds rate", min: 0, max: 25, step: 0.05, unit: "%" },
  inflation_rate: { label: "Inflation rate", min: -5, max: 30, step: 0.1, unit: "%" },
};

export const DEFAULT_BORROWER = {
  loan_amnt: 16000,
  annual_inc: 68000,
  dti: 18.5,
  fico_score: 705,
  int_rate: 0.132,
  emp_length: "5 years",
  home_ownership: "MORTGAGE",
  purpose: "debt_consolidation",
  term: "36 months",
  unemployment_rate: 5.0,
  fed_funds_rate: 2.0,
  inflation_rate: 2.2,
};

export const BORROWER_PRESETS = [
  {
    key: "prime",
    label: "Prime borrower (low risk)",
    values: {
      loan_amnt: 10000,
      annual_inc: 115000,
      dti: 9.5,
      fico_score: 775,
      int_rate: 0.072,
      emp_length: "10+ years",
      home_ownership: "OWN",
      purpose: "credit_card",
      term: "36 months",
      unemployment_rate: 5.0,
      fed_funds_rate: 2.0,
      inflation_rate: 2.2,
    },
  },
  { key: "median", label: "Median portfolio borrower", values: { ...DEFAULT_BORROWER } },
  {
    key: "subprime",
    label: "Subprime borrower (high risk)",
    values: {
      loan_amnt: 28000,
      annual_inc: 42000,
      dti: 33.5,
      fico_score: 625,
      int_rate: 0.238,
      emp_length: "< 1 year",
      home_ownership: "RENT",
      purpose: "small_business",
      term: "60 months",
      unemployment_rate: 7.5,
      fed_funds_rate: 4.0,
      inflation_rate: 4.5,
    },
  },
];

/** Validate a borrower form state. Returns { fieldName: message } (empty = valid). */
export function validateBorrower(inputs) {
  const errors = {};
  for (const [field, rule] of Object.entries(NUMERIC_RULES)) {
    const raw = inputs[field];
    if (raw === "" || raw === null || raw === undefined || Number.isNaN(Number(raw))) {
      errors[field] = `${rule.label} is required.`;
      continue;
    }
    const n = Number(raw);
    if (n < rule.min || n > rule.max) {
      errors[field] = `${rule.label} must be between ${rule.min} and ${rule.max}.`;
    }
  }
  for (const field of Object.keys(CATEGORY_OPTIONS)) {
    if (!CATEGORY_OPTIONS[field].includes(inputs[field])) {
      errors[field] = `Choose a valid ${field.replace("_", " ")}.`;
    }
  }
  return errors;
}

/**
 * Build the exact JSON body the backend expects (BorrowerMacroRequest).
 * Numbers are real numbers, strings are trimmed (see note on `term` above).
 */
export function buildBorrowerPayload(inputs) {
  return {
    loan_amnt: Number(inputs.loan_amnt),
    annual_inc: Number(inputs.annual_inc),
    dti: Number(inputs.dti),
    fico_score: Number(inputs.fico_score),
    int_rate: Number(inputs.int_rate),
    emp_length: String(inputs.emp_length).trim(),
    home_ownership: String(inputs.home_ownership).trim().toUpperCase(),
    purpose: String(inputs.purpose).trim().toLowerCase(),
    term: String(inputs.term).trim(),
    unemployment_rate: Number(inputs.unemployment_rate),
    fed_funds_rate: Number(inputs.fed_funds_rate),
    inflation_rate: Number(inputs.inflation_rate),
  };
}
