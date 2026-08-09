# backend/tools/visualization.py
import pandas as pd
import matplotlib
matplotlib.use('Agg')  # must be before pyplot import
import matplotlib.pyplot as plt
import numpy as np
from typing import Dict, Any, Optional
import io
import base64
import os
from .registry import tool_registry
from .cleaning import get_dataframe

plt.switch_backend('Agg')
os.makedirs("charts", exist_ok=True)


def _fig_to_b64() -> str:
    """Render current figure to base64 PNG, then close all figures."""
    buf = io.BytesIO()
    plt.savefig(buf, format='png', dpi=80, bbox_inches='tight',
                facecolor=plt.gcf().get_facecolor())
    buf.seek(0)
    b64 = base64.b64encode(buf.getvalue()).decode()
    plt.close('all')
    return f"data:image/png;base64,{b64}"


def _dark_ax(fig, ax):
    ax.set_facecolor('#141414')
    fig.patch.set_facecolor('#0E0E0E')
    ax.tick_params(colors='#8C8C8C')
    ax.grid(True, alpha=0.12, color='white')
    for sp in ax.spines.values():
        sp.set_color('#333333')


# ── Histogram ─────────────────────────────────────────────────────
def create_histogram(session_id: str, column: str, bins: int = 30,
                     title: Optional[str] = None) -> Dict[str, Any]:
    df = get_dataframe(session_id)
    if column not in df.columns:
        raise ValueError(f"Column '{column}' not found. Available: {list(df.columns)}")
    if not pd.api.types.is_numeric_dtype(df[column]):
        raise ValueError(f"Column '{column}' is not numeric")

    plt.close('all')
    fig, ax = plt.subplots(figsize=(8, 5))
    data = df[column].dropna()
    ax.hist(data, bins=bins, alpha=0.75, color='#00D4FF', edgecolor='#0A0A0A')
    ax.set_title(title or f'Distribution of {column}', color='#F2F2F2', fontsize=13)
    ax.set_xlabel(column, color='#8C8C8C')
    ax.set_ylabel('Frequency', color='#8C8C8C')
    _dark_ax(fig, ax)
    ax.text(0.97, 0.97,
            f'Mean: {data.mean():.2f}\nStd:  {data.std():.2f}\nN:    {len(data):,}',
            transform=ax.transAxes, va='top', ha='right', fontsize=9, fontfamily='monospace',
            color='#8C8C8C', bbox=dict(boxstyle='round', fc='#1A1A1A', ec='#333', alpha=0.9))
    fig.tight_layout()
    return {
        "chart_type": "histogram", "column": column,
        "statistics": {"mean": round(float(data.mean()), 4), "std": round(float(data.std()), 4),
                       "min": float(data.min()), "max": float(data.max()), "count": int(len(data))},
        "image_base64": _fig_to_b64(),
    }

tool_registry.register(
    name="create_histogram",
    description="Histogram of a numeric column",
    parameters={"type": "object", "properties": {
        "session_id": {"type": "string"},
        "column":     {"type": "string"},
        "bins":       {"type": "integer"},
        "title":      {"type": "string"},
    }, "required": ["session_id", "column"]},
    function=create_histogram,
)


# ── Bar chart ──────────────────────────────────────────────────────
def create_bar_chart(session_id: str, column: str, top_n: int = 10,
                     title: Optional[str] = None) -> Dict[str, Any]:
    df = get_dataframe(session_id)
    if column not in df.columns:
        raise ValueError(f"Column '{column}' not found")
    vc = df[column].value_counts().head(top_n)

    plt.close('all')
    fig, ax = plt.subplots(figsize=(9, 5))
    bars = ax.bar(range(len(vc)), vc.values, color='#8B5CF6', edgecolor='#0A0A0A', alpha=0.85)
    ax.set_title(title or f'Top {top_n} – {column}', color='#F2F2F2', fontsize=13)
    ax.set_xlabel(column, color='#8C8C8C')
    ax.set_ylabel('Count', color='#8C8C8C')
    ax.set_xticks(range(len(vc)))
    ax.set_xticklabels([str(v) for v in vc.index], rotation=40, ha='right', color='#8C8C8C')
    _dark_ax(fig, ax)
    for bar, val in zip(bars, vc.values):
        ax.text(bar.get_x() + bar.get_width() / 2, bar.get_height() + max(vc) * 0.01,
                str(int(val)), ha='center', va='bottom', color='#8C8C8C', fontsize=8)
    fig.tight_layout()
    return {
        "chart_type": "bar_chart", "column": column,
        "value_counts": {str(k): int(v) for k, v in vc.items()},
        "total_categories": int(df[column].nunique()),
        "image_base64": _fig_to_b64(),
    }

