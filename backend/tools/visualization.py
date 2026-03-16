import pandas as pd
import matplotlib.pyplot as plt
import seaborn as sns
import numpy as np
from typing import Dict, Any, List, Optional, Literal
import io
import base64
import os
from .registry import tool_registry
from .cleaning import get_dataframe

# Set matplotlib backend for headless operation
plt.switch_backend('Agg')

# Create charts directory if it doesn't exist
CHARTS_DIR = "charts"
os.makedirs(CHARTS_DIR, exist_ok=True)

def _save_plot_as_base64() -> str:
    """Save current matplotlib plot as base64 string"""
    buffer = io.BytesIO()
    plt.savefig(buffer, format='png', dpi=80, bbox_inches='tight')
    buffer.seek(0)
    image_base64 = base64.b64encode(buffer.getvalue()).decode()
    plt.close()
    return f"data:image/png;base64,{image_base64}"

def _save_plot_as_file(filename: str) -> str:
    """Save current matplotlib plot as file"""
    filepath = os.path.join(CHARTS_DIR, filename)
    plt.savefig(filepath, dpi=150, bbox_inches='tight')
    plt.close()
    return filepath

# ============================================
# TOOL: Histogram
# ============================================

def create_histogram(
    session_id: str,
    column: str,
    bins: int = 30,
    title: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create histogram for a numeric column
    
    Args:
        session_id: Session ID
        column: Numeric column to plot
        bins: Number of bins for histogram
        title: Custom title (optional)
    """
    df = get_dataframe(session_id)
    
    if column not in df.columns:
        raise ValueError(f"Column '{column}' not found")
    
    if not pd.api.types.is_numeric_dtype(df[column]):
        raise ValueError(f"Column '{column}' must be numeric")
    
    # Create histogram
    plt.figure(figsize=(8, 5), layout='constrained')
    data = df[column].dropna()
    
    plt.hist(data, bins=bins, alpha=0.7, color='skyblue', edgecolor='black')
    plt.title(title or f'Distribution of {column}')
    plt.xlabel(column)
    plt.ylabel('Frequency')
    plt.grid(True, alpha=0.3)
    
    # Add statistics text
    stats_text = f'Mean: {data.mean():.2f}\nStd: {data.std():.2f}\nCount: {len(data)}'
    plt.text(0.02, 0.98, stats_text, transform=plt.gca().transAxes, 
             verticalalignment='top', bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))
    
    image_b64 = _save_plot_as_base64()
    
    return {
        "chart_type": "histogram",
        "column": column,
        "bins": bins,
        "statistics": {
            "mean": round(float(data.mean()), 4),
            "std": round(float(data.std()), 4),
            "min": float(data.min()),
            "max": float(data.max()),
            "count": len(data)
        },
        "image_base64": image_b64
    }

tool_registry.register(
    name="create_histogram",
    description="Create histogram to visualize distribution of a numeric column",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"},
            "column": {"type": "string", "description": "Numeric column to plot"},
            "bins": {"type": "integer", "description": "Number of bins (default: 30)"},
            "title": {"type": "string", "description": "Custom chart title (optional)"}
        },
        "required": ["session_id", "column"]
    },
    function=create_histogram
)

# ============================================
# TOOL: Bar Chart
# ============================================

def create_bar_chart(
    session_id: str,
    column: str,
    top_n: int = 10,
    title: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create bar chart for categorical column value counts
    
    Args:
        session_id: Session ID
        column: Categorical column to plot
        top_n: Show top N categories
        title: Custom title (optional)
    """
    df = get_dataframe(session_id)
    
    if column not in df.columns:
        raise ValueError(f"Column '{column}' not found")
    
    # Get value counts
    value_counts = df[column].value_counts().head(top_n)
    
    # Create bar chart
    plt.figure(figsize=(9, 5), layout='constrained')
    bars = plt.bar(range(len(value_counts)), value_counts.values, color='lightcoral')
    
    plt.title(title or f'Top {top_n} Values in {column}')
    plt.xlabel(column)
    plt.ylabel('Count')
    plt.xticks(range(len(value_counts)), value_counts.index, rotation=45, ha='right')
    plt.grid(True, alpha=0.3, axis='y')
    
    # Add value labels on bars
    for i, bar in enumerate(bars):
        height = bar.get_height()
        plt.text(bar.get_x() + bar.get_width()/2., height + 0.01*max(value_counts),
                f'{int(height)}', ha='center', va='bottom')
    
    plt.tight_layout()
    image_b64 = _save_plot_as_base64()
    
    return {
        "chart_type": "bar_chart",
        "column": column,
        "top_n": top_n,
        "value_counts": value_counts.to_dict(),
        "total_categories": int(df[column].nunique()),
        "image_base64": image_b64
    }

tool_registry.register(
    name="create_bar_chart",
    description="Create bar chart showing value counts for a categorical column",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"},
            "column": {"type": "string", "description": "Categorical column to plot"},
            "top_n": {"type": "integer", "description": "Show top N categories (default: 10)"},
            "title": {"type": "string", "description": "Custom chart title (optional)"}
        },
        "required": ["session_id", "column"]
    },
    function=create_bar_chart
)

