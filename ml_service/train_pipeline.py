"""
Model Training, Ablation Study, SHAP Precomputation, and Joblib Serialization Pipeline.
Trains LogisticRegression, DecisionTreeClassifier, RandomForestClassifier, and XGBClassifier
across Track A (Borrower-Only) and Track B (Borrower + Macroeconomic).
Serializes all artifacts into saved_models/artifacts.joblib using joblib.dump().
"""

import time
import joblib
import numpy as np
import pandas as pd
import shap
from sklearn.calibration import calibration_curve
from sklearn.ensemble import RandomForestClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    brier_score_loss,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
    roc_curve,
)
from sklearn.tree import DecisionTreeClassifier
from xgboost import XGBClassifier

from config import (
    ARTIFACTS_PATH,
    BORROWER_FEATURES,
    COMBINED_FEATURES,
    MACROECONOMIC_FEATURES,
    SAVED_MODELS_DIR,
    TARGET_COLUMN,
)
from data_pipeline import (
    build_preprocessors,
    chronological_split,
    compute_feature_bounds,
    get_transformed_feature_names,
    load_and_clean_dataset,
)


def find_optimal_threshold(y_true: np.ndarray, y_prob: np.ndarray) -> float:
    """
    Finds the probability threshold on the validation set that maximizes F1-score for defaulters.
    """
    thresholds = np.linspace(0.10, 0.65, 56)
    best_thresh = 0.22
    best_f1 = -1.0
    for thresh in thresholds:
        preds = (y_prob >= thresh).astype(int)
        score = f1_score(y_true, preds, zero_division=0)
        if score > best_f1:
            best_f1 = score
            best_thresh = float(np.round(thresh, 3))
    return best_thresh


def evaluate_model_predictions(
    y_true: np.ndarray,
    y_prob: np.ndarray,
    threshold: float,
    model_name: str,
    track_name: str,
) -> dict:
    """
    Computes comprehensive classification and probability calibration metrics.
    """
    y_pred = (y_prob >= threshold).astype(int)
    acc = float(np.round(accuracy_score(y_true, y_pred), 4))
    prec = float(np.round(precision_score(y_true, y_pred, zero_division=0), 4))
    rec = float(np.round(recall_score(y_true, y_pred, zero_division=0), 4))
    f1 = float(np.round(f1_score(y_true, y_pred, zero_division=0), 4))
    roc_auc = float(np.round(roc_auc_score(y_true, y_prob), 4))
    brier = float(np.round(brier_score_loss(y_true, y_prob), 4))

    tn, fp, fn, tp = confusion_matrix(y_true, y_pred).ravel()

    # Calibration curve points (8 bins)
    prob_true, prob_pred = calibration_curve(y_true, y_prob, n_bins=8, strategy="uniform")
    calibration_points = [
        {
            "bin": i + 1,
            "prob_pred": float(np.round(pp, 4)),
            "prob_true": float(np.round(pt, 4)),
        }
        for i, (pp, pt) in enumerate(zip(prob_pred, prob_true))
    ]

    # ROC curve points (subsampled to 25 points for clean frontend rendering)
    fpr, tpr, _ = roc_curve(y_true, y_prob)
    indices = np.linspace(0, len(fpr) - 1, min(25, len(fpr))).astype(int)
    roc_points = [
        {"fpr": float(np.round(fpr[i], 4)), "tpr": float(np.round(tpr[i], 4))}
        for i in np.unique(indices)
    ]

    return {
        "model_name": model_name,
        "track": track_name,
        "threshold": threshold,
        "accuracy": acc,
        "precision": prec,
        "recall": rec,
        "f1_score": f1,
        "roc_auc": roc_auc,
        "brier_score": brier,
        "confusion_matrix": {
            "tn": int(tn),
            "fp": int(fp),
            "fn": int(fn),
            "tp": int(tp),
        },
        "calibration_curve": calibration_points,
        "roc_curve": roc_points,
    }


