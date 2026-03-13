import pandas as pd
from typing import Dict, Any, List, Optional, Literal
from .registry import tool_registry

# ============================================
# HELPER: Get DataFrame from session
# ============================================
# We'll store DataFrames in a global session dict for now
# Later we'll move this to proper session management

_session_data: Dict[str, pd.DataFrame] = {}

def get_dataframe(session_id: str) -> pd.DataFrame:
    """Get DataFrame for a session"""
    if session_id not in _session_data:
        raise ValueError(f"Session {session_id} not found")
    return _session_data[session_id].copy()

def update_dataframe(session_id: str, df: pd.DataFrame):
    """Update DataFrame for a session"""
    _session_data[session_id] = df.copy()

def set_dataframe(session_id: str, df: pd.DataFrame):
    """Initialize DataFrame for a session"""
    _session_data[session_id] = df.copy()

# ============================================
# TOOL: Detect Missing Values
# ============================================

def detect_missing_values(session_id: str) -> Dict[str, Any]:
    """
    Analyze missing values in the dataset
    
    Returns summary of null counts and percentages per column
    """
    df = get_dataframe(session_id)
    
    missing_info = []
    total_rows = len(df)
    
    for col in df.columns:
        null_count = int(df[col].isna().sum())
        if null_count > 0:
            null_pct = round((null_count / total_rows) * 100, 2)
            missing_info.append({
                "column": col,
                "null_count": null_count,
                "null_percentage": null_pct
            })
    
    return {
        "total_rows": total_rows,
        "columns_with_missing": len(missing_info),
        "missing_data": missing_info
    }

tool_registry.register(
    name="detect_missing_values",
    description="Detects and summarizes missing values in the dataset",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {
                "type": "string",
                "description": "The session identifier"
            }
        },
        "required": ["session_id"]
    },
    function=detect_missing_values
)

# ============================================
# TOOL: Fill Missing Values
# ============================================

def fill_missing_values(
    session_id: str,
    column: str,
    strategy: Literal["mean", "median", "mode", "forward_fill", "drop"]
) -> Dict[str, Any]:
    """
    Fill or remove missing values in a specific column
    
    Args:
        session_id: Session ID
        column: Column name to handle
        strategy: How to handle nulls
            - mean: Fill with column mean (numeric only)
            - median: Fill with column median (numeric only)
            - mode: Fill with most common value
            - forward_fill: Use previous row's value
            - drop: Remove rows with nulls in this column
    """
    df = get_dataframe(session_id)
    
    if column not in df.columns:
        raise ValueError(f"Column '{column}' not found")
    
    original_nulls = int(df[column].isna().sum())
    original_rows = len(df)
    
    if strategy == "mean":
        if not pd.api.types.is_numeric_dtype(df[column]):
            raise ValueError(f"Cannot use mean strategy on non-numeric column '{column}'")
        fill_value = df[column].mean()
        df[column].fillna(fill_value, inplace=True)
        action = f"Filled with mean: {fill_value:.2f}"
        
    elif strategy == "median":
        if not pd.api.types.is_numeric_dtype(df[column]):
            raise ValueError(f"Cannot use median strategy on non-numeric column '{column}'")
        fill_value = df[column].median()
        df[column].fillna(fill_value, inplace=True)
        action = f"Filled with median: {fill_value:.2f}"
        
    elif strategy == "mode":
        mode_value = df[column].mode()
        if len(mode_value) > 0:
            fill_value = mode_value[0]
            df[column].fillna(fill_value, inplace=True)
            action = f"Filled with mode: {fill_value}"
        else:
            action = "No mode found, no changes made"
            
    elif strategy == "forward_fill":
        df[column].fillna(method='ffill', inplace=True)
        action = "Forward filled from previous rows"
        
    elif strategy == "drop":
        df.dropna(subset=[column], inplace=True)
        action = f"Dropped {original_rows - len(df)} rows"
    
    update_dataframe(session_id, df)
    
    new_nulls = int(df[column].isna().sum())
    
    return {
        "column": column,
        "strategy": strategy,
        "action": action,
        "nulls_before": original_nulls,
        "nulls_after": new_nulls,
        "rows_after": len(df)
    }

tool_registry.register(
    name="fill_missing_values",
    description="Fill or remove missing values in a column using various strategies",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"},
            "column": {"type": "string", "description": "Column name to process"},
            "strategy": {
                "type": "string",
                "enum": ["mean", "median", "mode", "forward_fill", "drop"],
                "description": "Strategy to handle missing values"
            }
        },
        "required": ["session_id", "column", "strategy"]
    },
    function=fill_missing_values
)

# ============================================
# TOOL: Remove Duplicates
# ============================================

def remove_duplicates(
    session_id: str,
    subset: Optional[List[str]] = None,
    keep: Literal["first", "last"] = "first"
) -> Dict[str, Any]:
    """
    Remove duplicate rows from the dataset
    
    Args:
        session_id: Session ID
        subset: List of columns to check for duplicates (None = all columns)
        keep: Which duplicate to keep ('first' or 'last')
    """
    df = get_dataframe(session_id)
    
    original_rows = len(df)
    
    df.drop_duplicates(subset=subset, keep=keep, inplace=True)
    
    update_dataframe(session_id, df)
    
    removed = original_rows - len(df)
    
    return {
        "original_rows": original_rows,
        "duplicates_removed": removed,
        "rows_remaining": len(df),
        "checked_columns": subset if subset else "all columns",
        "keep_strategy": keep
    }

