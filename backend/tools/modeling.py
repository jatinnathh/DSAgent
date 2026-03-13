import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional, Literal, Tuple
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder, StandardScaler
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.linear_model import LogisticRegression, LinearRegression
from sklearn.metrics import (
    accuracy_score, precision_score, recall_score, f1_score, confusion_matrix,
    mean_squared_error, mean_absolute_error, r2_score, classification_report
)
import xgboost as xgb
import lightgbm as lgb
import matplotlib.pyplot as plt
import seaborn as sns
import io
import base64
import pickle
import os
from .registry import tool_registry
from .cleaning import get_dataframe, update_dataframe

# Set matplotlib backend
plt.switch_backend('Agg')

# Create models directory
MODELS_DIR = "models"
os.makedirs(MODELS_DIR, exist_ok=True)

# Global storage for trained models per session
_session_models: Dict[str, Dict[str, Any]] = {}

def _save_plot_as_base64() -> str:
    """Save current matplotlib plot as base64 string"""
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png', dpi=150, bbox_inches='tight')
    buffer.seek(0)
    image_base64 = base64.b64encode(buffer.getvalue()).decode()
    plt.close()
    return f"data:image/png;base64,{image_base64}"

def _detect_problem_type(df: pd.DataFrame, target_column: str) -> str:
    """
    Automatically detect if this is a classification or regression problem
    """
    target = df[target_column]
    
    # Check if target is numeric
    if not pd.api.types.is_numeric_dtype(target):
        return "classification"
    
    # Check number of unique values
    unique_values = target.nunique()
    total_values = len(target.dropna())
    
    # If less than 10 unique values or less than 5% unique, likely classification
    if unique_values <= 10 or (unique_values / total_values) < 0.05:
        return "classification"
    
    return "regression"

def _prepare_features(df: pd.DataFrame, target_column: str) -> Tuple[pd.DataFrame, pd.Series]:
    """
    Prepare features for machine learning
    - Handle categorical variables
    - Remove target from features
    - Handle missing values
    """
    # Separate features and target
    X = df.drop(columns=[target_column]).copy()
    y = df[target_column].copy()
    
    # Handle missing values in target
    mask = ~y.isna()
    X = X[mask]
    y = y[mask]
    
    # Handle categorical variables in features
    categorical_columns = X.select_dtypes(include=['object', 'category']).columns
    
    for col in categorical_columns:
        # Simple label encoding for now
        le = LabelEncoder()
        X[col] = le.fit_transform(X[col].astype(str))
    
    # Handle missing values in features (simple imputation)
    numeric_columns = X.select_dtypes(include=[np.number]).columns
    X[numeric_columns] = X[numeric_columns].fillna(X[numeric_columns].mean())
    
    return X, y

# ============================================
# TOOL: Auto ML Pipeline
# ============================================