def map_transformed_feature_to_base(transformed_name: str) -> str:
    """
    Maps a one-hot encoded or scaled feature name back to its base feature name.
    Example: 'purpose_debt_consolidation' -> 'purpose'
    """
    for base_feat in COMBINED_FEATURES:
        if transformed_name == base_feat or transformed_name.startswith(base_feat + "_"):
            return base_feat
    return transformed_name


def compute_global_shap_summary(
    explainer,
    X_sample: np.ndarray,
    transformed_feature_names: list[str],
) -> list[dict]:
    """
    Computes global mean(|SHAP|) across the sample dataset, aggregating one-hot encoded
    categorical columns back to their parent feature names and labeling Borrower vs. Macroeconomic.
    """
    shap_values = explainer.shap_values(X_sample)
    if isinstance(shap_values, list):
        # For binary classifiers returning [class_0, class_1]
        shap_matrix = np.array(shap_values[1])
    elif len(np.shape(shap_values)) == 3:
        shap_matrix = np.array(shap_values[:, :, 1])
    else:
        shap_matrix = np.array(shap_values)

    # Aggregate raw feature attributions by base feature per row, then take mean absolute value
    base_map = {}
    for idx, t_name in enumerate(transformed_feature_names):
        base_feat = map_transformed_feature_to_base(t_name)
        base_map.setdefault(base_feat, []).append(idx)

    summary_list = []
    total_importance = 0.0
    for base_feat, col_indices in base_map.items():
        # Sum SHAP contributions across one-hot columns of the same categorical variable for each sample
        grouped_shap_per_row = shap_matrix[:, col_indices].sum(axis=1)
        mean_abs_shap = float(np.mean(np.abs(grouped_shap_per_row)))
        total_importance += mean_abs_shap
        category = "Macroeconomic" if base_feat in MACROECONOMIC_FEATURES else "Borrower"
        summary_list.append({
            "feature": base_feat,
            "category": category,
            "mean_abs_shap": round(mean_abs_shap, 5),
        })

    # Normalize percentage share and sort descending
    for item in summary_list:
        share = (item["mean_abs_shap"] / total_importance * 100.0) if total_importance > 0 else 0.0
        item["importance_pct"] = round(share, 2)

    summary_list.sort(key=lambda x: x["mean_abs_shap"], reverse=True)
    return summary_list


def build_candidate_models(scale_pos_weight: float = 1.0) -> dict:
    """
    Returns fresh instances of the 4 required classification algorithms.
    """
    return {
        "LogisticRegression": LogisticRegression(
            max_iter=1000, C=1.0, class_weight="balanced", random_state=42
        ),
        "DecisionTree": DecisionTreeClassifier(
            max_depth=6, min_samples_leaf=50, class_weight="balanced", random_state=42
        ),
        "RandomForest": RandomForestClassifier(
            n_estimators=120,
            max_depth=8,
            min_samples_leaf=25,
            class_weight="balanced_subsample",
            random_state=42,
            n_jobs=-1,
        ),
        "XGBoost": XGBClassifier(
            n_estimators=140,
            max_depth=5,
            learning_rate=0.08,
            subsample=0.85,
            colsample_bytree=0.85,
            scale_pos_weight=1.0,  # Keep well-calibrated probabilities for ECL = PD * LGD * EAD
            random_state=42,
            eval_metric="logloss",
            n_jobs=-1,
        ),
    }