# ============================================
# TOOL: Scatter Plot
# ============================================

def create_scatter_plot(
    session_id: str,
    x_column: str,
    y_column: str,
    color_column: Optional[str] = None,
    title: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create scatter plot between two numeric columns
    
    Args:
        session_id: Session ID
        x_column: Column for X-axis
        y_column: Column for Y-axis
        color_column: Optional column for color coding
        title: Custom title (optional)
    """
    df = get_dataframe(session_id)
    
    if x_column not in df.columns:
        raise ValueError(f"Column '{x_column}' not found")
    if y_column not in df.columns:
        raise ValueError(f"Column '{y_column}' not found")
    
    if not pd.api.types.is_numeric_dtype(df[x_column]):
        raise ValueError(f"X column '{x_column}' must be numeric")
    if not pd.api.types.is_numeric_dtype(df[y_column]):
        raise ValueError(f"Y column '{y_column}' must be numeric")
    
    # Create scatter plot
    plt.figure(figsize=(8, 6), layout='constrained')
    
    if color_column and color_column in df.columns:
        # Color by category
        if pd.api.types.is_numeric_dtype(df[color_column]):
            scatter = plt.scatter(df[x_column], df[y_column], c=df[color_column], 
                                cmap='viridis', alpha=0.7)
            plt.colorbar(scatter, label=color_column)
        else:
            # Categorical coloring
            categories = df[color_column].unique()
            colors = plt.cm.Set3(np.linspace(0, 1, len(categories)))
            for i, category in enumerate(categories):
                mask = df[color_column] == category
                plt.scatter(df[mask][x_column], df[mask][y_column], 
                          c=[colors[i]], label=str(category), alpha=0.7)
            plt.legend()
    else:
        plt.scatter(df[x_column], df[y_column], alpha=0.7, color='steelblue')
    
    plt.title(title or f'{y_column} vs {x_column}')
    plt.xlabel(x_column)
    plt.ylabel(y_column)
    plt.grid(True, alpha=0.3)
    
    # Calculate correlation
    correlation = df[x_column].corr(df[y_column])
    plt.text(0.02, 0.98, f'Correlation: {correlation:.3f}', 
             transform=plt.gca().transAxes, verticalalignment='top',
             bbox=dict(boxstyle='round', facecolor='white', alpha=0.8))
    
    plt.tight_layout()
    image_b64 = _save_plot_as_base64()
    
    return {
        "chart_type": "scatter_plot",
        "x_column": x_column,
        "y_column": y_column,
        "color_column": color_column,
        "correlation": round(float(correlation), 4),
        "data_points": len(df.dropna(subset=[x_column, y_column])),
        "image_base64": image_b64
    }

tool_registry.register(
    name="create_scatter_plot",
    description="Create scatter plot to visualize relationship between two numeric columns",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"},
            "x_column": {"type": "string", "description": "Column for X-axis"},
            "y_column": {"type": "string", "description": "Column for Y-axis"},
            "color_column": {"type": "string", "description": "Optional column for color coding"},
            "title": {"type": "string", "description": "Custom chart title (optional)"}
        },
        "required": ["session_id", "x_column", "y_column"]
    },
    function=create_scatter_plot
)

# ============================================
# TOOL: Correlation Heatmap
# ============================================

def create_correlation_heatmap(
    session_id: str,
    method: str = "pearson",
    title: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create correlation heatmap for all numeric columns
    
    Args:
        session_id: Session ID
        method: Correlation method ('pearson', 'spearman', 'kendall')
        title: Custom title (optional)
    """
    df = get_dataframe(session_id)
    
    # Get only numeric columns
    numeric_df = df.select_dtypes(include=[np.number])
    
    if len(numeric_df.columns) < 2:
        raise ValueError("Need at least 2 numeric columns for correlation heatmap")
    
    # Calculate correlation matrix
    corr_matrix = numeric_df.corr(method=method)
    
    # Create heatmap
    plt.figure(figsize=(8, 7), layout='constrained')
    mask = np.triu(np.ones_like(corr_matrix, dtype=bool))  # Hide upper triangle
    
    sns.heatmap(corr_matrix, mask=mask, annot=True, cmap='coolwarm', center=0,
                square=True, linewidths=0.5, cbar_kws={"shrink": .8}, fmt='.3f')
    
    plt.title(title or f'Correlation Heatmap ({method.title()})')
    plt.tight_layout()
    
    image_b64 = _save_plot_as_base64()
    
    return {
        "chart_type": "correlation_heatmap",
        "method": method,
        "numeric_columns": list(numeric_df.columns),
        "correlation_matrix": corr_matrix.round(4).to_dict(),
        "image_base64": image_b64
    }

tool_registry.register(
    name="create_correlation_heatmap",
    description="Create correlation heatmap showing relationships between all numeric columns",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"},
            "method": {
                "type": "string",
                "enum": ["pearson", "spearman", "kendall"],
                "description": "Correlation method (default: pearson)"
            },
            "title": {"type": "string", "description": "Custom chart title (optional)"}
        },
        "required": ["session_id"]
    },
    function=create_correlation_heatmap
)

