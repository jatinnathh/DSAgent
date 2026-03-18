# backend/tools/preprocessing.py
"""
Advanced preprocessing tools for DSAgent pipelines.
Registered in tool_registry — called via /execute-tool API.

Tools:
  standard_scaler        — Z-score standardisation (μ=0, σ=1)
  min_max_scaler         — Scale to [0,1] (or custom range)
  robust_scaler          — Median/IQR-based scaling (outlier-robust)
  log_transform          — log1p skew reduction
  one_hot_encode         — Pandas get_dummies encoding
  label_encode           — LabelEncoder (ordinal / tree models)
  pca_transform          — PCA dimensionality reduction
  polynomial_features    — Interaction / polynomial terms
  drop_columns           — Remove a column from the dataset
  train_test_split       — Split dataset and report class balance
  cross_validate_model   — k-fold CV on Random Forest / XGBoost / LGB / SVM
  hyperparameter_tune    — GridSearchCV on best model
"""

import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional
import io
import base64
import os

# ── ML imports ──────────────────────────────────────────────────────────────
from sklearn.preprocessing import (
    StandardScaler, MinMaxScaler, RobustScaler, LabelEncoder,
    PolynomialFeatures,
)
from sklearn.decomposition import PCA
from sklearn.model_selection import (
    train_test_split as sklearn_train_test_split,
    cross_val_score, GridSearchCV, StratifiedKFold, KFold,
)
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression, LinearRegression
from sklearn.svm import SVC, SVR
import xgboost as xgb
import lightgbm as lgb
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from .registry import tool_registry
from .cleaning import get_dataframe, update_dataframe

# ── helpers ──────────────────────────────────────────────────────────────────

def _fig_to_b64() -> str:
    buf = io.BytesIO()
    plt.savefig(buf, format="png", dpi=100, bbox_inches="tight",
                facecolor=plt.gcf().get_facecolor())
    buf.seek(0)
    b64 = base64.b64encode(buf.getvalue()).decode()
    plt.close("all")
    return f"data:image/png;base64,{b64}"


def _detect_problem_type(df: pd.DataFrame, target: str) -> str:
    col = df[target]
    if not pd.api.types.is_numeric_dtype(col):
        return "classification"
    uq = col.nunique()
    return "classification" if uq <= 10 or uq / len(col) < 0.05 else "regression"


def _prepare_X_y(df: pd.DataFrame, target: str):
    """Encode categoricals, impute, return X, y."""
    X = df.drop(columns=[target]).copy()
    y = df[target].dropna()
    X = X.loc[y.index]

    for col in X.select_dtypes(include=["object", "category"]).columns:
        le = LabelEncoder()
        X[col] = le.fit_transform(X[col].astype(str))
    for col in X.select_dtypes(include=[np.number]).columns:
        X[col] = X[col].fillna(X[col].median())
    return X, y


# ════════════════════════════════════════════════════════════════════════════
# SCALING
# ════════════════════════════════════════════════════════════════════════════

def standard_scaler(session_id: str, columns_to_scale: str = "") -> Dict[str, Any]:
    """
    Apply Z-score standardisation (μ=0, σ=1) to numeric columns.
    Pass a comma-separated list of columns, or leave blank for all numeric.
    """
    df = get_dataframe(session_id)
    num_cols = [c.strip() for c in columns_to_scale.split(",") if c.strip()] \
        if columns_to_scale.strip() else df.select_dtypes(include=[np.number]).columns.tolist()

    missing = [c for c in num_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Columns not found: {missing}")

    before = {c: {"mean": round(float(df[c].mean()), 4), "std": round(float(df[c].std()), 4)} for c in num_cols}
    scaler = StandardScaler()
    df[num_cols] = scaler.fit_transform(df[num_cols])
    update_dataframe(session_id, df)
    after = {c: {"mean": round(float(df[c].mean()), 4), "std": round(float(df[c].std()), 4)} for c in num_cols}

    return {
        "scaler": "StandardScaler (Z-score)",
        "columns_scaled": num_cols,
        "before": before,
        "after": after,
        "rows": len(df),
        "note": "Dataset updated in session. Features now have μ≈0, σ≈1.",
    }

tool_registry.register(
    name="standard_scaler",
    description="Standardise numeric columns to zero mean and unit variance (Z-score). Required before SVM, PCA, and regularised models.",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string"},
            "columns_to_scale": {"type": "string", "description": "Comma-separated column names (blank = all numeric)"},
        },
        "required": ["session_id"],
    },
    function=standard_scaler,
)


def min_max_scaler(
    session_id: str,
    columns_to_scale: str = "",
    feature_range_min: str = "0",
    feature_range_max: str = "1",
) -> Dict[str, Any]:
    """Rescale features to [feature_range_min, feature_range_max]."""
    df = get_dataframe(session_id)
    lo, hi = float(feature_range_min), float(feature_range_max)
    num_cols = [c.strip() for c in columns_to_scale.split(",") if c.strip()] \
        if columns_to_scale.strip() else df.select_dtypes(include=[np.number]).columns.tolist()

    missing = [c for c in num_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Columns not found: {missing}")

    scaler = MinMaxScaler(feature_range=(lo, hi))
    df[num_cols] = scaler.fit_transform(df[num_cols])
    update_dataframe(session_id, df)

    return {
        "scaler": "MinMaxScaler",
        "feature_range": [lo, hi],
        "columns_scaled": num_cols,
        "rows": len(df),
        "note": f"All selected features now in [{lo}, {hi}].",
    }

tool_registry.register(
    name="min_max_scaler",
    description="Rescale numeric features to [0, 1] or a custom range. Good for neural networks and distance-based models.",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string"},
            "columns_to_scale": {"type": "string"},
            "feature_range_min": {"type": "string", "description": "Lower bound (default 0)"},
            "feature_range_max": {"type": "string", "description": "Upper bound (default 1)"},
        },
        "required": ["session_id"],
    },
    function=min_max_scaler,
)