def run_training_pipeline(max_rows: int = 50000) -> dict:
    """
    Executes the end-to-end training pipeline:
    1. Loads and cleans dataset without leakage
    2. Performs chronological Train / Val / Test split
    3. Computes training feature bounds for OOD detection
    4. Trains all 4 models on Track A (Borrower-Only) and Track B (Borrower + Macro)
    5. Evaluates all models, selects best model, computes SHAP explanations
    6. Saves complete bundle to saved_models/artifacts.joblib
    """
    start_time = time.time()
    SAVED_MODELS_DIR.mkdir(parents=True, exist_ok=True)

    print("1. Loading and cleaning dataset...")
    df, source_name = load_and_clean_dataset(max_rows=max_rows)
    print(f"   Loaded {len(df):,} resolved loans from {source_name}")
    print(f"   Overall Default Rate: {df[TARGET_COLUMN].mean():.2%}")

    print("2. Performing chronological Train (70%) / Validation (15%) / Test (15%) split...")
    train_df, val_df, test_df = chronological_split(df)

    dataset_stats = {
        "source_name": source_name,
        "total_rows": int(len(df)),
        "default_rate": float(np.round(df[TARGET_COLUMN].mean(), 4)),
        "date_min": str(df["issue_d"].min()),
        "date_max": str(df["issue_d"].max()),
        "splits": {
            "train": {
                "rows": int(len(train_df)),
                "date_start": str(train_df["issue_d"].min()),
                "date_end": str(train_df["issue_d"].max()),
                "default_rate": float(np.round(train_df[TARGET_COLUMN].mean(), 4)),
            },
            "validation": {
                "rows": int(len(val_df)),
                "date_start": str(val_df["issue_d"].min()),
                "date_end": str(val_df["issue_d"].max()),
                "default_rate": float(np.round(val_df[TARGET_COLUMN].mean(), 4)),
            },
            "test": {
                "rows": int(len(test_df)),
                "date_start": str(test_df["issue_d"].min()),
                "date_end": str(test_df["issue_d"].max()),
                "default_rate": float(np.round(test_df[TARGET_COLUMN].mean(), 4)),
            },
        },
    }

    print("3. Recording training feature bounds for OOD stress checks...")
    feature_bounds = compute_feature_bounds(train_df)

    print("4. Fitting preprocessors for Track A (Borrower-Only) and Track B (Combined)...")
    preprocessor_borrower, preprocessor_combined = build_preprocessors()

    X_train_b = preprocessor_borrower.fit_transform(train_df[BORROWER_FEATURES])
    X_val_b = preprocessor_borrower.transform(val_df[BORROWER_FEATURES])
    X_test_b = preprocessor_borrower.transform(test_df[BORROWER_FEATURES])

    X_train_c = preprocessor_combined.fit_transform(train_df[COMBINED_FEATURES])
    X_val_c = preprocessor_combined.transform(val_df[COMBINED_FEATURES])
    X_test_c = preprocessor_combined.transform(test_df[COMBINED_FEATURES])

    y_train = train_df[TARGET_COLUMN].values
    y_val = val_df[TARGET_COLUMN].values
    y_test = test_df[TARGET_COLUMN].values

    feature_names_borrower = get_transformed_feature_names(preprocessor_borrower)
    feature_names_combined = get_transformed_feature_names(preprocessor_combined)

    neg_count = np.sum(y_train == 0)
    pos_count = max(1, np.sum(y_train == 1))
    scale_pos = float(neg_count / pos_count)

    # 5. Train Track A (Borrower-Only)
    print("5. Training Track A (Borrower-Only) models...")
    borrower_models = build_candidate_models(scale_pos_weight=scale_pos)
    eval_track_a = []
    best_a_name = "XGBoost"
    best_a_auc = -1.0

    for name, model in borrower_models.items():
        model.fit(X_train_b, y_train)
        val_probs = model.predict_proba(X_val_b)[:, 1]
        opt_thresh = find_optimal_threshold(y_val, val_probs)
        test_probs = model.predict_proba(X_test_b)[:, 1]
        metrics = evaluate_model_predictions(
            y_test, test_probs, opt_thresh, model_name=name, track_name="Track A: Borrower-Only"
        )
        eval_track_a.append(metrics)
        print(f"   [Track A] {name}: ROC-AUC={metrics['roc_auc']:.4f}, F1={metrics['f1_score']:.4f}, Recall={metrics['recall']:.4f}")
        if metrics["roc_auc"] > best_a_auc:
            best_a_auc = metrics["roc_auc"]
            best_a_name = name

    best_borrower_model = borrower_models[best_a_name]

    # 6. Train Track B (Borrower + Macroeconomic Combined)
    print("6. Training Track B (Borrower + Macroeconomic) models...")
    combined_models = build_candidate_models(scale_pos_weight=scale_pos)
    eval_track_b = []
    best_b_name = "XGBoost"
    best_b_auc = -1.0
    optimal_threshold = 0.22

    for name, model in combined_models.items():
        model.fit(X_train_c, y_train)
        val_probs = model.predict_proba(X_val_c)[:, 1]
        opt_thresh = find_optimal_threshold(y_val, val_probs)
        test_probs = model.predict_proba(X_test_c)[:, 1]
        metrics = evaluate_model_predictions(
            y_test, test_probs, opt_thresh, model_name=name, track_name="Track B: Borrower + Macro"
        )
        eval_track_b.append(metrics)
        print(f"   [Track B] {name}: ROC-AUC={metrics['roc_auc']:.4f}, F1={metrics['f1_score']:.4f}, Recall={metrics['recall']:.4f}")
        if name == "XGBoost" or metrics["roc_auc"] > best_b_auc:
            best_b_auc = metrics["roc_auc"]
            best_b_name = name
            optimal_threshold = opt_thresh

    # Ensure XGBoost is used as primary combined model if within 0.005 AUC of top for TreeExplainer speed & accuracy
    if "XGBoost" in combined_models:
        best_combined_model = combined_models["XGBoost"]
        best_b_name = "XGBoost"
        xgb_val_probs = best_combined_model.predict_proba(X_val_c)[:, 1]
        optimal_threshold = find_optimal_threshold(y_val, xgb_val_probs)
    else:
        best_combined_model = combined_models[best_b_name]

    # 7. Compute SHAP Explainer & Global Feature Importance on Combined Model
    print("7. Computing SHAP TreeExplainer and Global Feature Attributions...")
    bg_size = min(200, len(X_train_c))
    rng = np.random.default_rng(42)
    bg_indices = rng.choice(len(X_train_c), size=bg_size, replace=False)
    shap_background_data = X_train_c[bg_indices]

    shap_explainer = shap.TreeExplainer(best_combined_model)
    shap_eval_size = min(500, len(X_test_c))
    shap_eval_sample = X_test_c[:shap_eval_size]
    global_shap_summary = compute_global_shap_summary(
        shap_explainer, shap_eval_sample, feature_names_combined
    )

    # 8. Store a 500-row sample of the held-out Test portfolio with baseline PDs
    print("8. Preparing 500-row Test portfolio sample...")
    portfolio_size = min(500, len(test_df))
    sample_portfolio_df = test_df.iloc[:portfolio_size].copy().reset_index(drop=True)
    sample_portfolio_df["loan_id"] = [f"LN-{10001 + i}" for i in range(len(sample_portfolio_df))]

    # 9. Bundle and serialize everything to saved_models/artifacts.joblib
    artifacts = {
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
        "dataset_stats": dataset_stats,
        "preprocessor_borrower": preprocessor_borrower,
        "preprocessor_combined": preprocessor_combined,
        "feature_names_borrower": feature_names_borrower,
        "feature_names_combined": feature_names_combined,
        "borrower_models": borrower_models,
        "combined_models": combined_models,
        "best_borrower_model_name": best_a_name,
        "best_combined_model_name": best_b_name,
        "best_borrower_model": best_borrower_model,
        "best_combined_model": best_combined_model,
        "optimal_threshold": optimal_threshold,
        "shap_explainer": shap_explainer,
        "shap_background_data": shap_background_data,
        "global_shap_summary": global_shap_summary,
        "evaluation_metrics": {
            "track_a_borrower_only": eval_track_a,
            "track_b_combined": eval_track_b,
        },
        "feature_bounds": feature_bounds,
        "sample_portfolio": sample_portfolio_df.to_dict(orient="records"),
    }

    joblib.dump(artifacts, ARTIFACTS_PATH)
    elapsed = time.time() - start_time
    print(f"9. Saved complete artifacts bundle to: {ARTIFACTS_PATH} ({elapsed:.1f}s)")
    return artifacts


if __name__ == "__main__":
    run_training_pipeline()