def auto_ml_pipeline(
    session_id: str,
    target_column: str,
    test_size: float = 0.2,
    random_state: int = 42
) -> Dict[str, Any]:
    """
    Automatically detect problem type and train multiple models
    
    Args:
        session_id: Session ID
        target_column: Column to predict
        test_size: Fraction of data for testing
        random_state: Random seed for reproducibility
    """
    df = get_dataframe(session_id)
    
    if target_column not in df.columns:
        raise ValueError(f"Target column '{target_column}' not found")
    
    # Detect problem type
    problem_type = _detect_problem_type(df, target_column)
    
    # Prepare features
    X, y = _prepare_features(df, target_column)
    
    if len(X) < 10:
        raise ValueError("Need at least 10 samples for training")
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=random_state, stratify=y if problem_type == "classification" else None
    )
    
    # Initialize models based on problem type
    if problem_type == "classification":
        models = {
            "Random Forest": RandomForestClassifier(n_estimators=100, random_state=random_state),
            "XGBoost": xgb.XGBClassifier(random_state=random_state, eval_metric='logloss'),
            "Logistic Regression": LogisticRegression(random_state=random_state, max_iter=1000)
        }
    else:
        models = {
            "Random Forest": RandomForestRegressor(n_estimators=100, random_state=random_state),
            "XGBoost": xgb.XGBRegressor(random_state=random_state),
            "Linear Regression": LinearRegression()
        }
    
    # Train and evaluate models
    results = {}
    best_model = None
    best_score = -np.inf if problem_type == "regression" else 0
    
    for name, model in models.items():
        try:
            # Train model
            model.fit(X_train, y_train)
            
            # Make predictions
            y_pred = model.predict(X_test)
            
            # Calculate metrics
            if problem_type == "classification":
                accuracy = accuracy_score(y_test, y_pred)
                precision = precision_score(y_test, y_pred, average='weighted', zero_division=0)
                recall = recall_score(y_test, y_pred, average='weighted', zero_division=0)
                f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)
                
                results[name] = {
                    "accuracy": round(accuracy, 4),
                    "precision": round(precision, 4),
                    "recall": round(recall, 4),
                    "f1_score": round(f1, 4),
                    "model": model
                }
                
                # Best model by accuracy
                if accuracy > best_score:
                    best_score = accuracy
                    best_model = name
                    
            else:  # regression
                mse = mean_squared_error(y_test, y_pred)
                mae = mean_absolute_error(y_test, y_pred)
                r2 = r2_score(y_test, y_pred)
                rmse = np.sqrt(mse)
                
                results[name] = {
                    "r2_score": round(r2, 4),
                    "rmse": round(rmse, 4),
                    "mae": round(mae, 4),
                    "mse": round(mse, 4),
                    "model": model
                }
                
                # Best model by R2 score
                if r2 > best_score:
                    best_score = r2
                    best_model = name
                    
        except Exception as e:
            results[name] = {"error": str(e)}
    
    # Store models in session
    if session_id not in _session_models:
        _session_models[session_id] = {}
    
    _session_models[session_id] = {
        "models": {name: result.get("model") for name, result in results.items() if "model" in result},
        "X_train": X_train,
        "X_test": X_test,
        "y_train": y_train,
        "y_test": y_test,
        "feature_names": list(X.columns),
        "target_column": target_column,
        "problem_type": problem_type,
        "best_model": best_model
    }
    
    # Remove model objects from results for JSON serialization
    clean_results = {}
    for name, result in results.items():
        clean_results[name] = {k: v for k, v in result.items() if k != "model"}
    
    return {
        "problem_type": problem_type,
        "target_column": target_column,
        "dataset_shape": {"train": X_train.shape, "test": X_test.shape},
        "feature_count": len(X.columns),
        "models_trained": len([r for r in results.values() if "error" not in r]),
        "best_model": best_model,
        "best_score": round(best_score, 4),
        "results": clean_results
    }

tool_registry.register(
    name="auto_ml_pipeline",
    description="Automatically detect problem type and train multiple ML models for comparison",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"},
            "target_column": {"type": "string", "description": "Column to predict"},
            "test_size": {"type": "number", "description": "Fraction for test set (default: 0.2)"},
            "random_state": {"type": "integer", "description": "Random seed (default: 42)"}
        },
        "required": ["session_id", "target_column"]
    },
    function=auto_ml_pipeline
)

# ============================================
# TOOL: Feature Importance
# ============================================