def robust_scaler(session_id: str, columns_to_scale: str = "") -> Dict[str, Any]:
    """Scale using median and IQR — robust to outliers."""
    df = get_dataframe(session_id)
    num_cols = [c.strip() for c in columns_to_scale.split(",") if c.strip()] \
        if columns_to_scale.strip() else df.select_dtypes(include=[np.number]).columns.tolist()

    scaler = RobustScaler()
    df[num_cols] = scaler.fit_transform(df[num_cols])
    update_dataframe(session_id, df)

    return {
        "scaler": "RobustScaler (IQR)",
        "columns_scaled": num_cols,
        "rows": len(df),
        "note": "Scaled using median and IQR. Outliers have reduced influence.",
    }

tool_registry.register(
    name="robust_scaler",
    description="Scale features using median and IQR — resistant to outliers. Best choice when data contains significant outliers.",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string"},
            "columns_to_scale": {"type": "string"},
        },
        "required": ["session_id"],
    },
    function=robust_scaler,
)


# ════════════════════════════════════════════════════════════════════════════
# TRANSFORMS
# ════════════════════════════════════════════════════════════════════════════

def log_transform(session_id: str, column: str) -> Dict[str, Any]:
    """Apply log1p to reduce right-skew."""
    df = get_dataframe(session_id)
    if column not in df.columns:
        raise ValueError(f"Column '{column}' not found")
    if not pd.api.types.is_numeric_dtype(df[column]):
        raise ValueError(f"Column '{column}' must be numeric")
    if (df[column].dropna() < 0).any():
        raise ValueError(f"Column '{column}' contains negative values — cannot apply log")

    skew_before = round(float(df[column].skew()), 4)
    df[column] = np.log1p(df[column])
    skew_after = round(float(df[column].skew()), 4)
    update_dataframe(session_id, df)

    return {
        "transform": "log1p",
        "column": column,
        "skewness_before": skew_before,
        "skewness_after": skew_after,
        "improvement": round(abs(skew_before) - abs(skew_after), 4),
        "note": "log1p(x) applied. Distribution is now more symmetric.",
    }

tool_registry.register(
    name="log_transform",
    description="Apply log1p transform to reduce right skew. Useful for income, price, count data.",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string"},
            "column": {"type": "string"},
        },
        "required": ["session_id", "column"],
    },
    function=log_transform,
)


# ════════════════════════════════════════════════════════════════════════════
# ENCODING
# ════════════════════════════════════════════════════════════════════════════

def one_hot_encode(
    session_id: str,
    columns_to_encode: str = "",
    drop_first: str = "true",
) -> Dict[str, Any]:
    """One-hot encode categorical columns (get_dummies)."""
    df = get_dataframe(session_id)
    drop = drop_first.lower() == "true"
    cat_cols = [c.strip() for c in columns_to_encode.split(",") if c.strip()] \
        if columns_to_encode.strip() else df.select_dtypes(include=["object", "category"]).columns.tolist()

    missing = [c for c in cat_cols if c not in df.columns]
    if missing:
        raise ValueError(f"Columns not found: {missing}")

    original_cols = len(df.columns)
    df = pd.get_dummies(df, columns=cat_cols, drop_first=drop, dtype=float)
    update_dataframe(session_id, df)
    new_cols = len(df.columns)

    return {
        "encoding": "One-Hot (get_dummies)",
        "encoded_columns": cat_cols,
        "drop_first": drop,
        "columns_before": original_cols,
        "columns_after": new_cols,
        "new_columns_added": new_cols - original_cols,
        "rows": len(df),
    }

tool_registry.register(
    name="one_hot_encode",
    description="One-hot encode categorical columns using pd.get_dummies. Required by most linear and distance-based models.",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string"},
            "columns_to_encode": {"type": "string", "description": "Comma-separated column names (blank = all categoricals)"},
            "drop_first": {"type": "string", "description": "Drop first dummy to avoid multicollinearity (default true)"},
        },
        "required": ["session_id"],
    },
    function=one_hot_encode,
)


def label_encode(session_id: str, column: str) -> Dict[str, Any]:
    """Label-encode a single categorical column to integers."""
    df = get_dataframe(session_id)
    if column not in df.columns:
        raise ValueError(f"Column '{column}' not found")

    le = LabelEncoder()
    original_values = df[column].astype(str).unique().tolist()
    df[column] = le.fit_transform(df[column].astype(str))
    update_dataframe(session_id, df)

    mapping = {str(orig): int(enc) for orig, enc in zip(le.classes_, le.transform(le.classes_))}
    return {
        "encoding": "LabelEncoder",
        "column": column,
        "unique_values": len(le.classes_),
        "mapping_sample": dict(list(mapping.items())[:10]),
        "rows": len(df),
    }

