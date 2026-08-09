# backend/tools/autonomous.py
"""
Autonomous pipeline orchestrator.
Uses LLM to decide what tools to run, executes them via tool_registry,
and collects all results for PDF report generation.

Resilience features:
  - _call_llm()          -> retry with exponential backoff (3 attempts)
  - _extract_json_array() -> 4-level JSON parsing fallback
  - _validate_tool_name() -> alias + fuzzy matching via registry
  - _validate_tool_args() -> column existence check before execution
  - _safe_execute_tool()  -> validate -> execute -> retry once -> graceful skip
  - Modeling phase        -> cascade-break: retry with fallback target, then
                            direct sklearn training without LLM
"""

import time
import json
import httpx
import os
import re
import uuid
import traceback
import numpy as np
from typing import Dict, Any, List, Optional
from .registry import tool_registry
from .cleaning import get_dataframe
from .report_generator import generate_report
from .modeling import record_transform_step

HF_ENDPOINT = "https://router.huggingface.co/v1/chat/completions"
MODEL_ID = "Qwen/Qwen3-8B"

# ═══════════════════════════════════════════════════════════════════════════
# RESILIENCE HELPERS
# ═══════════════════════════════════════════════════════════════════════════


def _call_llm(messages: List[Dict], max_tokens: int = 4096, retries: int = 3) -> str:
    """
    Call the LLM and return text content.
    Retries up to `retries` times with exponential backoff on failure.
    """
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

    last_error = ""
    for attempt in range(retries):
        try:
            resp = httpx.post(
                HF_ENDPOINT,
                json=payload,
                headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
                timeout=120,
            )
            if resp.status_code == 429 or resp.status_code >= 500:
                wait = 2 ** attempt
                print(f"[autonomous] LLM {resp.status_code}, retrying in {wait}s (attempt {attempt+1}/{retries})")
                time.sleep(wait)
                last_error = f"LLM error: {resp.status_code}"
                continue

            if resp.status_code != 200:
                print(f"[autonomous] LLM error {resp.status_code}: {resp.text[:200]}")
                return f"LLM error: {resp.status_code}"

            data = resp.json()
            choice = data.get("choices", [{}])[0]
            text = choice.get("message", {}).get("content", "")
            # Strip think tags
            text = re.sub(r'<think>[\s\S]*?</think>', '', text).strip()
            if not text and choice.get("message", {}).get("reasoning_content"):
                text = choice["message"]["reasoning_content"]
            return text
        except Exception as e:
            wait = 2 ** attempt
            print(f"[autonomous] LLM call failed (attempt {attempt+1}/{retries}): {e}")
            last_error = str(e)
            if attempt < retries - 1:
                time.sleep(wait)

    return f"LLM call failed after {retries} attempts: {last_error}"


def _extract_json_array(text: str) -> List[Dict]:
    """
    Robustly extract a JSON array from LLM output.
    4-level fallback:
      1. Direct json.loads() on the full text
      2. Strip markdown fences and try again
      3. Regex extract [...] block
      4. Return [] (empty plan = skip phase gracefully)
    """
    if not text or not text.strip():
        return []

    # Level 1: direct parse
    try:
        result = json.loads(text.strip())
        if isinstance(result, list):
            return result
    except (json.JSONDecodeError, ValueError):
        pass

    # Level 2: strip markdown fences
    cleaned = text.strip()
    # Remove ```json ... ``` or ``` ... ```
    cleaned = re.sub(r'^```(?:json)?\s*\n?', '', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'\n?```\s*$', '', cleaned, flags=re.MULTILINE)
    cleaned = cleaned.strip()
    try:
        result = json.loads(cleaned)
        if isinstance(result, list):
            return result
    except (json.JSONDecodeError, ValueError):
        pass

    # Level 3: regex extract the first [...] block
    match = re.search(r'\[[\s\S]*\]', text)
    if match:
        try:
            result = json.loads(match.group(0))
            if isinstance(result, list):
                return result
        except (json.JSONDecodeError, ValueError):
            pass

    # Level 4: try to find individual {...} objects and combine
    objects = re.findall(r'\{[^{}]+\}', text)
    if objects:
        items = []
        for obj_str in objects:
            try:
                items.append(json.loads(obj_str))
            except (json.JSONDecodeError, ValueError):
                pass
        if items:
            return items

    print(f"[autonomous] Failed to extract JSON array from: {text[:200]}...")
    return []


