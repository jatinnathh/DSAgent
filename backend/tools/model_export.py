# backend/tools/model_export.py
"""
Generate standalone transform.py and create downloadable .zip model bundles.
Each bundle contains:
  - model.pkl          — serialized best model
  - transform.py       — standalone prediction script (CLI + import)
  - README.md          — usage instructions
"""

import os
import json
import zipfile
import io
import textwrap
from typing import Dict, Any, List, Optional

MODELS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models")


def list_saved_models() -> List[Dict[str, Any]]:
    """List all saved model metadata files."""
    models = []
    if not os.path.isdir(MODELS_DIR):
        return models
    for fname in os.listdir(MODELS_DIR):
        if fname.endswith("_meta.json"):
            try:
                with open(os.path.join(MODELS_DIR, fname), "r") as f:
                    meta = json.load(f)
                models.append(meta)
            except Exception:
                continue
    # Sort by creation date descending
    models.sort(key=lambda m: m.get("created_at", ""), reverse=True)
    return models


def get_model_meta(model_id: str) -> Optional[Dict[str, Any]]:
    """Get metadata for a specific model."""
    meta_path = os.path.join(MODELS_DIR, f"{model_id}_meta.json")
    if not os.path.exists(meta_path):
        return None
    with open(meta_path, "r") as f:
        return json.load(f)


def delete_model(model_id: str) -> bool:
    """Delete a model and its metadata from disk."""
    pkl_path = os.path.join(MODELS_DIR, f"{model_id}.pkl")
    meta_path = os.path.join(MODELS_DIR, f"{model_id}_meta.json")
    deleted = False
    for path in [pkl_path, meta_path]:
        if os.path.exists(path):
            os.remove(path)
            deleted = True
    return deleted