tool_registry.register(
    name="label_encode",
    description="Label-encode a categorical column to integers. Use for ordinal data or tree-based models.",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string"},
            "column": {"type": "string"},
        },
        "required": ["session_id", "column"],
    },
    function=label_encode,
)


# ════════════════════════════════════════════════════════════════════════════
# FEATURE ENGINEERING
# ════════════════════════════════════════════════════════════════════════════

def pca_transform(
    session_id: str,
    n_components: str = "5",
    target_column: str = "",
) -> Dict[str, Any]:
    """Reduce numeric features to n_components PCA dimensions."""
    df = get_dataframe(session_id)
    n = int(n_components)

    # Exclude target from PCA
    feature_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    if target_column.strip() and target_column in feature_cols:
        feature_cols.remove(target_column)

    if len(feature_cols) < 2:
        raise ValueError("Need ≥2 numeric feature columns for PCA")
    n = min(n, len(feature_cols))

    X = df[feature_cols].fillna(df[feature_cols].median())
    pca = PCA(n_components=n, random_state=42)
    components = pca.fit_transform(X)
    explained = pca.explained_variance_ratio_

    # Replace original numeric features with PCA components
    df = df.drop(columns=feature_cols)
    for i in range(n):
        df[f"pca_{i+1}"] = components[:, i]

    update_dataframe(session_id, df)

    # Scree plot
    plt.close("all")
    fig, ax = plt.subplots(figsize=(7, 4))
    fig.patch.set_facecolor("#0E0E0E")
    ax.set_facecolor("#141414")
    ax.bar(range(1, n + 1), explained * 100, color="#00D4FF", alpha=0.8, edgecolor="#0A0A0A")
    ax.plot(range(1, n + 1), np.cumsum(explained) * 100, "o-", color="#3FB950", linewidth=2, markersize=5)
    ax.set_xlabel("Principal Component", color="#8C8C8C")
    ax.set_ylabel("Variance Explained (%)", color="#8C8C8C")
    ax.set_title("PCA Scree Plot", color="#F2F2F2")
    ax.tick_params(colors="#8C8C8C")
    for sp in ax.spines.values():
        sp.set_color("#333333")
    ax.grid(alpha=0.12, color="white")
    fig.tight_layout()
    image = _fig_to_b64()

    return {
        "transform": "PCA",
        "n_components": n,
        "original_features": len(feature_cols),
        "features_removed": feature_cols,
        "variance_explained_per_component": [round(float(v) * 100, 2) for v in explained],
        "cumulative_variance_explained": round(float(np.sum(explained)) * 100, 2),
        "new_columns": [f"pca_{i+1}" for i in range(n)],
        "rows": len(df),
        "image_base64": image,
    }

tool_registry.register(
    name="pca_transform",
    description="Reduce numeric features to N principal components. Removes multicollinearity and speeds up training.",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string"},
            "n_components": {"type": "string", "description": "Number of components to keep (default 5)"},
            "target_column": {"type": "string", "description": "Target column to exclude from PCA"},
        },
        "required": ["session_id"],
    },
    function=pca_transform,
)


def polynomial_features(
    session_id: str,
    columns_to_scale: str = "",
    degree: str = "2",
) -> Dict[str, Any]:
    """Create polynomial and interaction features from numeric columns."""
    df = get_dataframe(session_id)
    deg = int(degree)
    num_cols = [c.strip() for c in columns_to_scale.split(",") if c.strip()] \
        if columns_to_scale.strip() else df.select_dtypes(include=[np.number]).columns.tolist()[:5]  # cap at 5

    if len(num_cols) < 1:
        raise ValueError("No numeric columns found for polynomial expansion")

    poly = PolynomialFeatures(degree=deg, include_bias=False)
    X = df[num_cols].fillna(df[num_cols].median())
    poly_arr = poly.fit_transform(X)
    feature_names = poly.get_feature_names_out(num_cols)

    # Remove the original columns and add expanded ones
    df = df.drop(columns=num_cols)
    for name, col_data in zip(feature_names, poly_arr.T):
        safe_name = name.replace(" ", "_").replace("^", "pow")
        df[safe_name] = col_data

    update_dataframe(session_id, df)

    return {
        "transform": f"PolynomialFeatures (degree={deg})",
        "source_columns": num_cols,
        "features_before": len(num_cols),
        "features_after": len(feature_names),
        "new_feature_names": list(feature_names[:20]),
        "rows": len(df),
        "note": f"Created {len(feature_names)} polynomial/interaction features from {len(num_cols)} input columns.",
    }

tool_registry.register(
    name="polynomial_features",
    description="Create polynomial and interaction features (x², x·y). Helps linear models capture non-linear patterns.",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string"},
            "columns_to_scale": {"type": "string", "description": "Comma-separated numeric columns to expand (blank = first 5 numeric)"},
            "degree": {"type": "string", "description": "Polynomial degree (default 2)"},
        },
        "required": ["session_id"],
    },
    function=polynomial_features,
)


def drop_columns(session_id: str, column: str) -> Dict[str, Any]:
    """Drop a column from the dataset."""
    df = get_dataframe(session_id)
    if column not in df.columns:
        raise ValueError(f"Column '{column}' not found. Available: {list(df.columns)}")
    df = df.drop(columns=[column])
    update_dataframe(session_id, df)
    return {
        "action": "drop_column",
        "dropped": column,
        "columns_remaining": list(df.columns),
        "rows": len(df),
    }

