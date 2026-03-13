import pandas as pd
import numpy as np
from typing import Dict, Any, List, Optional
from .registry import tool_registry

# Import session helpers from cleaning module
from .cleaning import get_dataframe

# ============================================
# TOOL: Dataset Overview
# ============================================

def dataset_overview(session_id: str) -> Dict[str, Any]:
    """
    Get comprehensive overview of the dataset
    
    Returns basic statistics, data types, and summary info
    """
    df = get_dataframe(session_id)
    
    # Basic info
    overview = {
        "shape": {"rows": len(df), "columns": len(df.columns)},
        "memory_usage_mb": round(df.memory_usage(deep=True).sum() / (1024 * 1024), 2),
        "column_types": {},
        "missing_data_summary": {},
        "numeric_summary": {},
        "categorical_summary": {}
    }
    
    # Column type analysis
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    categorical_cols = df.select_dtypes(include=['object', 'category']).columns.tolist()
    datetime_cols = df.select_dtypes(include=['datetime64']).columns.tolist()
    
    overview["column_types"] = {
        "numeric": numeric_cols,
        "categorical": categorical_cols,
        "datetime": datetime_cols
    }
    
    # Missing data summary
    missing_counts = df.isnull().sum()
    overview["missing_data_summary"] = {
        "total_missing_values": int(missing_counts.sum()),
        "columns_with_missing": len(missing_counts[missing_counts > 0]),
        "missing_percentage": round((missing_counts.sum() / (len(df) * len(df.columns))) * 100, 2)
    }
    
    # Numeric columns summary
    if numeric_cols:
        numeric_stats = df[numeric_cols].describe()
        overview["numeric_summary"] = {
            col: {
                "mean": round(float(numeric_stats.loc['mean', col]), 2),
                "std": round(float(numeric_stats.loc['std', col]), 2),
                "min": float(numeric_stats.loc['min', col]),
                "max": float(numeric_stats.loc['max', col]),
                "median": round(float(numeric_stats.loc['50%', col]), 2)
            }
            for col in numeric_cols
        }
    
    # Categorical summary
    if categorical_cols:
        overview["categorical_summary"] = {
            col: {
                "unique_count": int(df[col].nunique()),
                "most_frequent": str(df[col].mode().iloc[0]) if not df[col].mode().empty else None,
                "most_frequent_count": int(df[col].value_counts().iloc[0]) if len(df[col].value_counts()) > 0 else 0
            }
            for col in categorical_cols
        }
    
    return overview

tool_registry.register(
    name="dataset_overview",
    description="Get comprehensive overview of dataset including shape, types, missing data, and basic statistics",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"}
        },
        "required": ["session_id"]
    },
    function=dataset_overview
)

# ============================================
# TOOL: Column Statistics
# ============================================

def column_statistics(session_id: str, column: str) -> Dict[str, Any]:
    """
    Get detailed statistics for a specific column
    
    Args:
        session_id: Session ID
        column: Column name to analyze
    """
    df = get_dataframe(session_id)
    
    if column not in df.columns:
        raise ValueError(f"Column '{column}' not found")
    
    col_data = df[column]
    stats = {
        "column": column,
        "dtype": str(col_data.dtype),
        "total_count": len(col_data),
        "null_count": int(col_data.isnull().sum()),
        "null_percentage": round((col_data.isnull().sum() / len(col_data)) * 100, 2),
        "unique_count": int(col_data.nunique())
    }
    
    # Numeric column analysis
    if pd.api.types.is_numeric_dtype(col_data):
        non_null_data = col_data.dropna()
        if len(non_null_data) > 0:
            stats.update({
                "mean": round(float(non_null_data.mean()), 4),
                "median": round(float(non_null_data.median()), 4),
                "std": round(float(non_null_data.std()), 4),
                "min": float(non_null_data.min()),
                "max": float(non_null_data.max()),
                "q25": round(float(non_null_data.quantile(0.25)), 4),
                "q75": round(float(non_null_data.quantile(0.75)), 4),
                "skewness": round(float(non_null_data.skew()), 4),
                "kurtosis": round(float(non_null_data.kurtosis()), 4)
            })
    
    # Categorical column analysis
    else:
        value_counts = col_data.value_counts()
        stats.update({
            "most_frequent": str(value_counts.index[0]) if len(value_counts) > 0 else None,
            "most_frequent_count": int(value_counts.iloc[0]) if len(value_counts) > 0 else 0,
            "top_5_values": [
                {"value": str(val), "count": int(count)}
                for val, count in value_counts.head(5).items()
            ]
        })
    
    return stats

tool_registry.register(
    name="column_statistics",
    description="Get detailed statistics for a specific column including distribution metrics",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"},
            "column": {"type": "string", "description": "Column name to analyze"}
        },
        "required": ["session_id", "column"]
    },
    function=column_statistics
)

# ============================================
# TOOL: Correlation Analysis
# ============================================