def _generate_transform_py(meta: Dict[str, Any]) -> str:
    """Generate a standalone transform.py script from model metadata."""
    model_id = meta["model_id"]
    pipeline_id = meta.get("pipeline_id", "unknown")
    model_name = meta.get("model_name", "unknown")
    problem_type = meta.get("problem_type", "classification")
    target_column = meta.get("target_column", "target")
    feature_names = meta.get("feature_names", [])
    transform_steps = meta.get("transform_steps", [])
    created_at = meta.get("created_at", "unknown")

    # Build transformation code from recorded steps
    transform_code_lines = []
    for i, step in enumerate(transform_steps):
        tool = step.get("tool", "")
        args = step.get("args", {})
        result = step.get("result_summary", {})

        if tool == "label_encode":
            col = args.get("column", "")
            mapping = result.get("mapping_sample", {})
            if col and mapping:
                transform_code_lines.append(f"    # Step {i+1}: Label encode '{col}'")
                transform_code_lines.append(f"    {col.upper()}_MAPPING = {repr(mapping)}")
                transform_code_lines.append(f"    if \"{col}\" in df.columns:")
                transform_code_lines.append(f"        df[\"{col}\"] = df[\"{col}\"].astype(str).map({col.upper()}_MAPPING).fillna(0).astype(int)")

        elif tool == "one_hot_encode":
            cols_str = args.get("columns_to_encode", "")
            drop_first = args.get("drop_first", "true")
            if cols_str:
                cols = [c.strip() for c in cols_str.split(",") if c.strip()]
                transform_code_lines.append(f"    # Step {i+1}: One-hot encode {cols}")
                for col in cols:
                    transform_code_lines.append(f"    if \"{col}\" in df.columns:")
                    transform_code_lines.append(f"        dummies = pd.get_dummies(df[\"{col}\"], prefix=\"{col}\", drop_first={'True' if drop_first == 'true' else 'False'}, dtype=float)")
                    transform_code_lines.append(f"        df = pd.concat([df.drop(columns=[\"{col}\"]), dummies], axis=1)")

        elif tool == "standard_scaler":
            cols_str = args.get("columns_to_scale", "")
            before = result.get("before", {})
            if before:
                transform_code_lines.append(f"    # Step {i+1}: Standard scaling (Z-score)")
                transform_code_lines.append(f"    _SCALE_STATS = {repr(before)}")
                transform_code_lines.append(f"    for _col, _stats in _SCALE_STATS.items():")
                transform_code_lines.append(f"        if _col in df.columns and _stats['std'] != 0:")
                transform_code_lines.append(f"            df[_col] = (df[_col] - _stats['mean']) / _stats['std']")

        elif tool == "min_max_scaler":
            transform_code_lines.append(f"    # Step {i+1}: MinMax scaling (values before transform needed)")
            transform_code_lines.append(f"    # Note: MinMax params not fully captured — raw values passed through")

        elif tool == "robust_scaler":
            transform_code_lines.append(f"    # Step {i+1}: Robust scaling (median/IQR)")
            transform_code_lines.append(f"    # Note: Robust scaler params not fully captured — raw values passed through")

        elif tool == "log_transform":
            col = args.get("column", "")
            if col:
                transform_code_lines.append(f"    # Step {i+1}: Log transform '{col}'")
                transform_code_lines.append(f"    if \"{col}\" in df.columns:")
                transform_code_lines.append(f"        df[\"{col}\"] = np.log1p(df[\"{col}\"])")

        elif tool == "fill_missing_values":
            col = args.get("column", "")
            strategy = args.get("strategy", "mean")
            fill_val = result.get("fill_value")
            if col and fill_val is not None:
                transform_code_lines.append(f"    # Step {i+1}: Fill missing in '{col}' with {strategy} ({fill_val})")
                transform_code_lines.append(f"    if \"{col}\" in df.columns:")
                transform_code_lines.append(f"        df[\"{col}\"] = df[\"{col}\"].fillna({repr(fill_val)})")

        elif tool == "drop_columns":
            col = args.get("column", "")
            if col:
                transform_code_lines.append(f"    # Step {i+1}: Drop column '{col}'")
                transform_code_lines.append(f"    if \"{col}\" in df.columns:")
                transform_code_lines.append(f"        df = df.drop(columns=[\"{col}\"])")

        elif tool == "remove_duplicates":
            transform_code_lines.append(f"    # Step {i+1}: Remove duplicates (no-op for single-row prediction)")

        elif tool in ("detect_outliers", "remove_outliers"):
            transform_code_lines.append(f"    # Step {i+1}: {tool} — skipped for prediction (training-only step)")

    if not transform_code_lines:
        transform_code_lines.append("    # No preprocessing steps recorded — data passed through as-is")

    transform_body = "\n".join(transform_code_lines)

    script = textwrap.dedent(f'''\
#!/usr/bin/env python3
"""
DSAgent Model Transform Pipeline
=================================
Pipeline ID : {pipeline_id}
Model ID    : {model_id}
Model       : {model_name}
Target      : {target_column} ({problem_type})
Generated   : {created_at}

Usage (CLI):
    python transform.py --feature1 value1 --feature2 value2

Usage (code):
    from transform import predict
    result = predict({{"feature1": value1, "feature2": value2}})
"""

import pickle
import numpy as np
import pandas as pd
import sys
import os
import argparse

# ── Configuration ──
FEATURE_NAMES = {repr(feature_names)}
TARGET_COLUMN = {repr(target_column)}
PROBLEM_TYPE = {repr(problem_type)}
MODEL_ID = {repr(model_id)}
PIPELINE_ID = {repr(pipeline_id)}


def transform(input_dict: dict) -> pd.DataFrame:
    """
    Apply all preprocessing transformations that were used during training.
    Pass a dictionary of raw feature values and get a model-ready DataFrame.
    """
    df = pd.DataFrame([input_dict])

    # ── Recorded pipeline transformations ──
{transform_body}

    # ── Ensure correct column order ──
    for col in FEATURE_NAMES:
        if col not in df.columns:
            df[col] = 0
    # Keep only the features the model expects
    available = [c for c in FEATURE_NAMES if c in df.columns]
    df = df[available]
    return df


def predict(input_dict: dict) -> dict:
    """
    Transform input and make a prediction.

    Returns:
        dict with 'prediction' key and optionally 'probabilities'
    """
    model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "model.pkl")
    if not os.path.exists(model_path):
        raise FileNotFoundError(
            f"model.pkl not found at {{model_path}}. "
            "Make sure model.pkl is in the same directory as transform.py"
        )

    with open(model_path, "rb") as f:
        model = pickle.load(f)

    df = transform(input_dict)
    prediction = model.predict(df)[0]

    result = {{
        "model_id": MODEL_ID,
        "pipeline_id": PIPELINE_ID,
        "model": {repr(model_name)},
        "problem_type": PROBLEM_TYPE,
        "target": TARGET_COLUMN,
    }}

    if PROBLEM_TYPE == "regression":
        result["prediction"] = float(prediction)
    else:
        result["prediction"] = str(prediction)
        if hasattr(model, "predict_proba"):
            proba = model.predict_proba(df)[0]
            classes = model.classes_
            result["probabilities"] = {{
                str(cls): round(float(p), 4)
                for cls, p in zip(classes, proba)
            }}
            result["confidence"] = round(float(max(proba)), 4)

    return result


def _parse_value(v: str):
    """Try to convert CLI string to float, else keep as string."""
    try:
        return float(v)
    except ValueError:
        return v


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="DSAgent Model Prediction — {model_name} ({problem_type})",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python transform.py """ + " ".join([f'--{{feat}} <value>' for feat in {repr(feature_names[:3])}]) + """

This script applies the same transformations used during training
and predicts using the saved model.
        """,
    )

    for feat in FEATURE_NAMES:
        parser.add_argument(f"--{{feat}}", required=True, help=f"Value for {{feat}}")

    args = parser.parse_args()
    input_data = {{k: _parse_value(v) for k, v in vars(args).items()}}

    result = predict(input_data)
    print()
    print("=" * 50)
    print(f"  DSAgent Prediction Result")
    print("=" * 50)
    print(f"  Model    : {model_name}")
    print(f"  Target   : {target_column}")
    print(f"  Type     : {problem_type}")
    print(f"  Prediction: {{result['prediction']}}")
    if "confidence" in result:
        print(f"  Confidence: {{result['confidence']:.1%}}")
    if "probabilities" in result:
        print(f"  Probabilities:")
        for cls, prob in result["probabilities"].items():
            bar = "█" * int(prob * 30)
            print(f"    {{cls:>12}}: {{prob:.4f}} {{bar}}")
    print("=" * 50)
''')
    return script


