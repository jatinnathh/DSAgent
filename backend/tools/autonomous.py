# backend/tools/autonomous.py
"""
Autonomous pipeline orchestrator.
Uses LLM to decide what tools to run, executes them via tool_registry,
and collects all results for PDF report generation.
"""

import time
import json
import httpx
import os
import uuid
import traceback
from typing import Dict, Any, List, Optional
from .registry import tool_registry
from .cleaning import get_dataframe
from .report_generator import generate_report
from .modeling import record_transform_step

HF_ENDPOINT = "https://router.huggingface.co/v1/chat/completions"
MODEL_ID = "Qwen/Qwen3-8B"


def _call_llm(messages: List[Dict], max_tokens: int = 4096) -> str:
    """Call the LLM and return text content."""
    # Read API key at call time, not import time (dotenv may not be loaded yet at import)
    api_key = os.environ.get("HF_API_KEY", "")
    if not api_key:
        print("[autonomous] WARNING: HF_API_KEY not found in environment!")
        return "LLM error: HF_API_KEY not configured"

    processed = []
    for m in messages:
        msg = dict(m)
        if msg.get("role") == "user":
            content = str(msg.get("content", ""))
            if "/no_think" not in content:
                content += " /no_think"
            msg["content"] = content
        processed.append(msg)

    payload = {
        "model": MODEL_ID,
        "messages": processed,
        "max_tokens": max_tokens,
        "temperature": 0.4,
        "stream": False,
    }

    try:
        resp = httpx.post(
            HF_ENDPOINT,
            json=payload,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            timeout=120,
        )
        if resp.status_code != 200:
            print(f"[autonomous] LLM error {resp.status_code}: {resp.text[:200]}")
            return f"LLM error: {resp.status_code}"
        data = resp.json()
        choice = data.get("choices", [{}])[0]
        text = choice.get("message", {}).get("content", "")
        # Strip think tags
        import re
        text = re.sub(r'<think>[\s\S]*?</think>', '', text).strip()
        if not text and choice.get("message", {}).get("reasoning_content"):
            text = choice["message"]["reasoning_content"]
        return text
    except Exception as e:
        print(f"[autonomous] LLM call failed: {e}")
        return f"LLM call failed: {str(e)}"


def _execute_tool(tool_name: str, session_id: str, args: Dict) -> Dict[str, Any]:
    """Execute a tool and return its result as a plain dict."""
    args["session_id"] = session_id
    t0 = time.time()
    
    # Preprocessing tools whose steps should be recorded for transform.py
    _TRANSFORM_TOOLS = {
        "fill_missing_values", "remove_duplicates", "remove_outliers",
        "standard_scaler", "min_max_scaler", "robust_scaler",
        "log_transform", "one_hot_encode", "label_encode",
        "drop_columns", "pca_transform", "polynomial_features",
    }
    
    try:
        tool_result = tool_registry.execute(tool_name, args)
        elapsed = round((time.time() - t0) * 1000)
        # tool_result is a ToolResult pydantic model with .success, .output, .error
        if not tool_result.success:
            return {"success": False, "result": {}, "error": tool_result.error or "Unknown", "image_base64": "", "time_ms": elapsed}
        
        # .output is the actual result dict/value
        output = tool_result.output
        image_b64 = ""
        if isinstance(output, dict):
            image_b64 = output.pop("image_base64", "") or output.pop("chart_base64", "") or ""
        
        result_dict = output if isinstance(output, dict) else {"value": output}
        
        # Record preprocessing steps for transform.py generation
        if tool_name in _TRANSFORM_TOOLS and tool_result.success:
            try:
                record_transform_step(session_id, tool_name, args, result_dict)
            except Exception:
                pass  # Don't fail the pipeline over recording
        
        return {"success": True, "result": result_dict, "image_base64": image_b64, "time_ms": elapsed}
    except Exception as e:
        elapsed = round((time.time() - t0) * 1000)
        return {"success": False, "result": {}, "error": str(e), "image_base64": "", "time_ms": elapsed}