# ============================================
# TOOL: Box Plot
# ============================================

def create_box_plot(
    session_id: str,
    column: str,
    group_by: Optional[str] = None,
    title: Optional[str] = None
) -> Dict[str, Any]:
    """
    Create box plot to show distribution and outliers
    
    Args:
        session_id: Session ID
        column: Numeric column to plot
        group_by: Optional categorical column to group by
        title: Custom title (optional)
    """
    df = get_dataframe(session_id)
    
    if column not in df.columns:
        raise ValueError(f"Column '{column}' not found")
    
    if not pd.api.types.is_numeric_dtype(df[column]):
        raise ValueError(f"Column '{column}' must be numeric")
    
    plt.figure(figsize=(8, 5), layout='constrained')
    
    if group_by and group_by in df.columns:
        # Grouped box plot
        groups = df[group_by].unique()
        data_by_group = [df[df[group_by] == group][column].dropna() for group in groups]
        
        plt.boxplot(data_by_group, labels=groups)
        plt.xlabel(group_by)
    else:
        # Single box plot
        plt.boxplot(df[column].dropna())
        plt.xticks([1], [column])
    
    plt.title(title or f'Box Plot of {column}' + (f' by {group_by}' if group_by else ''))
    plt.ylabel(column)
    plt.grid(True, alpha=0.3)
    
    plt.tight_layout()
    image_b64 = _save_plot_as_base64()
    
    # Calculate outlier statistics
    Q1 = df[column].quantile(0.25)
    Q3 = df[column].quantile(0.75)
    IQR = Q3 - Q1
    lower_bound = Q1 - 1.5 * IQR
    upper_bound = Q3 + 1.5 * IQR
    outliers = df[(df[column] < lower_bound) | (df[column] > upper_bound)]
    
    return {
        "chart_type": "box_plot",
        "column": column,
        "group_by": group_by,
        "outlier_statistics": {
            "Q1": float(Q1),
            "Q3": float(Q3),
            "IQR": float(IQR),
            "lower_bound": float(lower_bound),
            "upper_bound": float(upper_bound),
            "outlier_count": len(outliers),
            "outlier_percentage": round((len(outliers) / len(df)) * 100, 2)
        },
        "image_base64": image_b64
    }
tool_registry.register(
    name="create_box_plot",
    description="Create box plot to visualize distribution and detect outliers in a numeric column",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"},
            "column": {"type": "string", "description": "Numeric column to plot"},
            "group_by": {"type": "string", "description": "Optional categorical column to group by"},
            "title": {"type": "string", "description": "Custom chart title (optional)"}
        },
        "required": ["session_id", "column"]
    },
    function=create_box_plot
)