def feature_importance(
    session_id: str,
    model_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get feature importance from trained models
    
    Args:
        session_id: Session ID
        model_name: Specific model name (if None, uses best model)
    """
    if session_id not in _session_models:
        raise ValueError("No trained models found. Run auto_ml_pipeline first.")
    
    session_data = _session_models[session_id]
    
    if model_name is None:
        model_name = session_data["best_model"]
    
    if model_name not in session_data["models"]:
        raise ValueError(f"Model '{model_name}' not found")
    
    model = session_data["models"][model_name]
    feature_names = session_data["feature_names"]
    
    # Get feature importance
    if hasattr(model, 'feature_importances_'):
        importances = model.feature_importances_
    elif hasattr(model, 'coef_'):
        importances = np.abs(model.coef_).flatten()
    else:
        raise ValueError(f"Model '{model_name}' doesn't support feature importance")
    
    # Create feature importance dataframe
    importance_df = pd.DataFrame({
        'feature': feature_names,
        'importance': importances
    }).sort_values('importance', ascending=False)
    
    # Create plot
    plt.figure(figsize=(10, 6))
    top_features = importance_df.head(10)  # Top 10 features
    
    plt.barh(range(len(top_features)), top_features['importance'], color='skyblue')
    plt.yticks(range(len(top_features)), top_features['feature'])
    plt.xlabel('Importance')
    plt.title(f'Feature Importance - {model_name}')
    plt.gca().invert_yaxis()
    plt.tight_layout()
    
    image_b64 = _save_plot_as_base64()
    
    return {
        "model_name": model_name,
        "feature_importance": importance_df.to_dict('records'),
        "top_10_features": top_features.to_dict('records'),
        "image_base64": image_b64
    }

tool_registry.register(
    name="feature_importance",
    description="Get and visualize feature importance from trained models",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"},
            "model_name": {"type": "string", "description": "Model name (optional, uses best model if not specified)"}
        },
        "required": ["session_id"]
    },
    function=feature_importance
)

# ============================================
# TOOL: Model Evaluation
# ============================================

def model_evaluation(
    session_id: str,
    model_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Detailed evaluation of a trained model
    
    Args:
        session_id: Session ID
        model_name: Model to evaluate (if None, uses best model)
    """
    if session_id not in _session_models:
        raise ValueError("No trained models found. Run auto_ml_pipeline first.")
    
    session_data = _session_models[session_id]
    
    if model_name is None:
        model_name = session_data["best_model"]
    
    if model_name not in session_data["models"]:
        raise ValueError(f"Model '{model_name}' not found")
    
    model = session_data["models"][model_name]
    X_test = session_data["X_test"]
    y_test = session_data["y_test"]
    problem_type = session_data["problem_type"]
    
    # Make predictions
    y_pred = model.predict(X_test)
    
    evaluation = {
        "model_name": model_name,
        "problem_type": problem_type,
        "test_samples": len(y_test)
    }
    
    if problem_type == "classification":
        # Classification metrics
        accuracy = accuracy_score(y_test, y_pred)
        precision = precision_score(y_test, y_pred, average='weighted', zero_division=0)
        recall = recall_score(y_test, y_pred, average='weighted', zero_division=0)
        f1 = f1_score(y_test, y_pred, average='weighted', zero_division=0)
        
        evaluation.update({
            "accuracy": round(accuracy, 4),
            "precision": round(precision, 4),
            "recall": round(recall, 4),
            "f1_score": round(f1, 4)
        })
        
        # Confusion matrix
        cm = confusion_matrix(y_test, y_pred)
        
        # Plot confusion matrix
        plt.figure(figsize=(8, 6))
        sns.heatmap(cm, annot=True, fmt='d', cmap='Blues')
        plt.title(f'Confusion Matrix - {model_name}')
        plt.ylabel('True Label')
        plt.xlabel('Predicted Label')
        plt.tight_layout()
        
        evaluation["confusion_matrix"] = cm.tolist()
        evaluation["image_base64"] = _save_plot_as_base64()
        
    else:  # regression
        # Regression metrics
        mse = mean_squared_error(y_test, y_pred)
        mae = mean_absolute_error(y_test, y_pred)
        r2 = r2_score(y_test, y_pred)
        rmse = np.sqrt(mse)
        
        evaluation.update({
            "r2_score": round(r2, 4),
            "rmse": round(rmse, 4),
            "mae": round(mae, 4),
            "mse": round(mse, 4)
        })
        
        # Actual vs Predicted plot
                # Actual vs Predicted plot
        plt.figure(figsize=(8, 6))
        plt.scatter(y_test, y_pred, alpha=0.6, color='steelblue')
        
        # Perfect prediction line
        min_val = min(min(y_test), min(y_pred))
        max_val = max(max(y_test), max(y_pred))
        plt.plot([min_val, max_val], [min_val, max_val], 'r--', lw=2, label='Perfect Prediction')
        
        plt.xlabel('Actual Values')
        plt.ylabel('Predicted Values')
        plt.title(f'Actual vs Predicted - {model_name}')
        plt.legend()
        plt.grid(True, alpha=0.3)
        
        # Add R² score to plot
        plt.text(0.05, 0.95, f'R² = {r2:.3f}', transform=plt.gca().transAxes, 
                bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))
        
        plt.tight_layout()
        evaluation["image_base64"] = _save_plot_as_base64()
    
    return evaluation

tool_registry.register(
    name="model_evaluation",
    description="Detailed evaluation of a trained model with metrics and visualizations",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"},
            "model_name": {"type": "string", "description": "Model to evaluate (optional, uses best model if not specified)"}
        },
        "required": ["session_id"]
    },
    function=model_evaluation
)

# ============================================
# TOOL: Make Predictions
# ============================================