tool_registry.register(
    name="remove_duplicates",
    description="Remove duplicate rows from the dataset",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"},
            "subset": {
                "type": "array",
                "items": {"type": "string"},
                "description": "Columns to check for duplicates (optional, default: all)"
            },
            "keep": {
                "type": "string",
                "enum": ["first", "last"],
                "description": "Which duplicate to keep"
            }
        },
        "required": ["session_id"]
    },
    function=remove_duplicates
)

# ============================================
# TOOL: Detect Outliers (IQR Method)
# ============================================

def detect_outliers(
    session_id: str,
    column: str,
    method: Literal["iqr", "zscore"] = "iqr",
    threshold: float = 1.5
) -> Dict[str, Any]:
    """
    Detect outliers in a numeric column
    
    Args:
        session_id: Session ID
        column: Column name to analyze
        method: Detection method
            - iqr: Interquartile range (default threshold=1.5)
            - zscore: Standard deviations from mean (default threshold=3)
        threshold: Sensitivity (1.5 for IQR, 3 for Z-score)
    """
    df = get_dataframe(session_id)
    
    if column not in df.columns:
        raise ValueError(f"Column '{column}' not found")
    
    if not pd.api.types.is_numeric_dtype(df[column]):
        raise ValueError(f"Column '{column}' is not numeric")
    
    col_data = df[column].dropna()
    
    if method == "iqr":
        Q1 = col_data.quantile(0.25)
        Q3 = col_data.quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - threshold * IQR
        upper_bound = Q3 + threshold * IQR
        outliers = df[(df[column] < lower_bound) | (df[column] > upper_bound)]
        
    elif method == "zscore":
        mean = col_data.mean()
        std = col_data.std()
        z_scores = ((df[column] - mean) / std).abs()
        outliers = df[z_scores > threshold]
    
    outlier_count = len(outliers)
    outlier_percentage = round((outlier_count / len(df)) * 100, 2)
    
    return {
        "column": column,
        "method": method,
        "threshold": threshold,
        "outlier_count": outlier_count,
        "outlier_percentage": outlier_percentage,
        "total_rows": len(df),
        "bounds": {
            "lower": float(lower_bound) if method == "iqr" else None,
            "upper": float(upper_bound) if method == "iqr" else None
        } if method == "iqr" else None
    }

tool_registry.register(
    name="detect_outliers",
    description="Detect outliers in a numeric column using IQR or Z-score method",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"},
            "column": {"type": "string", "description": "Numeric column to analyze"},
            "method": {
                "type": "string",
                "enum": ["iqr", "zscore"],
                "description": "Detection method"
            },
            "threshold": {
                "type": "number",
                "description": "Sensitivity threshold (1.5 for IQR, 3 for Z-score)"
            }
        },
        "required": ["session_id", "column"]
    },
    function=detect_outliers
)

# ============================================
# TOOL: Remove Outliers
# ============================================

def remove_outliers(
    session_id: str,
    column: str,
    method: Literal["iqr", "zscore"] = "iqr",
    threshold: float = 1.5
) -> Dict[str, Any]:
    """
    Remove outliers from the dataset based on a numeric column
    
    Uses the same detection logic as detect_outliers but removes the rows
    """
    df = get_dataframe(session_id)
    
    if column not in df.columns:
        raise ValueError(f"Column '{column}' not found")
    
    if not pd.api.types.is_numeric_dtype(df[column]):
        raise ValueError(f"Column '{column}' is not numeric")
    
    original_rows = len(df)
    col_data = df[column].dropna()
    
    if method == "iqr":
        Q1 = col_data.quantile(0.25)
        Q3 = col_data.quantile(0.75)
        IQR = Q3 - Q1
        lower_bound = Q1 - threshold * IQR
        upper_bound = Q3 + threshold * IQR
        df = df[(df[column] >= lower_bound) & (df[column] <= upper_bound)]
        
    elif method == "zscore":
        mean = col_data.mean()
        std = col_data.std()
        z_scores = ((df[column] - mean) / std).abs()
        df = df[z_scores <= threshold]
    
    update_dataframe(session_id, df)
    
    removed = original_rows - len(df)
    
    return {
        "column": column,
        "method": method,
        "threshold": threshold,
        "rows_removed": removed,
        "rows_remaining": len(df),
        "removal_percentage": round((removed / original_rows) * 100, 2)
    }

tool_registry.register(
    name="remove_outliers",
    description="Remove outlier rows from the dataset based on a numeric column",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"},
            "column": {"type": "string", "description": "Numeric column to filter on"},
            "method": {
                "type": "string",
                "enum": ["iqr", "zscore"],
                "description": "Detection method"
            },
            "threshold": {
                "type": "number",
                "description": "Sensitivity threshold"
            }
        },
        "required": ["session_id", "column"]
    },
    function=remove_outliers
)