tool_registry.register(
    name="drop_columns",
    description="Remove a column from the dataset to reduce noise or eliminate data leakage before training.",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string"},
            "column": {"type": "string"},
        },
        "required": ["session_id", "column"],
    },
    function=drop_columns,
)


# ════════════════════════════════════════════════════════════════════════════
# SPLITTING / VALIDATION
# ════════════════════════════════════════════════════════════════════════════

def train_test_split(
    session_id: str,
    target_column: str,
    test_size: str = "0.2",
    stratify: str = "false",
) -> Dict[str, Any]:
    """Report train/test split statistics (does not persist split — just informs next steps)."""
    df = get_dataframe(session_id)
    if target_column not in df.columns:
        raise ValueError(f"Target '{target_column}' not found")

    ts = float(test_size)
    problem_type = _detect_problem_type(df, target_column)
    strat = stratify.lower() == "true" and problem_type == "classification"

    X, y = _prepare_X_y(df, target_column)
    X_train, X_test, y_train, y_test = sklearn_train_test_split(
        X, y, test_size=ts, random_state=42, stratify=y if strat else None
    )

    result: Dict[str, Any] = {
        "target_column": target_column,
        "problem_type": problem_type,
        "total_rows": len(df),
        "train_rows": len(X_train),
        "test_rows": len(X_test),
        "test_size": ts,
        "stratified": strat,
        "feature_count": X.shape[1],
    }

    if problem_type == "classification":
        vc = y.value_counts(normalize=True).round(3).to_dict()
        result["class_distribution"] = {str(k): float(v) for k, v in vc.items()}
        result["note"] = "Split info recorded. Run AutoML to train on these splits."
    else:
        result["target_stats"] = {
            "mean": round(float(y.mean()), 4),
            "std": round(float(y.std()), 4),
            "min": round(float(y.min()), 4),
            "max": round(float(y.max()), 4),
        }
    return result

tool_registry.register(
    name="train_test_split",
    description="Preview train/test split statistics and class distribution before running AutoML.",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string"},
            "target_column": {"type": "string"},
            "test_size": {"type": "string", "description": "Fraction for test (default 0.2)"},
            "stratify": {"type": "string", "description": "Stratify by class label (default false)"},
        },
        "required": ["session_id", "target_column"],
    },
    function=train_test_split,
)


# ════════════════════════════════════════════════════════════════════════════
# CROSS-VALIDATION
# ════════════════════════════════════════════════════════════════════════════

_MODEL_MAP = {
    "random_forest": (RandomForestClassifier, RandomForestRegressor),
    "xgboost": (
        lambda **kw: xgb.XGBClassifier(eval_metric="logloss", **kw),
        lambda **kw: xgb.XGBRegressor(**kw),
    ),
    "lightgbm": (
        lambda **kw: lgb.LGBMClassifier(verbose=-1, **kw),
        lambda **kw: lgb.LGBMRegressor(verbose=-1, **kw),
    ),
    "logistic_regression": (
        lambda **kw: LogisticRegression(max_iter=500, **kw),
        LinearRegression,
    ),
    "svm": (
        lambda **kw: SVC(probability=True, **kw),
        SVR,
    ),
}


def _build_model(model_name: str, problem_type: str, **kw):
    pair = _MODEL_MAP.get(model_name)
    if pair is None:
        raise ValueError(f"Unknown model '{model_name}'. Choose from: {list(_MODEL_MAP)}")
    cls = pair[0] if problem_type == "classification" else pair[1]
    try:
        return cls(random_state=42, **kw)
    except TypeError:
        return cls(**kw)


def cross_validate_model(
    session_id: str,
    target_column: str,
    model: str = "random_forest",
    cv_folds: str = "5",
) -> Dict[str, Any]:
    """k-fold cross-validation on cleaned data."""
    df = get_dataframe(session_id)
    if target_column not in df.columns:
        raise ValueError(f"Target '{target_column}' not found")

    folds = int(cv_folds)
    problem_type = _detect_problem_type(df, target_column)
    X, y = _prepare_X_y(df, target_column)
    clf = _build_model(model, problem_type)

    scoring = "accuracy" if problem_type == "classification" else "r2"
    cv = StratifiedKFold(n_splits=folds, shuffle=True, random_state=42) \
        if problem_type == "classification" else KFold(n_splits=folds, shuffle=True, random_state=42)

    scores = cross_val_score(clf, X, y, cv=cv, scoring=scoring, n_jobs=-1)

    # Plot
    plt.close("all")
    fig, ax = plt.subplots(figsize=(7, 4))
    fig.patch.set_facecolor("#0E0E0E")
    ax.set_facecolor("#141414")
    ax.bar(range(1, folds + 1), scores, color="#8B5CF6", alpha=0.8, edgecolor="#0A0A0A")
    ax.axhline(scores.mean(), color="#3FB950", linewidth=2, linestyle="--", label=f"Mean: {scores.mean():.4f}")
    ax.set_xlabel("Fold", color="#8C8C8C")
    ax.set_ylabel(scoring.upper(), color="#8C8C8C")
    ax.set_title(f"{folds}-Fold CV — {model}", color="#F2F2F2")
    ax.tick_params(colors="#8C8C8C")
    ax.legend(facecolor="#1A1A1A", edgecolor="#333", labelcolor="#8C8C8C")
    for sp in ax.spines.values():
        sp.set_color("#333333")
    ax.grid(alpha=0.12, color="white")
    ax.set_ylim(0, 1)
    fig.tight_layout()
    image = _fig_to_b64()

    return {
        "model": model,
        "problem_type": problem_type,
        "target_column": target_column,
        "cv_folds": folds,
        "scoring": scoring,
        "fold_scores": [round(float(s), 4) for s in scores],
        "mean_score": round(float(scores.mean()), 4),
        "std_score": round(float(scores.std()), 4),
        "min_score": round(float(scores.min()), 4),
        "max_score": round(float(scores.max()), 4),
        "confidence_interval_95": [
            round(float(scores.mean() - 2 * scores.std()), 4),
            round(float(scores.mean() + 2 * scores.std()), 4),
        ],
        "image_base64": image,
    }