tool_registry.register(
    name="create_bar_chart",
    description="Bar chart of value counts for a categorical column",
    parameters={"type": "object", "properties": {
        "session_id": {"type": "string"},
        "column":     {"type": "string"},
        "top_n":      {"type": "integer"},
        "title":      {"type": "string"},
    }, "required": ["session_id", "column"]},
    function=create_bar_chart,
)


# ── Scatter plot ───────────────────────────────────────────────────
def create_scatter_plot(session_id: str, x_column: str, y_column: str,
                        color_column: Optional[str] = None,
                        title: Optional[str] = None) -> Dict[str, Any]:
    df = get_dataframe(session_id)
    for c in [x_column, y_column]:
        if c not in df.columns:
            raise ValueError(f"Column '{c}' not found")
        if not pd.api.types.is_numeric_dtype(df[c]):
            raise ValueError(f"Column '{c}' must be numeric")

    plt.close('all')
    fig, ax = plt.subplots(figsize=(8, 6))
    palette = ['#00D4FF','#8B5CF6','#3FB950','#D29922','#F85149',
               '#EC4899','#F59E0B','#06B6D4','#84CC16','#A78BFA']

    if color_column and color_column in df.columns:
        if pd.api.types.is_numeric_dtype(df[color_column]):
            sc = ax.scatter(df[x_column], df[y_column], c=df[color_column],
                            cmap='plasma', alpha=0.6, s=18)
            fig.colorbar(sc, ax=ax, label=color_column)
        else:
            for i, cat in enumerate(df[color_column].dropna().unique()[:10]):
                m = df[color_column] == cat
                ax.scatter(df[m][x_column], df[m][y_column],
                           c=palette[i % len(palette)], label=str(cat), alpha=0.7, s=18)
            ax.legend(fontsize=8, facecolor='#1A1A1A', edgecolor='#333', labelcolor='#8C8C8C')
    else:
        ax.scatter(df[x_column], df[y_column], alpha=0.6, color='#00D4FF', s=18)

    r = df[x_column].corr(df[y_column])
    ax.text(0.03, 0.97, f'r = {r:.3f}', transform=ax.transAxes, va='top', fontsize=9,
            fontfamily='monospace', color='#8C8C8C',
            bbox=dict(boxstyle='round', fc='#1A1A1A', ec='#333', alpha=0.9))
    ax.set_title(title or f'{y_column} vs {x_column}', color='#F2F2F2', fontsize=13)
    ax.set_xlabel(x_column, color='#8C8C8C')
    ax.set_ylabel(y_column, color='#8C8C8C')
    _dark_ax(fig, ax)
    fig.tight_layout()
    return {
        "chart_type": "scatter_plot", "x_column": x_column, "y_column": y_column,
        "correlation": round(float(r), 4),
        "image_base64": _fig_to_b64(),
    }

tool_registry.register(
    name="create_scatter_plot",
    description="Scatter plot between two numeric columns",
    parameters={"type": "object", "properties": {
        "session_id":   {"type": "string"},
        "x_column":     {"type": "string"},
        "y_column":     {"type": "string"},
        "color_column": {"type": "string"},
        "title":        {"type": "string"},
    }, "required": ["session_id", "x_column", "y_column"]},
    function=create_scatter_plot,
)