def _build_dataset_summary(session_id: str) -> str:
    """Build a text summary of the dataset for LLM context."""
    df = get_dataframe(session_id)
    numeric = df.select_dtypes(include=["number"]).columns.tolist()
    categorical = df.select_dtypes(include=["object", "category"]).columns.tolist()
    
    summary = f"Dataset: {df.shape[0]} rows, {df.shape[1]} columns\n"
    summary += f"Numeric columns ({len(numeric)}): {', '.join(numeric[:20])}\n"
    summary += f"Categorical columns ({len(categorical)}): {', '.join(categorical[:20])}\n"
    summary += f"Missing values: {df.isnull().sum().sum()} total\n"
    
    # Sample stats
    if numeric:
        summary += "\nSample statistics:\n"
        for col in numeric[:5]:
            summary += f"  {col}: mean={df[col].mean():.2f}, std={df[col].std():.2f}, range=[{df[col].min():.2f}, {df[col].max():.2f}]\n"
    
    return summary


def run_autonomous_pipeline(
    session_id: str,
    dataset_name: str = "dataset",
    progress_callback=None,
) -> Dict[str, Any]:
    """
    Run the full autonomous pipeline.
    
    Args:
        session_id: Session ID with loaded dataset
        dataset_name: Name of the dataset file
        progress_callback: Optional callable(phase, step, message) for real-time updates
    
    Returns:
        Dict with all phase results, report_id, and report_path
    """
    pipeline_start = time.time()
    results = {"phases": {}, "total_time_ms": 0, "conclusion": "", "report_id": "", "report_path": ""}
    
    def _progress(phase: str, step: str, msg: str):
        if progress_callback:
            try:
                progress_callback(phase, step, msg)
            except Exception:
                pass

    # ═══════════════ PHASE 1: EDA ═══════════════
    _progress("eda", "start", "Starting Exploratory Data Analysis…")
    eda_phase = {"steps": [], "llm_explanation": ""}

    eda_tools = [
        ("dataset_overview", {}, "Dataset Overview"),
        ("detect_missing_values", {}, "Missing Values Detection"),
        ("data_quality_report", {}, "Data Quality Report"),
        ("correlation_analysis", {}, "Correlation Analysis"),
    ]

    for tool_name, args, label in eda_tools:
        _progress("eda", tool_name, f"Running {label}…")
        result = _execute_tool(tool_name, session_id, args)
        eda_phase["steps"].append({
            "tool": tool_name, "label": label,
            "result": result.get("result", {}),
            "image_base64": result.get("image_base64", ""),
            "success": result.get("success", False),
            "time_ms": result.get("time_ms", 0),
        })

    # Get LLM explanation of EDA findings
    dataset_summary = _build_dataset_summary(session_id)
    eda_results_text = json.dumps(
        {s["tool"]: s["result"] for s in eda_phase["steps"] if s["success"]},
        indent=2, default=str
    )[:6000]

    eda_llm_prompt = f"""You are a data scientist. Analyze these EDA results and provide:
1. Key insights about the dataset
2. Data quality issues found
3. Which columns look most interesting/useful
4. What the likely target variable is (for ML)

Dataset summary: {dataset_summary}

EDA Results: {eda_results_text}

Respond with a clear, structured analysis. Be specific about column names."""

    _progress("eda", "llm_analysis", "AI analyzing EDA results…")
    eda_explanation = _call_llm([
        {"role": "system", "content": "You are DSAgent, an expert data scientist. Provide concise, actionable insights."},
        {"role": "user", "content": eda_llm_prompt},
    ])
    eda_phase["llm_explanation"] = eda_explanation
    results["phases"]["eda"] = eda_phase

    # ═══════════════ PHASE 2: LLM DECIDES CLEANING PLAN ═══════════════
    _progress("cleaning", "planning", "AI planning data cleaning…")

    df = get_dataframe(session_id)
    numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
    categorical_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()

    cleaning_prompt = f"""Based on the EDA results, decide what cleaning steps are needed.
    
Dataset: {dataset_summary}
EDA Analysis: {eda_explanation[:2000]}

Available cleaning tools:
- fill_missing_values(column, strategy="mean"|"median"|"mode"|"drop")
- remove_duplicates()
- detect_outliers(column)
- remove_outliers(column, method="iqr"|"zscore")

Return a JSON array of tool calls. Example:
[{{"tool": "fill_missing_values", "args": {{"column": "age", "strategy": "median"}}, "reason": "Age has 15% missing"}},
 {{"tool": "remove_duplicates", "args": {{}}, "reason": "Found 23 duplicate rows"}}]

Only suggest tools that are actually needed based on the data. Return [] if data is clean.
Return ONLY valid JSON array, no markdown."""

    cleaning_plan_text = _call_llm([
        {"role": "system", "content": "Return ONLY a valid JSON array. No markdown, no prose."},
        {"role": "user", "content": cleaning_prompt},
    ])

    clean_phase = {"steps": [], "llm_explanation": ""}
    try:
        import re
        match = re.search(r'\[[\s\S]*\]', cleaning_plan_text)
        cleaning_plan = json.loads(match.group(0)) if match else []
    except Exception:
        cleaning_plan = []

    # ═══════════════ PHASE 3: EXECUTE CLEANING ═══════════════
    for step in cleaning_plan[:8]:
        tool_name = step.get("tool", "")
        tool_args = step.get("args", {})
        reason = step.get("reason", "")
        _progress("cleaning", tool_name, f"Cleaning: {reason}")
        result = _execute_tool(tool_name, session_id, tool_args)
        clean_phase["steps"].append({
            "tool": tool_name, "label": reason or tool_name,
            "result": result.get("result", {}),
            "image_base64": result.get("image_base64", ""),
            "success": result.get("success", False),
            "time_ms": result.get("time_ms", 0),
        })

    clean_phase["llm_explanation"] = f"Applied {len(clean_phase['steps'])} cleaning operations based on data quality analysis."
    results["phases"]["cleaning"] = clean_phase

    # ═══════════════ PHASE 4: VISUALIZATION ═══════════════
    _progress("visualization", "planning", "AI planning visualizations…")
    
    # Refresh column lists after cleaning
    df = get_dataframe(session_id)
    numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
    categorical_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()

    viz_prompt = f"""Create a visualization plan for this dataset.
    
Numeric columns: {', '.join(numeric_cols[:15])}
Categorical columns: {', '.join(categorical_cols[:10])}

Available tools:
- create_histogram(column) - for numeric distributions
- create_bar_chart(column) - for categorical counts
- create_scatter_plot(x_column, y_column) - for relationships
- create_correlation_heatmap() - correlation matrix
- create_box_plot(column) - for outlier detection

Pick 4-6 visualizations that would give the best insights. 
Return ONLY a JSON array:
[{{"tool": "create_histogram", "args": {{"column": "price"}}, "reason": "See price distribution"}},
 {{"tool": "create_correlation_heatmap", "args": {{}}, "reason": "Find feature correlations"}}]"""

    viz_plan_text = _call_llm([
        {"role": "system", "content": "Return ONLY a valid JSON array. No markdown."},
        {"role": "user", "content": viz_prompt},
    ])

    viz_phase = {"steps": [], "llm_explanation": ""}
    try:
        import re
        match = re.search(r'\[[\s\S]*\]', viz_plan_text)
        viz_plan = json.loads(match.group(0)) if match else []
    except Exception:
        viz_plan = [
            {"tool": "create_correlation_heatmap", "args": {}, "reason": "Correlation matrix"},
        ]
        if numeric_cols:
            viz_plan.append({"tool": "create_histogram", "args": {"column": numeric_cols[0]}, "reason": f"Distribution of {numeric_cols[0]}"})
        if len(numeric_cols) >= 2:
            viz_plan.append({"tool": "create_scatter_plot", "args": {"x_column": numeric_cols[0], "y_column": numeric_cols[1]}, "reason": f"Relationship between {numeric_cols[0]} and {numeric_cols[1]}"})
        if categorical_cols:
            viz_plan.append({"tool": "create_bar_chart", "args": {"column": categorical_cols[0]}, "reason": f"Categories in {categorical_cols[0]}"})

    for step in viz_plan[:6]:
        tool_name = step.get("tool", "")
        tool_args = step.get("args", {})
        reason = step.get("reason", tool_name)
        _progress("visualization", tool_name, f"Creating: {reason}")
        result = _execute_tool(tool_name, session_id, tool_args)
        viz_phase["steps"].append({
            "tool": tool_name, "label": reason,
            "result": result.get("result", {}),
            "image_base64": result.get("image_base64", ""),
            "inference": reason,
            "success": result.get("success", False),
            "time_ms": result.get("time_ms", 0),
        })

    # Get LLM to interpret visualizations
    viz_results_summary = [{"tool": s["tool"], "label": s["label"], "success": s["success"]} for s in viz_phase["steps"]]
    viz_interp_prompt = f"""These visualizations were created for the dataset:
{json.dumps(viz_results_summary, indent=2)}

Dataset context: {dataset_summary[:1000]}

Provide brief insights about what each visualization likely reveals about the data."""

    viz_explanation = _call_llm([
        {"role": "system", "content": "You are a data scientist interpreting visualizations. Be specific and concise."},
        {"role": "user", "content": viz_interp_prompt},
    ])
    viz_phase["llm_explanation"] = viz_explanation
    results["phases"]["visualization"] = viz_phase

    # ═══════════════ PHASE 5: FEATURE ENGINEERING ═══════════════
    _progress("feature_engineering", "planning", "AI planning feature engineering…")

    feat_prompt = f"""Plan feature engineering for ML modeling.

Numeric columns: {', '.join(numeric_cols[:15])}
Categorical columns: {', '.join(categorical_cols[:10])}
EDA insights: {eda_explanation[:1000]}

Available tools:
- one_hot_encode(columns_to_encode="col1,col2") - for categoricals
- label_encode(column) - ordinal encoding
- standard_scaler(columns_to_scale="") - Z-score normalization
- log_transform(column) - reduce skew

IMPORTANT: Only encode categoricals if they exist. Only scale if numeric columns exist.
Return ONLY a JSON array of needed operations:
[{{"tool": "one_hot_encode", "args": {{"columns_to_encode": "gender,city"}}, "reason": "Encode categoricals for ML"}}]
Return [] if no engineering is needed."""

    feat_plan_text = _call_llm([
        {"role": "system", "content": "Return ONLY a valid JSON array. No markdown."},
        {"role": "user", "content": feat_prompt},
    ])

    feat_phase = {"steps": [], "llm_explanation": ""}
    try:
        import re
        match = re.search(r'\[[\s\S]*\]', feat_plan_text)
        feat_plan = json.loads(match.group(0)) if match else []
    except Exception:
        feat_plan = []

    for step in feat_plan[:5]:
        tool_name = step.get("tool", "")
        tool_args = step.get("args", {})
        reason = step.get("reason", tool_name)
        _progress("feature_engineering", tool_name, f"Engineering: {reason}")
        result = _execute_tool(tool_name, session_id, tool_args)
        feat_phase["steps"].append({
            "tool": tool_name, "label": reason,
            "result": result.get("result", {}),
            "image_base64": result.get("image_base64", ""),
            "success": result.get("success", False),
            "time_ms": result.get("time_ms", 0),
        })

    feat_phase["llm_explanation"] = f"Applied {len(feat_phase['steps'])} feature engineering steps."
    results["phases"]["feature_engineering"] = feat_phase

    # ═══════════════ PHASE 6: MODELING ═══════════════
    _progress("modeling", "target_detection", "AI detecting target column…")

    # Ask LLM to pick target column
    df = get_dataframe(session_id)
    all_cols = df.columns.tolist()
    target_prompt = f"""Which column is the target variable for ML prediction?
    
Columns: {', '.join(all_cols[:30])}
EDA insights: {eda_explanation[:500]}

Common target names: price, target, label, class, survived, churn, outcome, y, salary, revenue

Return ONLY the column name as plain text, nothing else."""

    target_col = _call_llm([
        {"role": "system", "content": "Return ONLY the column name. No explanation."},
        {"role": "user", "content": target_prompt},
    ]).strip().strip('"\'`')

    # Validate target column
    if target_col not in all_cols:
        # Fuzzy match
        target_col_lower = target_col.lower()
        matched = [c for c in all_cols if c.lower() == target_col_lower]
        if matched:
            target_col = matched[0]
        else:
            # Fall back to last numeric column
            num_cols_current = df.select_dtypes(include=["number"]).columns.tolist()
            target_col = num_cols_current[-1] if num_cols_current else all_cols[-1]

    _progress("modeling", "auto_ml", f"Training models with target: {target_col}…")
    model_phase = {"steps": [], "llm_explanation": ""}

    # Run AutoML
    automl_result = _execute_tool("auto_ml_pipeline", session_id, {"target_column": target_col})
    model_phase["steps"].append({
        "tool": "auto_ml_pipeline", "label": f"AutoML Pipeline (target: {target_col})",
        "result": automl_result.get("result", {}),
        "image_base64": automl_result.get("image_base64", ""),
        "success": automl_result.get("success", False),
        "time_ms": automl_result.get("time_ms", 0),
    })

    # Feature importance
    _progress("modeling", "feature_importance", "Computing feature importance…")
    fi_result = _execute_tool("feature_importance", session_id, {"target_column": target_col})
    model_phase["steps"].append({
        "tool": "feature_importance", "label": "Feature Importance Analysis",
        "result": fi_result.get("result", {}),
        "image_base64": fi_result.get("image_base64", ""),
        "success": fi_result.get("success", False),
        "time_ms": fi_result.get("time_ms", 0),
    })

    # LLM explains model choice
    automl_data = automl_result.get("result", {})
    model_explain_prompt = f"""Explain the model training results:
Best model: {automl_data.get('best_model', 'unknown')}
Best score: {automl_data.get('best_score', 0)}
Problem type: {automl_data.get('problem_type', 'unknown')}
Target: {target_col}
Models tried: {list(automl_data.get('results', {}).keys())}

Explain why the best model likely performed well, and what the metrics mean."""

    model_explanation = _call_llm([
        {"role": "system", "content": "You are a data scientist explaining ML results to a stakeholder. Be clear and specific."},
        {"role": "user", "content": model_explain_prompt},
    ])
    model_phase["llm_explanation"] = model_explanation
    results["phases"]["modeling"] = model_phase

    # ═══════════════ PHASE 7: EVALUATION ═══════════════
    _progress("evaluation", "model_evaluation", "Evaluating best model…")
    eval_phase = {"steps": [], "llm_explanation": ""}

    eval_result = _execute_tool("model_evaluation", session_id, {"target_column": target_col})
    eval_phase["steps"].append({
        "tool": "model_evaluation", "label": "Model Evaluation Metrics",
        "result": eval_result.get("result", {}),
        "image_base64": eval_result.get("image_base64", ""),
        "success": eval_result.get("success", False),
        "time_ms": eval_result.get("time_ms", 0),
    })

    eval_phase["llm_explanation"] = "Model evaluated with full metrics and diagnostic plots."
    results["phases"]["evaluation"] = eval_phase

    # ═══════════════ GENERATE CONCLUSION ═══════════════
    _progress("report", "conclusion", "AI generating conclusions…")

    conclusion_prompt = f"""Write a conclusion for this data science pipeline report.

Dataset: {dataset_name} ({df.shape[0]} rows, {df.shape[1]} cols)
Target: {target_col}
Best model: {automl_data.get('best_model', 'unknown')} (score: {automl_data.get('best_score', 0)})
Cleaning steps: {len(clean_phase['steps'])}
Visualizations: {len(viz_phase['steps'])}
Feature engineering: {len(feat_phase['steps'])}

EDA insights: {eda_explanation[:500]}
Model explanation: {model_explanation[:500]}

Write 3-4 paragraphs covering: key findings, model performance, recommendations for improvement."""

    conclusion = _call_llm([
        {"role": "system", "content": "Write a professional, specific conclusion for a data science report."},
        {"role": "user", "content": conclusion_prompt},
    ])
    results["conclusion"] = conclusion

    # ═══════════════ GENERATE PDF ═══════════════
    _progress("report", "pdf_generation", "Generating PDF report…")

    report_id = str(uuid.uuid4())[:12]
    total_time = round((time.time() - pipeline_start) * 1000)
    results["total_time_ms"] = total_time

    try:
        report_path = generate_report(report_id, dataset_name, session_id, results)
        results["report_id"] = report_id
        results["report_path"] = report_path
        _progress("report", "complete", f"Report generated: {report_id}")
    except Exception as e:
        results["report_id"] = report_id
        results["report_path"] = ""
        results["report_error"] = str(e)
        _progress("report", "error", f"Report generation failed: {str(e)}")

    return results