def _generate_readme(meta: Dict[str, Any]) -> str:
    """Generate a README.md for the model bundle."""
    model_name = meta.get("model_name", "Unknown")
    problem_type = meta.get("problem_type", "unknown")
    target = meta.get("target_column", "target")
    features = meta.get("feature_names", [])
    score = meta.get("best_score", 0)
    model_id = meta.get("model_id", "")
    pipeline_id = meta.get("pipeline_id", "")
    created = meta.get("created_at", "")
    metrics = meta.get("metrics", {})

    metric_lines = "\n".join([f"- **{k}**: {v}" for k, v in metrics.items()])
    feature_list = "\n".join([f"- `{f}`" for f in features[:20]])
    if len(features) > 20:
        feature_list += f"\n- ... and {len(features) - 20} more"

    return textwrap.dedent(f"""\
# DSAgent Model Bundle

## Model Info
| Field | Value |
|-------|-------|
| Model | {model_name} |
| Type | {problem_type} |
| Target | `{target}` |
| Best Score | {score} |
| Model ID | `{model_id}` |
| Pipeline ID | `{pipeline_id}` |
| Created | {created} |

## Metrics
{metric_lines}

## Features ({len(features)})
{feature_list}

## Usage

### Command Line
```bash
python transform.py {' '.join([f'--{f} <value>' for f in features[:3]])}
```

### Python Import
```python
from transform import predict

result = predict({{
{chr(10).join([f'    "{f}": <value>,' for f in features[:5]])}
}})

print(result["prediction"])
```

### Requirements
- Python 3.8+
- numpy
- pandas
- scikit-learn
- xgboost (if XGBoost model)
- lightgbm (if LightGBM model)

Install: `pip install numpy pandas scikit-learn xgboost lightgbm`

## Files
- `model.pkl` — Serialized trained model
- `transform.py` — Standalone prediction script
- `README.md` — This file

---
*Generated by [DSAgent](https://github.com/jatinnathh/DSAgent)*
""")


def create_model_bundle(model_id: str) -> Optional[bytes]:
    """
    Create a .zip bundle containing model.pkl, transform.py, and README.md.
    Returns zip bytes or None if model not found.
    """
    meta = get_model_meta(model_id)
    if meta is None:
        return None

    pkl_path = os.path.join(MODELS_DIR, meta.get("pkl_filename", f"{model_id}.pkl"))
    if not os.path.exists(pkl_path):
        return None

    # Generate transform.py
    transform_script = _generate_transform_py(meta)

    # Generate README
    readme = _generate_readme(meta)

    # Create zip in memory
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # Add model pickle as model.pkl
        zf.write(pkl_path, "model.pkl")
        # Add transform script
        zf.writestr("transform.py", transform_script)
        # Add readme
        zf.writestr("README.md", readme)

    zip_buffer.seek(0)
    return zip_buffer.getvalue()