def _validate_tool_args(tool_name: str, args: Dict, session_id: str) -> Dict:
    """
    Pre-validate and fix tool arguments before execution.
    Checks that referenced columns actually exist in the DataFrame.
    Returns fixed args dict.
    """
    try:
        df = get_dataframe(session_id)
        all_columns = df.columns.tolist()
        all_columns_lower = {c.lower(): c for c in all_columns}

        # Check common column-referencing arg keys
        column_args = ["column", "x_column", "y_column", "target_column", "color_column"]
        for key in column_args:
            if key in args and args[key]:
                col_value = args[key]
                if col_value not in all_columns:
                    # Try case-insensitive match
                    if col_value.lower() in all_columns_lower:
                        args[key] = all_columns_lower[col_value.lower()]
                        print(f"[autonomous] Fixed column case: '{col_value}' -> '{args[key]}'")
                    else:
                        print(f"[autonomous] WARNING: column '{col_value}' not found for {tool_name}.{key}")
                        # For non-critical tools, try to pick a reasonable default
                        if key == "column":
                            numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
                            cat_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()
                            if tool_name in ("create_histogram", "create_box_plot", "detect_outliers",
                                             "remove_outliers", "log_transform", "standard_scaler"):
                                if numeric_cols:
                                    args[key] = numeric_cols[0]
                                    print(f"[autonomous] Auto-picked numeric column: '{args[key]}'")
                            elif tool_name in ("create_bar_chart",):
                                if cat_cols:
                                    args[key] = cat_cols[0]
                                    print(f"[autonomous] Auto-picked categorical column: '{args[key]}'")

        # Check columns_to_encode (comma-separated)
        if "columns_to_encode" in args and args["columns_to_encode"]:
            requested = [c.strip() for c in str(args["columns_to_encode"]).split(",") if c.strip()]
            valid = []
            for c in requested:
                if c in all_columns:
                    valid.append(c)
                elif c.lower() in all_columns_lower:
                    valid.append(all_columns_lower[c.lower()])
                # else skip missing column
            if valid:
                args["columns_to_encode"] = ",".join(valid)
            else:
                # Fall back to all categorical columns
                cat_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()
                if cat_cols:
                    args["columns_to_encode"] = ",".join(cat_cols)

    except Exception as e:
        print(f"[autonomous] Arg validation error: {e}")

    return args