def make_predictions(
    session_id: str,
    input_data: Dict[str, Any],
    model_name: Optional[str] = None
) -> Dict[str, Any]:
    """
    Make predictions on new data using trained model
    
    Args:
        session_id: Session ID
        input_data: Dictionary with feature values
        model_name: Model to use (if None, uses best model)
    """
    if session_id not in _session_models:
        raise ValueError("No trained models found. Run auto_ml_pipeline first.")
    
    session_data = _session_models[session_id]
    
    if model_name is None:
        model_name = session_data["best_model"]
    
    if model_name not in session_data["models"]:
        raise ValueError(f"Model '{model_name}' not found")
    
    model = session_data["models"][model_name]
    feature_names = session_data["feature_names"]
    problem_type = session_data["problem_type"]
    
    # Prepare input data
    input_df = pd.DataFrame([input_data])
    
    # Ensure all features are present
    missing_features = set(feature_names) - set(input_df.columns)
    if missing_features:
        raise ValueError(f"Missing features: {list(missing_features)}")
    
    # Reorder columns to match training data
    input_df = input_df[feature_names]
    
    # Handle missing values (fill with 0 for simplicity)
    input_df = input_df.fillna(0)
    
    # Make prediction
    prediction = model.predict(input_df)[0]
    
    result = {
        "model_name": model_name,
        "problem_type": problem_type,
        "input_data": input_data,
        "prediction": float(prediction) if problem_type == "regression" else str(prediction)
    }
    
    # Add prediction probability for classification
    if problem_type == "classification" and hasattr(model, 'predict_proba'):
        probabilities = model.predict_proba(input_df)[0]
        classes = model.classes_
        result["prediction_probabilities"] = {
            str(cls): round(float(prob), 4) 
            for cls, prob in zip(classes, probabilities)
        }
        result["confidence"] = round(float(max(probabilities)), 4)
    
    return result

tool_registry.register(
    name="make_predictions",
    description="Make predictions on new data using a trained model",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"},
            "input_data": {
                "type": "object",
                "description": "Dictionary with feature names as keys and values to predict on"
            },
            "model_name": {"type": "string", "description": "Model to use (optional, uses best model if not specified)"}
        },
        "required": ["session_id", "input_data"]
    },
    function=make_predictions
)

# ============================================
# TOOL: Model Comparison
# ============================================

def model_comparison(session_id: str) -> Dict[str, Any]:
    """
    Compare all trained models side by side
    
    Args:
        session_id: Session ID
    """
    if session_id not in _session_models:
        raise ValueError("No trained models found. Run auto_ml_pipeline first.")
    
    session_data = _session_models[session_id]
    models = session_data["models"]
    problem_type = session_data["problem_type"]
    X_test = session_data["X_test"]
    y_test = session_data["y_test"]
    best_model = session_data["best_model"]
    
    comparison = {
        "problem_type": problem_type,
        "best_model": best_model,
        "models": {}
    }
    
    # Evaluate each model
    for name, model in models.items():
        y_pred = model.predict(X_test)
        
        if problem_type == "classification":
            metrics = {
                "accuracy": round(accuracy_score(y_test, y_pred), 4),
                "precision": round(precision_score(y_test, y_pred, average='weighted', zero_division=0), 4),
                "recall": round(recall_score(y_test, y_pred, average='weighted', zero_division=0), 4),
                "f1_score": round(f1_score(y_test, y_pred, average='weighted', zero_division=0), 4)
            }
        else:  # regression
            mse = mean_squared_error(y_test, y_pred)
            metrics = {
                "r2_score": round(r2_score(y_test, y_pred), 4),
                "rmse": round(np.sqrt(mse), 4),
                "mae": round(mean_absolute_error(y_test, y_pred), 4),
                "mse": round(mse, 4)
            }
        
        comparison["models"][name] = metrics
    
    # Create comparison plot
    plt.figure(figsize=(12, 6))
    
    if problem_type == "classification":
        metrics_to_plot = ["accuracy", "precision", "recall", "f1_score"]
        metric_labels = ["Accuracy", "Precision", "Recall", "F1 Score"]
    else:
        metrics_to_plot = ["r2_score"]
        metric_labels = ["R² Score"]
    
    model_names = list(models.keys())
    x_pos = np.arange(len(model_names))
    
    for i, metric in enumerate(metrics_to_plot):
        values = [comparison["models"][name][metric] for name in model_names]
        plt.subplot(1, len(metrics_to_plot), i + 1)
        bars = plt.bar(x_pos, values, color=['gold' if name == best_model else 'skyblue' for name in model_names])
        plt.title(metric_labels[i])
        plt.xticks(x_pos, model_names, rotation=45)
        plt.ylim(0, 1 if metric != "mse" else None)
        
        # Add value labels on bars
        for bar, value in zip(bars, values):
            plt.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.01,
                    f'{value:.3f}', ha='center', va='bottom', fontsize=9)
    
    plt.tight_layout()
    comparison["image_base64"] = _save_plot_as_base64()
    
    return comparison