# ── Correlation heatmap  (Windows-safe: imshow, not seaborn) ──────
def create_correlation_heatmap(session_id: str, method: str = "pearson",
                                title: Optional[str] = None) -> Dict[str, Any]:
    df = get_dataframe(session_id)
    num = df.select_dtypes(include=[np.number])
    if len(num.columns) < 2:
        raise ValueError("Need ≥2 numeric columns")

    corr = num.corr(method=method)

    # Full reset before drawing — eliminates the colorbar-engine conflict on Windows
    plt.close('all')
    matplotlib.rcParams.update(matplotlib.rcParamsDefault)
    matplotlib.use('Agg')

    n = len(corr.columns)
    fs = max(8, min(n * 0.7 + 2, 16))
    fig, ax = plt.subplots(figsize=(fs, fs * 0.85))

    # Lower-triangle mask (show only half)
    vals = corr.values.astype(float).copy()
    mask = np.triu(np.ones_like(vals, dtype=bool), k=1)
    vals[mask] = np.nan

    # imshow avoids seaborn's colorbar-engine entirely
    im = ax.imshow(vals, cmap='RdYlGn', aspect='auto', vmin=-1, vmax=1,
                   interpolation='nearest')

    # Plain fig.colorbar — no engine argument needed
    cbar = fig.colorbar(im, ax=ax, shrink=0.8, pad=0.02)
    cbar.ax.tick_params(colors='#8C8C8C', labelsize=8)
    cbar.set_label('Correlation', color='#8C8C8C', fontsize=9)

    fsz = max(6, 9 - n // 4)
    for i in range(n):
        for j in range(n):
            if not mask[i, j]:
                v = corr.values[i, j]
                ax.text(j, i, f'{v:.2f}', ha='center', va='center',
                        fontsize=fsz, fontfamily='monospace',
                        color='white' if abs(v) > 0.6 else '#8C8C8C')

    tick_fs = max(7, 10 - n // 5)
    ax.set_xticks(range(n))
    ax.set_yticks(range(n))
    ax.set_xticklabels(corr.columns, rotation=45, ha='right',
                       color='#8C8C8C', fontsize=tick_fs)
    ax.set_yticklabels(corr.columns, color='#8C8C8C', fontsize=tick_fs)
    ax.set_title(title or f'Correlation Heatmap ({method.title()})',
                 color='#F2F2F2', fontsize=13, pad=12)
    ax.set_facecolor('#141414')
    fig.patch.set_facecolor('#0E0E0E')
    for sp in ax.spines.values():
        sp.set_color('#333333')

    fig.tight_layout()
    return {
        "chart_type": "correlation_heatmap", "method": method,
        "numeric_columns": list(num.columns),
        "correlation_matrix": corr.round(4).to_dict(),
        "image_base64": _fig_to_b64(),
    }

tool_registry.register(
    name="create_correlation_heatmap",
    description="Correlation heatmap for all numeric columns",
    parameters={"type": "object", "properties": {
        "session_id": {"type": "string"},
        "method":     {"type": "string", "enum": ["pearson", "spearman", "kendall"]},
        "title":      {"type": "string"},
    }, "required": ["session_id"]},
    function=create_correlation_heatmap,
)


# ── Box plot  (column optional — auto-selects first numeric) ──────
def create_box_plot(session_id: str, column: Optional[str] = None,
                    group_by: Optional[str] = None,
                    title: Optional[str] = None) -> Dict[str, Any]:
    df = get_dataframe(session_id)

    # Auto-select if column not provided
    if not column:
        num_cols = df.select_dtypes(include=[np.number]).columns.tolist()
        if not num_cols:
            raise ValueError("No numeric columns found")
        column = num_cols[0]

    if column not in df.columns:
        raise ValueError(f"Column '{column}' not found. Available: {list(df.columns)}")
    if not pd.api.types.is_numeric_dtype(df[column]):
        raise ValueError(f"Column '{column}' must be numeric")

    plt.close('all')
    fig, ax = plt.subplots(figsize=(8, 5))

    bp_kw = dict(
        patch_artist=True,
        boxprops=dict(facecolor='#1A1A1A', color='#00D4FF'),
        medianprops=dict(color='#3FB950', linewidth=2),
        whiskerprops=dict(color='#8C8C8C'),
        capprops=dict(color='#8C8C8C'),
        flierprops=dict(marker='o', markerfacecolor='#F85149', markersize=3, alpha=0.5),
    )

    if group_by and group_by in df.columns:
        groups = df[group_by].dropna().unique()[:12]
        ax.boxplot([df[df[group_by] == g][column].dropna().values for g in groups],
                   labels=[str(g) for g in groups], **bp_kw)
        ax.set_xlabel(group_by, color='#8C8C8C')
        ax.set_xticklabels([str(g) for g in groups], rotation=30, ha='right', color='#8C8C8C')
    else:
        ax.boxplot(df[column].dropna().values, labels=[column], **bp_kw)
        ax.set_xticklabels([column], color='#8C8C8C')

    ax.set_title(title or f'Box Plot – {column}' + (f' by {group_by}' if group_by else ''),
                 color='#F2F2F2', fontsize=13)
    ax.set_ylabel(column, color='#8C8C8C')
    _dark_ax(fig, ax)
    fig.tight_layout()

    col_data = df[column].dropna()
    Q1, Q3 = float(col_data.quantile(0.25)), float(col_data.quantile(0.75))
    IQR = Q3 - Q1
    lb, ub = Q1 - 1.5 * IQR, Q3 + 1.5 * IQR
    n_out = int(((df[column] < lb) | (df[column] > ub)).sum())
    return {
        "chart_type": "box_plot", "column": column, "group_by": group_by,
        "outlier_statistics": {
            "Q1": round(Q1, 4), "Q3": round(Q3, 4), "IQR": round(IQR, 4),
            "lower_bound": round(lb, 4), "upper_bound": round(ub, 4),
            "outlier_count": n_out,
            "outlier_percentage": round(n_out / len(df) * 100, 2),
        },
        "image_base64": _fig_to_b64(),
    }

tool_registry.register(
    name="create_box_plot",
    description="Box plot showing distribution and outliers for a numeric column",
    parameters={"type": "object", "properties": {
        "session_id": {"type": "string"},
        "column":     {"type": "string", "description": "Numeric column (auto-selected if omitted)"},
        "group_by":   {"type": "string", "description": "Optional categorical column to group by"},
        "title":      {"type": "string"},
    }, "required": ["session_id"]},
    function=create_box_plot,
)