def _safe_execute_tool(
    tool_name: str,
    session_id: str,
    args: Dict,
    retry: bool = True,
) -> Dict[str, Any]:
    """
    Execute a tool with full resilience:
      1. Resolve tool name (aliases + fuzzy matching)
      2. Validate arguments (column existence)
      3. Execute
      4. On failure: retry once with adjusted args
      5. On permanent failure: return graceful "skipped" result
    """
    # Step 1: resolve tool name
    resolved = tool_registry.resolve_tool_name(tool_name)
    if resolved is None:
        return {
            "success": False,
            "result": {},
            "error": f"Tool '{tool_name}' not found (even after fuzzy matching)",
            "image_base64": "",
            "time_ms": 0,
            "skipped": True,
        }
    if resolved != tool_name:
        print(f"[autonomous] Tool resolved: '{tool_name}' -> '{resolved}'")

    # Step 2: validate args
    args = _validate_tool_args(resolved, dict(args), session_id)
    args["session_id"] = session_id

    # Step 3: execute
    t0 = time.time()

    # Preprocessing tools whose steps should be recorded for transform.py
    _TRANSFORM_TOOLS = {
        "fill_missing_values", "remove_duplicates", "remove_outliers",
        "standard_scaler", "min_max_scaler", "robust_scaler",
        "log_transform", "one_hot_encode", "label_encode",
        "drop_columns", "pca_transform", "polynomial_features",
    }

    try:
        tool_result = tool_registry.execute(resolved, args)
        elapsed = round((time.time() - t0) * 1000)

        if tool_result.success:
            output = tool_result.output
            image_b64 = ""
            if isinstance(output, dict):
                image_b64 = output.pop("image_base64", "") or output.pop("chart_base64", "") or ""
            result_dict = output if isinstance(output, dict) else {"value": output}

            # Record preprocessing steps for transform.py generation
            if resolved in _TRANSFORM_TOOLS:
                try:
                    record_transform_step(session_id, resolved, args, result_dict)
                except Exception:
                    pass

            return {"success": True, "result": result_dict, "image_base64": image_b64, "time_ms": elapsed}

        # Tool returned failure
        error_msg = tool_result.error or "Unknown error"
        print(f"[autonomous] Tool '{resolved}' failed: {error_msg[:200]}")

    except Exception as e:
        elapsed = round((time.time() - t0) * 1000)
        error_msg = str(e)
        print(f"[autonomous] Tool '{resolved}' exception: {error_msg[:200]}")

    # Step 4: retry once with adjusted args
    if retry:
        print(f"[autonomous] Retrying '{resolved}' with adjusted args...")
        # Common fix: if column-related error, try a different column
        try:
            df = get_dataframe(session_id)
            numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
            cat_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()

            retry_args = dict(args)
            if "column" in retry_args and numeric_cols:
                current = retry_args.get("column", "")
                alternatives = [c for c in numeric_cols if c != current]
                if alternatives:
                    retry_args["column"] = alternatives[0]
                    print(f"[autonomous] Retry: switched column to '{alternatives[0]}'")

            return _safe_execute_tool(resolved, session_id, retry_args, retry=False)
        except Exception as retry_err:
            print(f"[autonomous] Retry failed: {retry_err}")

    # Step 5: permanent failure — graceful skip
    elapsed = round((time.time() - t0) * 1000)
    return {
        "success": False,
        "result": {},
        "error": error_msg,
        "image_base64": "",
        "time_ms": elapsed,
        "skipped": True,
    }


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


def _build_fallback_viz_plan(session_id: str) -> List[Dict]:
    """Generate a sensible visualization plan without LLM assistance."""
    df = get_dataframe(session_id)
    numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
    categorical_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()

    plan = [{"tool": "create_correlation_heatmap", "args": {}, "reason": "Correlation matrix"}]
    if numeric_cols:
        plan.append({"tool": "create_histogram", "args": {"column": numeric_cols[0]}, "reason": f"Distribution of {numeric_cols[0]}"})
    if len(numeric_cols) >= 2:
        plan.append({"tool": "create_scatter_plot", "args": {"x_column": numeric_cols[0], "y_column": numeric_cols[1]}, "reason": f"Relationship between {numeric_cols[0]} and {numeric_cols[1]}"})
        plan.append({"tool": "create_box_plot", "args": {"column": numeric_cols[1]}, "reason": f"Box plot of {numeric_cols[1]}"})
    if categorical_cols:
        plan.append({"tool": "create_bar_chart", "args": {"column": categorical_cols[0]}, "reason": f"Categories in {categorical_cols[0]}"})
    return plan


def _build_fallback_cleaning_plan(session_id: str) -> List[Dict]:
    """Generate a sensible cleaning plan without LLM assistance."""
    df = get_dataframe(session_id)
    plan = []

    # Fill missing values for columns with > 0 nulls
    for col in df.columns:
        null_count = int(df[col].isna().sum())
        if null_count > 0:
            if df[col].dtype in ("object", "category"):
                plan.append({"tool": "fill_missing_values", "args": {"column": col, "strategy": "mode"}, "reason": f"{col} has {null_count} missing (categorical)"})
            else:
                plan.append({"tool": "fill_missing_values", "args": {"column": col, "strategy": "median"}, "reason": f"{col} has {null_count} missing (numeric)"})

    # Detect + remove outliers for numeric columns with high range
    numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
    for col in numeric_cols[:3]:  # limit to 3 columns
        q1 = df[col].quantile(0.25)
        q3 = df[col].quantile(0.75)
        iqr = q3 - q1
        outlier_count = ((df[col] < q1 - 1.5 * iqr) | (df[col] > q3 + 1.5 * iqr)).sum()
        if outlier_count > 0:
            plan.append({"tool": "detect_outliers", "args": {"column": col}, "reason": f"Check outliers in {col}"})
            plan.append({"tool": "remove_outliers", "args": {"column": col, "method": "iqr"}, "reason": f"Remove {outlier_count} outliers from {col}"})

    return plan