tool_registry.register(
    name="cross_validate_model",
    description="Run k-fold cross-validation on the cleaned dataset. Returns per-fold scores, mean, std, and 95% confidence interval.",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string"},
            "target_column": {"type": "string"},
            "model": {
                "type": "string",
                "enum": ["random_forest", "xgboost", "lightgbm", "logistic_regression", "svm"],
                "description": "Model to cross-validate",
            },
            "cv_folds": {"type": "string", "description": "Number of folds (default 5)"},
        },
        "required": ["session_id", "target_column"],
    },
    function=cross_validate_model,
)


# ════════════════════════════════════════════════════════════════════════════
# HYPERPARAMETER TUNING
# ════════════════════════════════════════════════════════════════════════════

_PARAM_GRIDS: Dict[str, Dict] = {
    "random_forest": {
        "n_estimators": [50, 100, 200],
        "max_depth": [None, 5, 10, 20],
        "min_samples_split": [2, 5],
    },
    "xgboost": {
        "n_estimators": [50, 100],
        "max_depth": [3, 5, 7],
        "learning_rate": [0.05, 0.1, 0.2],
    },
    "lightgbm": {
        "n_estimators": [50, 100],
        "num_leaves": [31, 63],
        "learning_rate": [0.05, 0.1],
    },
    "logistic_regression": {
        "C": [0.01, 0.1, 1, 10],
        "solver": ["lbfgs", "saga"],
    },
    "svm": {
        "C": [0.1, 1, 10],
        "kernel": ["rbf", "linear"],
    },
}


def hyperparameter_tune(
    session_id: str,
    target_column: str,
    model: str = "random_forest",
    cv_folds: str = "5",
) -> Dict[str, Any]:
    """Grid search cross-validation to find optimal hyperparameters."""
    df = get_dataframe(session_id)
    if target_column not in df.columns:
        raise ValueError(f"Target '{target_column}' not found")

    folds = int(cv_folds)
    problem_type = _detect_problem_type(df, target_column)
    X, y = _prepare_X_y(df, target_column)
    estimator = _build_model(model, problem_type)
    param_grid = _PARAM_GRIDS.get(model, {})

    scoring = "accuracy" if problem_type == "classification" else "r2"
    cv = StratifiedKFold(n_splits=folds, shuffle=True, random_state=42) \
        if problem_type == "classification" else KFold(n_splits=folds, shuffle=True, random_state=42)

    gs = GridSearchCV(estimator, param_grid, cv=cv, scoring=scoring, n_jobs=-1, refit=True)
    gs.fit(X, y)

    return {
        "model": model,
        "problem_type": problem_type,
        "target_column": target_column,
        "cv_folds": folds,
        "scoring": scoring,
        "best_params": gs.best_params_,
        "best_score": round(float(gs.best_score_), 4),
        "total_combinations_tried": len(gs.cv_results_["mean_test_score"]),
        "top_5_results": [
            {
                "params": gs.cv_results_["params"][i],
                "mean_score": round(float(gs.cv_results_["mean_test_score"][i]), 4),
                "std_score": round(float(gs.cv_results_["std_test_score"][i]), 4),
            }
            for i in np.argsort(gs.cv_results_["mean_test_score"])[::-1][:5]
        ],
        "note": f"Best {scoring}: {gs.best_score_:.4f} with params: {gs.best_params_}",
    }

tool_registry.register(
    name="hyperparameter_tune",
    description="GridSearchCV to find optimal hyperparameters for a model. Returns best params and top-5 combinations.",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string"},
            "target_column": {"type": "string"},
            "model": {
                "type": "string",
                "enum": ["random_forest", "xgboost", "lightgbm", "logistic_regression", "svm"],
            },
            "cv_folds": {"type": "string", "description": "CV folds for grid search (default 5)"},
        },
        "required": ["session_id", "target_column"],
    },
    function=hyperparameter_tune,
)


# ════════════════════════════════════════════════════════════════════════════
# STANDALONE FEATURE IMPORTANCE (trains on current session data directly)
# ════════════════════════════════════════════════════════════════════════════