tool_registry.register(
    name="model_comparison",
    description="Compare performance of all trained models side by side",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"}
        },
        "required": ["session_id"]
    },
    function=model_comparison
)

# ============================================
# TOOL: Train Specific Model
# ============================================

def train_specific_model(
    session_id: str,
    target_column: str,
    model_type: Literal["random_forest", "xgboost", "linear", "logistic"],
    test_size: float = 0.2,
    **model_params
) -> Dict[str, Any]:
    """
    Train a specific model with custom parameters
    
    Args:
        session_id: Session ID
        target_column: Column to predict
        model_type: Type of model to train
        test_size: Fraction for test set
        **model_params: Additional parameters for the model
    """
    df = get_dataframe(session_id)
    
    if target_column not in df.columns:
        raise ValueError(f"Target column '{target_column}' not found")
    
    # Detect problem type
    problem_type = _detect_problem_type(df, target_column)
    
    # Prepare features
    X, y = _prepare_features(df, target_column)
    
    # Split data
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=test_size, random_state=42, 
        stratify=y if problem_type == "classification" else None
    )
    
    # Initialize model based on type
    if model_type == "random_forest":
        if problem_type == "classification":
            model = RandomForestClassifier(**model_params)
        else:
            model = RandomForestRegressor(**model_params)
    elif model_type == "xgboost":
        if problem_type == "classification":
            model = xgb.XGBClassifier(eval_metric='logloss', **model_params)
        else:
            model = xgb.XGBRegressor(**model_params)
    elif model_type == "linear":
        if problem_type == "classification":
            model = LogisticRegression(max_iter=1000, **model_params)
        else:
            model = LinearRegression(**model_params)
    elif model_type == "logistic":
        if problem_type != "classification":
            raise ValueError("Logistic regression is only for classification problems")
        model = LogisticRegression(max_iter=1000, **model_params)
    else:
        raise ValueError(f"Unknown model type: {model_type}")
    
    # Train model
    model.fit(X_train, y_train)
    
    # Make predictions
    y_pred = model.predict(X_test)
    
    # Calculate metrics
    if problem_type == "classification":
        metrics = {
            "accuracy": round(accuracy_score(y_test, y_pred), 4),
            "precision": round(precision_score(y_test, y_pred, average='weighted', zero_division=0), 4),
            "recall": round(recall_score(y_test, y_pred, average='weighted', zero_division=0), 4),
            "f1_score": round(f1_score(y_test, y_pred, average='weighted', zero_division=0), 4)
        }
    else:
        mse = mean_squared_error(y_test, y_pred)
        metrics = {
            "r2_score": round(r2_score(y_test, y_pred), 4),
            "rmse": round(np.sqrt(mse), 4),
            "mae": round(mean_absolute_error(y_test, y_pred), 4),
            "mse": round(mse, 4)
        }
    
    # Store model
    model_name = f"{model_type}_{len(_session_models.get(session_id, {}).get('models', {}))}"
    
    if session_id not in _session_models:
        _session_models[session_id] = {"models": {}}
    
    _session_models[session_id]["models"][model_name] = model
    _session_models[session_id].update({
        "X_train": X_train,
        "X_test": X_test,
        "y_train": y_train,
        "y_test": y_test,
        "feature_names": list(X.columns),
        "target_column": target_column,
        "problem_type": problem_type
    })
    
    return {
        "model_name": model_name,
        "model_type": model_type,
        "problem_type": problem_type,
        "target_column": target_column,
        "dataset_shape": {"train": X_train.shape, "test": X_test.shape},
        "model_parameters": model_params,
        "metrics": metrics
    }

tool_registry.register(
    name="train_specific_model",
    description="Train a specific model type with custom parameters",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"},
            "target_column": {"type": "string", "description": "Column to predict"},
            "model_type": {
                "type": "string",
                "enum": ["random_forest", "xgboost", "linear", "logistic"],
                "description": "Type of model to train"
            },
            "test_size": {"type": "number", "description": "Fraction for test set (default: 0.2)"}
        },
        "required": ["session_id", "target_column", "model_type"]
    },
    function=train_specific_model
)