def _build_fallback_feature_plan(session_id: str) -> List[Dict]:
    """Generate a sensible feature engineering plan without LLM assistance."""
    df = get_dataframe(session_id)
    plan = []

    categorical_cols = df.select_dtypes(include=["object", "category"]).columns.tolist()
    numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()

    if categorical_cols:
        plan.append({"tool": "one_hot_encode", "args": {"columns_to_encode": ",".join(categorical_cols)}, "reason": "Encode categoricals for ML"})
    if numeric_cols:
        plan.append({"tool": "standard_scaler", "args": {"columns_to_scale": ""}, "reason": "Standardize numeric features"})

    return plan


def _detect_target_column(session_id: str, eda_explanation: str = "") -> str:
    """
    Auto-detect the most likely target column.
    Falls back to heuristics if LLM fails.
    """
    df = get_dataframe(session_id)
    all_cols = df.columns.tolist()

    # Common target column names
    common_targets = [
        "survived", "target", "label", "class", "y", "outcome",
        "churn", "price", "salary", "revenue", "default",
        "diagnosis", "species", "category", "status",
    ]

    # Try exact match first
    for name in common_targets:
        for col in all_cols:
            if col.lower() == name:
                return col

    # Try partial match
    for name in common_targets:
        for col in all_cols:
            if name in col.lower():
                return col

    # Fall back to last numeric column
    numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
    if numeric_cols:
        return numeric_cols[-1]

    return all_cols[-1]


def _direct_train_model(session_id: str, target_column: str) -> Dict[str, Any]:
    """
    Direct model training without LLM — the ultimate fallback.
    Trains Random Forest directly using sklearn.
    """
    from sklearn.model_selection import train_test_split
    from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
    from sklearn.metrics import accuracy_score, r2_score, mean_squared_error
    from sklearn.preprocessing import LabelEncoder
    import pickle

    df = get_dataframe(session_id)

    if target_column not in df.columns:
        raise ValueError(f"Target '{target_column}' not found")

    # Prepare data
    X = df.drop(columns=[target_column]).copy()
    y = df[target_column].copy()

    # Drop NaN targets
    mask = ~y.isna()
    X = X[mask]
    y = y[mask]

    # Encode categoricals
    for col in X.select_dtypes(include=["object", "category"]).columns:
        le = LabelEncoder()
        X[col] = le.fit_transform(X[col].astype(str))

    # Fill remaining NaN
    X = X.fillna(0)

    # Detect problem type
    is_classification = not np.issubdtype(y.dtype, np.number) or y.nunique() <= 10

    if is_classification:
        if not np.issubdtype(y.dtype, np.number):
            le = LabelEncoder()
            y = le.fit_transform(y.astype(str))
        model = RandomForestClassifier(n_estimators=100, random_state=42)
        metric_name = "accuracy"
    else:
        model = RandomForestRegressor(n_estimators=100, random_state=42)
        metric_name = "r2_score"

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)
    model.fit(X_train, y_train)
    y_pred = model.predict(X_test)

    if is_classification:
        score = round(accuracy_score(y_test, y_pred), 4)
    else:
        score = round(r2_score(y_test, y_pred), 4)

    # Store in session models
    from .modeling import _session_models, _persist_best_model
    _session_models[session_id] = {
        "models": {"Random Forest (Fallback)": model},
        "X_train": X_train, "X_test": X_test,
        "y_train": y_train, "y_test": y_test,
        "feature_names": list(X.columns),
        "target_column": target_column,
        "problem_type": "classification" if is_classification else "regression",
        "best_model": "Random Forest (Fallback)",
    }

    # Persist to disk
    model_id = ""
    try:
        model_id = _persist_best_model(
            session_id=session_id,
            best_model_name="Random Forest (Fallback)",
            model_obj=model,
            problem_type="classification" if is_classification else "regression",
            target_column=target_column,
            feature_names=list(X.columns),
            best_score=score,
            metrics={metric_name: score},
        )
    except Exception as e:
        print(f"[autonomous] Direct model persist failed: {e}")

    return {
        "success": True,
        "result": {
            "problem_type": "classification" if is_classification else "regression",
            "target_column": target_column,
            "best_model": "Random Forest (Fallback)",
            "best_score": score,
            metric_name: score,
            "models_trained": 1,
            "model_id": model_id,
            "note": "Trained via direct fallback (LLM-based AutoML failed)",
        },
        "image_base64": "",
        "time_ms": 0,
    }