def feature_importance(
    session_id: str,
    target_column: str,
    model: str = "random_forest",
) -> Dict[str, Any]:
    """
    Train a tree model on the CURRENT cleaned session data and rank features by importance.
    Works on whatever state the dataset is in after cleaning/encoding/scaling.
    """
    df = get_dataframe(session_id)
    if target_column not in df.columns:
        raise ValueError(f"Target '{target_column}' not found. Available: {list(df.columns)}")

    problem_type = _detect_problem_type(df, target_column)
    X, y = _prepare_X_y(df, target_column)

    clf = _build_model(model, problem_type)
    clf.fit(X, y)

    if hasattr(clf, "feature_importances_"):
        importances = clf.feature_importances_
    elif hasattr(clf, "coef_"):
        importances = np.abs(clf.coef_).flatten()[:len(X.columns)]
    else:
        raise ValueError(f"Model '{model}' does not support feature importance")

    imp_df = (
        pd.DataFrame({"feature": X.columns, "importance": importances})
        .sort_values("importance", ascending=False)
        .reset_index(drop=True)
    )
    top = imp_df.head(15)

    # ── Dark-mode horizontal bar chart ──────────────────────────────────────
    plt.close("all")
    fig, ax = plt.subplots(figsize=(8, max(4, len(top) * 0.45)))
    fig.patch.set_facecolor("#0E0E0E")
    ax.set_facecolor("#141414")
    colors = ["#00D4FF" if i == 0 else "#8B5CF6" if i < 3 else "#3FB950" for i in range(len(top))]
    ax.barh(range(len(top)), top["importance"], color=colors, alpha=0.85, edgecolor="#0A0A0A")
    ax.set_yticks(range(len(top)))
    ax.set_yticklabels(top["feature"], color="#8C8C8C", fontsize=9)
    ax.invert_yaxis()
    ax.set_xlabel("Feature Importance", color="#8C8C8C")
    ax.set_title(f"Feature Importance — {model} ({problem_type})", color="#F2F2F2", fontsize=12)
    ax.tick_params(colors="#8C8C8C")
    for sp in ax.spines.values():
        sp.set_color("#333333")
    ax.grid(axis="x", alpha=0.12, color="white")
    fig.tight_layout()
    image = _fig_to_b64()

    return {
        "model": model,
        "problem_type": problem_type,
        "target_column": target_column,
        "total_features": len(X.columns),
        "top_10_features": [
            {"feature": r["feature"], "importance": round(float(r["importance"]), 6)}
            for _, r in top.head(10).iterrows()
        ],
        "model_name": model,
        "image_base64": image,
    }


tool_registry.register(
    name="feature_importance",
    description=(
        "Train a model on the current cleaned dataset and rank all features by importance. "
        "Works after cleaning/encoding — no prior AutoML run needed."
    ),
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string"},
            "target_column": {"type": "string", "description": "Column to predict"},
            "model": {
                "type": "string",
                "enum": ["random_forest", "xgboost", "lightgbm"],
                "description": "Model to use for importance (default random_forest)",
            },
        },
        "required": ["session_id", "target_column"],
    },
    function=feature_importance,
)


# ════════════════════════════════════════════════════════════════════════════
# STANDALONE MODEL EVALUATION (trains fresh on current session data)
# ════════════════════════════════════════════════════════════════════════════

from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score,
    confusion_matrix, roc_auc_score,
    mean_squared_error, mean_absolute_error, r2_score,
)
import seaborn as sns


def model_evaluation(
    session_id: str,
    target_column: str,
    model: str = "random_forest",
    test_size: str = "0.2",
) -> Dict[str, Any]:
    """
    Train model on current session data, evaluate on held-out test set.
    Returns full metric suite + confusion matrix / actual-vs-predicted chart.
    """
    from sklearn.model_selection import train_test_split as tts

    df = get_dataframe(session_id)
    if target_column not in df.columns:
        raise ValueError(f"Target '{target_column}' not found")

    ts = float(test_size)
    problem_type = _detect_problem_type(df, target_column)
    X, y = _prepare_X_y(df, target_column)

    strat = y if problem_type == "classification" else None
    X_train, X_test, y_train, y_test = tts(
        X, y, test_size=ts, random_state=42, stratify=strat
    )

    clf = _build_model(model, problem_type)
    clf.fit(X_train, y_train)
    y_pred = clf.predict(X_test)

    result: Dict[str, Any] = {
        "model_name": model,
        "problem_type": problem_type,
        "target_column": target_column,
        "train_rows": len(X_train),
        "test_samples": len(X_test),
        "feature_count": X.shape[1],
    }

    plt.close("all")

    if problem_type == "classification":
        acc = accuracy_score(y_test, y_pred)
        prec = precision_score(y_test, y_pred, average="weighted", zero_division=0)
        rec = recall_score(y_test, y_pred, average="weighted", zero_division=0)
        f1 = f1_score(y_test, y_pred, average="weighted", zero_division=0)
        cm = confusion_matrix(y_test, y_pred)

        # ROC-AUC if binary
        auc = None
        if hasattr(clf, "predict_proba") and len(np.unique(y)) == 2:
            try:
                auc = round(float(roc_auc_score(y_test, clf.predict_proba(X_test)[:, 1])), 4)
            except Exception:
                pass

        result.update({
            "accuracy": round(float(acc), 4),
            "precision": round(float(prec), 4),
            "recall": round(float(rec), 4),
            "f1_score": round(float(f1), 4),
            "roc_auc": auc,
            "confusion_matrix": cm.tolist(),
        })

        # Confusion matrix heat-map
        fig, ax = plt.subplots(figsize=(max(5, cm.shape[0]), max(4, cm.shape[0] * 0.85)))
        fig.patch.set_facecolor("#0E0E0E")
        ax.set_facecolor("#141414")
        sns.heatmap(
            cm, annot=True, fmt="d", cmap="Blues", ax=ax,
            linewidths=0.5, linecolor="#333",
            cbar_kws={"shrink": 0.75},
        )
        ax.set_title(f"Confusion Matrix — {model} (acc {acc:.3f})", color="#F2F2F2")
        ax.set_xlabel("Predicted", color="#8C8C8C")
        ax.set_ylabel("Actual", color="#8C8C8C")
        ax.tick_params(colors="#8C8C8C")
        fig.tight_layout()

    else:
        mse = mean_squared_error(y_test, y_pred)
        rmse = float(np.sqrt(mse))
        mae = mean_absolute_error(y_test, y_pred)
        r2 = r2_score(y_test, y_pred)

        result.update({
            "r2_score": round(float(r2), 4),
            "rmse": round(rmse, 4),
            "mae": round(float(mae), 4),
            "mse": round(float(mse), 4),
        })

        # Actual vs Predicted
        fig, ax = plt.subplots(figsize=(7, 5))
        fig.patch.set_facecolor("#0E0E0E")
        ax.set_facecolor("#141414")
        ax.scatter(y_test, y_pred, alpha=0.55, color="#00D4FF", s=18)
        mn, mx = float(min(y_test.min(), y_pred.min())), float(max(y_test.max(), y_pred.max()))
        ax.plot([mn, mx], [mn, mx], "r--", lw=1.5, label="Perfect")
        ax.set_xlabel("Actual", color="#8C8C8C")
        ax.set_ylabel("Predicted", color="#8C8C8C")
        ax.set_title(f"Actual vs Predicted — {model} (R²={r2:.3f})", color="#F2F2F2")
        ax.legend(facecolor="#1A1A1A", edgecolor="#333", labelcolor="#8C8C8C")
        ax.tick_params(colors="#8C8C8C")
        for sp in ax.spines.values():
            sp.set_color("#333333")
        ax.grid(alpha=0.12, color="white")
        ax.text(0.05, 0.95, f"R²={r2:.3f}\nRMSE={rmse:.2f}",
                transform=ax.transAxes, va="top", fontsize=9, color="#8C8C8C",
                bbox=dict(boxstyle="round", fc="#1A1A1A", ec="#333", alpha=0.9))
        fig.tight_layout()

    result["image_base64"] = _fig_to_b64()
    return result