def correlation_analysis(
    session_id: str,
    method: str = "pearson",
    min_correlation: float = 0.1
) -> Dict[str, Any]:
    """
    Calculate correlations between numeric columns
    
    Args:
        session_id: Session ID
        method: Correlation method ('pearson', 'spearman', 'kendall')
        min_correlation: Minimum correlation threshold to report
    """
    df = get_dataframe(session_id)
    
    # Get only numeric columns
    numeric_df = df.select_dtypes(include=[np.number])
    
    if len(numeric_df.columns) < 2:
        return {
            "error": "Need at least 2 numeric columns for correlation analysis",
            "numeric_columns_found": len(numeric_df.columns)
        }
    
    # Calculate correlation matrix
    corr_matrix = numeric_df.corr(method=method)
    
    # Extract significant correlations
    significant_correlations = []
    
    for i, col1 in enumerate(corr_matrix.columns):
        for j, col2 in enumerate(corr_matrix.columns):
            if i < j:  # Avoid duplicates and self-correlation
                corr_value = corr_matrix.loc[col1, col2]
                if not pd.isna(corr_value) and abs(corr_value) >= min_correlation:
                    significant_correlations.append({
                        "column1": col1,
                        "column2": col2,
                        "correlation": round(float(corr_value), 4),
                        "strength": (
                            "strong" if abs(corr_value) >= 0.7 else
                            "moderate" if abs(corr_value) >= 0.3 else
                            "weak"
                        ),
                        "direction": "positive" if corr_value > 0 else "negative"
                    })
    
    # Sort by absolute correlation value
    significant_correlations.sort(key=lambda x: abs(x["correlation"]), reverse=True)
    
    return {
        "method": method,
        "numeric_columns": list(numeric_df.columns),
        "total_correlations": len(significant_correlations),
        "significant_correlations": significant_correlations[:20],  # Top 20
        "correlation_matrix": corr_matrix.round(4).to_dict()
    }

tool_registry.register(
    name="correlation_analysis",
    description="Calculate and analyze correlations between numeric columns",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"},
            "method": {
                "type": "string",
                "enum": ["pearson", "spearman", "kendall"],
                "description": "Correlation method"
            },
            "min_correlation": {
                "type": "number",
                "description": "Minimum correlation threshold to report"
            }
        },
        "required": ["session_id"]
    },
    function=correlation_analysis
)

# ============================================
# TOOL: Value Counts
# ============================================

def value_counts(
    session_id: str,
    column: str,
    top_n: int = 10,
    normalize: bool = False
) -> Dict[str, Any]:
    """
    Get value counts for a categorical column
    
    Args:
        session_id: Session ID
        column: Column name to analyze
        top_n: Number of top values to return
        normalize: Return percentages instead of counts
    """
    df = get_dataframe(session_id)
    
    if column not in df.columns:
        raise ValueError(f"Column '{column}' not found")
    
    counts = df[column].value_counts(normalize=normalize, dropna=False)
    
    # Convert to list of dictionaries
    value_list = []
    for value, count in counts.head(top_n).items():
        value_list.append({
            "value": str(value) if pd.notna(value) else "NULL",
            "count": int(count) if not normalize else round(float(count), 4),
            "percentage": round(float(count * 100), 2) if normalize else round((count / len(df)) * 100, 2)
        })
    
    return {
        "column": column,
        "total_unique_values": int(df[column].nunique()),
        "total_rows": len(df),
        "showing_top": min(top_n, len(counts)),
        "normalized": normalize,
        "value_counts": value_list
    }

tool_registry.register(
    name="value_counts",
    description="Get frequency counts for values in a categorical column",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"},
            "column": {"type": "string", "description": "Column name to analyze"},
            "top_n": {"type": "integer", "description": "Number of top values to return"},
            "normalize": {"type": "boolean", "description": "Return percentages instead of counts"}
        },
        "required": ["session_id", "column"]
    },
    function=value_counts
)

# ============================================
# TOOL: Data Quality Report
# ============================================

def data_quality_report(session_id: str) -> Dict[str, Any]:
    """
    Generate comprehensive data quality report
    
    Analyzes missing values, duplicates, data types, and potential issues
    """
    df = get_dataframe(session_id)
    
    report = {
        "dataset_info": {
            "rows": len(df),
            "columns": len(df.columns),
            "memory_mb": round(df.memory_usage(deep=True).sum() / (1024 * 1024), 2)
        },
        "missing_data": {},
        "duplicates": {},
        "data_types": {},
        "potential_issues": []
    }
    
    # Missing data analysis
    missing_counts = df.isnull().sum()
    missing_cols = missing_counts[missing_counts > 0]
    
    report["missing_data"] = {
        "total_missing": int(missing_counts.sum()),
        "columns_affected": len(missing_cols),
        "worst_columns": [
            {"column": col, "missing_count": int(count), "missing_percentage": round((count/len(df))*100, 2)}
            for col, count in missing_cols.sort_values(ascending=False).head(5).items()
        ]
    }
    
    # Duplicate analysis
    duplicate_rows = df.duplicated().sum()
    report["duplicates"] = {
        "duplicate_rows": int(duplicate_rows),
        "duplicate_percentage": round((duplicate_rows / len(df)) * 100, 2)
    }
    
    # Data type analysis
    type_counts = df.dtypes.value_counts()
    report["data_types"] = {str(dtype): int(count) for dtype, count in type_counts.items()}
    
    # Identify potential issues
    issues = []
    
    # High missing data
    if missing_counts.sum() / (len(df) * len(df.columns)) > 0.1:
        issues.append("High missing data rate (>10%)")
    
    # Many duplicates
    if duplicate_rows / len(df) > 0.05:
        issues.append("High duplicate rate (>5%)")
    
    # Columns with all same values
    constant_cols = [col for col in df.columns if df[col].nunique() <= 1]
    if constant_cols:
        issues.append(f"Constant columns found: {constant_cols}")
    
    # Very high cardinality categorical columns
    high_cardinality = []
    for col in df.select_dtypes(include=['object']).columns:
        if df[col].nunique() > len(df) * 0.8:
            high_cardinality.append(col)
    if high_cardinality:
        issues.append(f"High cardinality categorical columns: {high_cardinality}")
    
    report["potential_issues"] = issues
    
    return report

tool_registry.register(
    name="data_quality_report",
    description="Generate comprehensive data quality report identifying missing data, duplicates, and potential issues",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"}
        },
        "required": ["session_id"]
    },
    function=data_quality_report
)