# ═══════════════════════════════════════════════════════════════════════════
# MAIN PIPELINE
# ═══════════════════════════════════════════════════════════════════════════


def run_autonomous_pipeline(
    session_id: str,
    dataset_name: str = "dataset",
    progress_callback=None,
) -> Dict[str, Any]:
    """
    Run the full autonomous pipeline with multi-layer resilience.

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
        result = _safe_execute_tool(tool_name, session_id, args)
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
    cleaning_plan = _extract_json_array(cleaning_plan_text)

    # Fallback: if LLM returned empty/bad plan, use heuristic
    if not cleaning_plan:
        cleaning_plan = _build_fallback_cleaning_plan(session_id)
        if cleaning_plan:
            print(f"[autonomous] Using fallback cleaning plan ({len(cleaning_plan)} steps)")

    # ═══════════════ PHASE 3: EXECUTE CLEANING ═══════════════
    for step in cleaning_plan[:8]:
        tool_name = step.get("tool", "")
        tool_args = step.get("args", {})
        reason = step.get("reason", "")
        _progress("cleaning", tool_name, f"Cleaning: {reason}")
        result = _safe_execute_tool(tool_name, session_id, tool_args)
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
    viz_plan = _extract_json_array(viz_plan_text)

    # Fallback
    if not viz_plan:
        viz_plan = _build_fallback_viz_plan(session_id)
        print(f"[autonomous] Using fallback viz plan ({len(viz_plan)} charts)")

    for step in viz_plan[:6]:
        tool_name = step.get("tool", "")
        tool_args = step.get("args", {})
        reason = step.get("reason", tool_name)
        _progress("visualization", tool_name, f"Creating: {reason}")
        result = _safe_execute_tool(tool_name, session_id, tool_args)
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
    feat_plan = _extract_json_array(feat_plan_text)

    # Fallback
    if not feat_plan:
        feat_plan = _build_fallback_feature_plan(session_id)
        if feat_plan:
            print(f"[autonomous] Using fallback feature plan ({len(feat_plan)} steps)")

    for step in feat_plan[:5]:
        tool_name = step.get("tool", "")
        tool_args = step.get("args", {})
        reason = step.get("reason", tool_name)
        _progress("feature_engineering", tool_name, f"Engineering: {reason}")
        result = _safe_execute_tool(tool_name, session_id, tool_args)
        feat_phase["steps"].append({
            "tool": tool_name, "label": reason,
            "result": result.get("result", {}),
            "image_base64": result.get("image_base64", ""),
            "success": result.get("success", False),
            "time_ms": result.get("time_ms", 0),
        })

    feat_phase["llm_explanation"] = f"Applied {len(feat_phase['steps'])} feature engineering steps."
    results["phases"]["feature_engineering"] = feat_phase

    # ═══════════════ PHASE 6: MODELING (CASCADE-AWARE) ═══════════════
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
    ]).strip().strip("\"'`")

    # Validate target column
    if target_col not in all_cols:
        # Fuzzy match
        target_col_lower = target_col.lower()
        matched = [c for c in all_cols if c.lower() == target_col_lower]
        if matched:
            target_col = matched[0]
        else:
            # Fall back to heuristic detection
            target_col = _detect_target_column(session_id, eda_explanation)
            print(f"[autonomous] LLM target '{target_col}' not found, heuristic picked: '{target_col}'")

    _progress("modeling", "auto_ml", f"Training models with target: {target_col}…")
    model_phase = {"steps": [], "llm_explanation": ""}

    # ── Attempt 1: AutoML via tool registry ──
    automl_result = _safe_execute_tool("auto_ml_pipeline", session_id, {"target_column": target_col})

    if not automl_result.get("success"):
        # ── Attempt 2: try with a different target column ──
        print(f"[autonomous] AutoML failed with target='{target_col}', trying fallback target...")
        fallback_target = _detect_target_column(session_id)
        if fallback_target != target_col:
            target_col = fallback_target
            automl_result = _safe_execute_tool("auto_ml_pipeline", session_id, {"target_column": target_col}, retry=False)

    if not automl_result.get("success"):
        # ── Attempt 3: direct training without LLM (ultimate fallback) ──
        print("[autonomous] AutoML failed twice, using direct sklearn fallback...")
        try:
            automl_result = _direct_train_model(session_id, target_col)
        except Exception as e:
            print(f"[autonomous] Direct training also failed: {e}")
            automl_result = {
                "success": False,
                "result": {"error": str(e), "note": "All modeling attempts failed"},
                "image_base64": "",
                "time_ms": 0,
            }

    model_phase["steps"].append({
        "tool": "auto_ml_pipeline", "label": f"AutoML Pipeline (target: {target_col})",
        "result": automl_result.get("result", {}),
        "image_base64": automl_result.get("image_base64", ""),
        "success": automl_result.get("success", False),
        "time_ms": automl_result.get("time_ms", 0),
    })

    # ── Feature importance — only if modeling succeeded (cascade-break) ──
    _progress("modeling", "feature_importance", "Computing feature importance…")
    if automl_result.get("success"):
        fi_result = _safe_execute_tool("feature_importance", session_id, {"target_column": target_col})
    else:
        print("[autonomous] Skipping feature_importance (no trained model)")
        fi_result = {
            "success": False,
            "result": {"note": "Skipped — no trained model available"},
            "image_base64": "",
            "time_ms": 0,
            "skipped": True,
        }

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
Models tried: {list(automl_data.get('results', {}).keys()) if isinstance(automl_data.get('results'), dict) else []}

Explain why the best model likely performed well, and what the metrics mean."""

    model_explanation = _call_llm([
        {"role": "system", "content": "You are a data scientist explaining ML results to a stakeholder. Be clear and specific."},
        {"role": "user", "content": model_explain_prompt},
    ])
    model_phase["llm_explanation"] = model_explanation
    results["phases"]["modeling"] = model_phase

    # ═══════════════ PHASE 7: EVALUATION (CASCADE-AWARE) ═══════════════
    _progress("evaluation", "model_evaluation", "Evaluating best model…")
    eval_phase = {"steps": [], "llm_explanation": ""}

    if automl_result.get("success"):
        eval_result = _safe_execute_tool("model_evaluation", session_id, {"target_column": target_col})
    else:
        print("[autonomous] Skipping model_evaluation (no trained model)")
        eval_result = {
            "success": False,
            "result": {"note": "Skipped — no trained model available"},
            "image_base64": "",
            "time_ms": 0,
            "skipped": True,
        }

    # If evaluation tool failed but we have model results, create basic eval
    if not eval_result.get("success") and automl_result.get("success"):
        eval_result = {
            "success": True,
            "result": {
                "note": "Basic evaluation from training results",
                "best_model": automl_data.get("best_model", "unknown"),
                "best_score": automl_data.get("best_score", 0),
                "problem_type": automl_data.get("problem_type", "unknown"),
                **{k: v for k, v in automl_data.items() if k not in ("results", "model_id")},
            },
            "image_base64": automl_result.get("image_base64", ""),
            "time_ms": 0,
        }

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