tool_registry.register(
    name="model_evaluation",
    description=(
        "Train a model on the current session data and evaluate it on a held-out test set. "
        "Returns accuracy/F1/ROC-AUC for classifiers and R²/RMSE/MAE for regressors, "
        "plus a confusion matrix or actual-vs-predicted chart."
    ),
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string"},
            "target_column": {"type": "string"},
            "model": {
                "type": "string",
                "enum": ["random_forest", "xgboost", "lightgbm", "logistic_regression", "svm"],
                "description": "Model to train and evaluate (default random_forest)",
            },
            "test_size": {"type": "string", "description": "Held-out fraction (default 0.2)"},
        },
        "required": ["session_id", "target_column"],
    },
    function=model_evaluation,
)


# ════════════════════════════════════════════════════════════════════════════
# ENHANCED AUTO-ML  (uses CURRENT cleaned session state)
# Overrides the basic auto_ml_pipeline from modeling.py with a richer version
# ════════════════════════════════════════════════════════════════════════════

from sklearn.linear_model import LinearRegression
from sklearn.metrics import classification_report


def auto_ml_pipeline(
    session_id: str,
    target_column: str,
    cv_folds: str = "5",
    include_preprocessing: str = "true",
    test_size: str = "0.2",
) -> Dict[str, Any]:
    """
    Train Random Forest, XGBoost, LightGBM, Logistic/Linear Regression on the
    CURRENT cleaned dataset (whatever state it's in after earlier pipeline steps).
    Runs cross-validation for each model, picks the best, and returns a comparison chart.
    """
    from sklearn.model_selection import train_test_split as tts, cross_val_score, StratifiedKFold, KFold

    df = get_dataframe(session_id)
    if target_column not in df.columns:
        raise ValueError(f"Target '{target_column}' not found. Available: {list(df.columns)}")

    folds = int(cv_folds)
    ts = float(test_size)
    problem_type = _detect_problem_type(df, target_column)
    X, y = _prepare_X_y(df, target_column)

    strat = y if problem_type == "classification" else None
    X_train, X_test, y_train, y_test = tts(
        X, y, test_size=ts, random_state=42, stratify=strat
    )

    # ── Define model zoo ────────────────────────────────────────────────────
    if problem_type == "classification":
        models = {
            "Random Forest":       RandomForestClassifier(n_estimators=100, random_state=42, n_jobs=-1),
            "XGBoost":             xgb.XGBClassifier(n_estimators=100, random_state=42, eval_metric="logloss", verbosity=0),
            "LightGBM":            lgb.LGBMClassifier(n_estimators=100, random_state=42, verbose=-1),
            "Logistic Regression": LogisticRegression(max_iter=500, random_state=42),
        }
        scoring = "accuracy"
        cv_splitter = StratifiedKFold(n_splits=folds, shuffle=True, random_state=42)
    else:
        models = {
            "Random Forest":    RandomForestRegressor(n_estimators=100, random_state=42, n_jobs=-1),
            "XGBoost":          xgb.XGBRegressor(n_estimators=100, random_state=42, verbosity=0),
            "LightGBM":         lgb.LGBMRegressor(n_estimators=100, random_state=42, verbose=-1),
            "Linear Regression": LinearRegression(),
        }
        scoring = "r2"
        cv_splitter = KFold(n_splits=folds, shuffle=True, random_state=42)

    results: Dict[str, Any] = {}
    best_name, best_score = "", -np.inf

    for name, model in models.items():
        try:
            cv_scores = cross_val_score(model, X_train, y_train, cv=cv_splitter, scoring=scoring, n_jobs=-1)
            model.fit(X_train, y_train)
            y_pred = model.predict(X_test)

            if problem_type == "classification":
                test_score = float(accuracy_score(y_test, y_pred))
                prec = float(precision_score(y_test, y_pred, average="weighted", zero_division=0))
                rec = float(recall_score(y_test, y_pred, average="weighted", zero_division=0))
                f1 = float(f1_score(y_test, y_pred, average="weighted", zero_division=0))
                entry = {
                    "cv_mean": round(float(cv_scores.mean()), 4),
                    "cv_std": round(float(cv_scores.std()), 4),
                    "accuracy": round(test_score, 4),
                    "precision": round(prec, 4),
                    "recall": round(rec, 4),
                    "f1_score": round(f1, 4),
                }
            else:
                test_score = float(r2_score(y_test, y_pred))
                rmse = float(np.sqrt(mean_squared_error(y_test, y_pred)))
                mae = float(mean_absolute_error(y_test, y_pred))
                entry = {
                    "cv_mean": round(float(cv_scores.mean()), 4),
                    "cv_std": round(float(cv_scores.std()), 4),
                    "r2_score": round(test_score, 4),
                    "rmse": round(rmse, 4),
                    "mae": round(mae, 4),
                }

            results[name] = entry
            if test_score > best_score:
                best_score, best_name = test_score, name

        except Exception as exc:
            results[name] = {"error": str(exc)}

    # ── Comparison chart ────────────────────────────────────────────────────
    plt.close("all")
    valid = {n: r for n, r in results.items() if "error" not in r}
    metric_key = "accuracy" if problem_type == "classification" else "r2_score"
    names = list(valid.keys())
    scores = [valid[n][metric_key] for n in names]
    cv_means = [valid[n]["cv_mean"] for n in names]

    x = np.arange(len(names))
    w = 0.35
    fig, ax = plt.subplots(figsize=(9, 5))
    fig.patch.set_facecolor("#0E0E0E")
    ax.set_facecolor("#141414")
    bar1 = ax.bar(x - w / 2, cv_means, w, label=f"CV {scoring}", color="#8B5CF6", alpha=0.85, edgecolor="#0A0A0A")
    bar2 = ax.bar(x + w / 2, scores, w, label=f"Test {metric_key}", color="#00D4FF", alpha=0.85, edgecolor="#0A0A0A")

    for bar in [*bar1, *bar2]:
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + 0.005,
                f"{bar.get_height():.3f}", ha="center", va="bottom", fontsize=8, color="#8C8C8C")

    if best_name in names:
        idx = names.index(best_name)
        ax.axvline(x=idx, color="#3FB950", linewidth=1.5, linestyle="--", alpha=0.6)
        ax.text(idx, max(scores) * 0.5, f"★ BEST", ha="center", color="#3FB950", fontsize=9, rotation=90)

    ax.set_xticks(x)
    ax.set_xticklabels(names, color="#8C8C8C", fontsize=9)
    ax.set_ylim(0, min(1.1, max(scores + cv_means) * 1.15))
    ax.set_ylabel(scoring.upper(), color="#8C8C8C")
    ax.set_title(f"AutoML Model Comparison ({problem_type}) — {folds}-fold CV", color="#F2F2F2")
    ax.legend(facecolor="#1A1A1A", edgecolor="#333", labelcolor="#8C8C8C")
    ax.tick_params(colors="#8C8C8C")
    for sp in ax.spines.values():
        sp.set_color("#333333")
    ax.grid(axis="y", alpha=0.12, color="white")
    fig.tight_layout()
    image = _fig_to_b64()

    return {
        "problem_type": problem_type,
        "target_column": target_column,
        "dataset_shape": {"train": list(X_train.shape), "test": list(X_test.shape)},
        "feature_count": X.shape[1],
        "features_used": list(X.columns),
        "cv_folds": folds,
        "scoring": scoring,
        "models_trained": len([r for r in results.values() if "error" not in r]),
        "best_model": best_name,
        "best_score": round(best_score, 4),
        "results": results,
        "image_base64": image,
        "note": (
            f"Trained on CURRENT session data ({len(df)} rows × {X.shape[1]} features). "
            f"Best: {best_name} ({metric_key}={best_score:.4f})"
        ),
    }


# Override the basic auto_ml_pipeline registered in modeling.py
tool_registry.register(
    name="auto_ml_pipeline",
    description=(
        "Train Random Forest, XGBoost, LightGBM and Logistic/Linear Regression "
        "on the CURRENT cleaned/scaled/encoded session data. "
        "Uses k-fold CV for each model and returns a side-by-side comparison chart. "
        "Run AFTER cleaning and preprocessing steps."
    ),
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string"},
            "target_column": {"type": "string", "description": "Column to predict"},
            "cv_folds": {"type": "string", "description": "Cross-validation folds (default 5)"},
            "include_preprocessing": {"type": "string", "description": "Ignored — always uses current session state"},
            "test_size": {"type": "string", "description": "Held-out test fraction (default 0.2)"},
        },
        "required": ["session_id", "target_column"],
    },
    function=auto_ml_pipeline,
)