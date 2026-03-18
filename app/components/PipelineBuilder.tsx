// app/components/PipelineBuilder.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, Reorder, useDragControls } from "framer-motion";

/* ── Design tokens ─────────────────────────────────────────────── */
const C = {
  bg: "#0A0A0A", card: "#111111", cardHover: "#161616", input: "#1A1A1A",
  border: "rgba(255,255,255,0.06)", borderMd: "rgba(255,255,255,0.10)", borderHi: "rgba(255,255,255,0.18)",
  text: "#F0F0F0", textSub: "#888888", textMute: "#444444",
  cyan: "#00D4FF", violet: "#8B5CF6", green: "#3FB950", amber: "#F59E0B", red: "#F85149",
  pink: "#EC4899",
  mono: "'JetBrains Mono', monospace", sans: "'Inter', system-ui, sans-serif",
  head: "'Sora', 'Inter', sans-serif",
};

const CAT_COLOR: Record<string, string> = {
  cleaning: C.amber, eda: C.cyan, visualization: C.violet, modeling: C.green,
  preprocessing: C.pink,
};
const CAT_ICON: Record<string, string> = {
  cleaning: "🧹", eda: "🔍", visualization: "📊", modeling: "🤖",
  preprocessing: "⚙️",
};

// Which arg keys trigger a column dropdown and which column type they need
const COL_ARG_MAP: Record<string, "all" | "numeric" | "categorical"> = {
  column: "all",
  target_column: "all",   // allow any column as target
  x_column: "numeric",
  y_column: "numeric",
  group_by: "categorical",
  columns_to_encode: "categorical",
  columns_to_scale: "numeric",
  feature_columns: "numeric",
};

/* ── Advanced preprocessing step catalog ───────────────────────── */
export const ADVANCED_TOOLS: Record<string, { label: string; category: string; args: Record<string, any>; reason: string; icon?: string }> = {
  // ─ Scaling ──────────────────────────────────────────
  standard_scaler: {
    label: "Standard Scaler (Z-score)", category: "preprocessing",
    args: { columns_to_scale: "" },
    reason: "Standardize numeric features to zero mean and unit variance (μ=0, σ=1). Required before SVM, PCA, regularized models.",
  },
  min_max_scaler: {
    label: "Min-Max Scaler [0,1]", category: "preprocessing",
    args: { columns_to_scale: "", feature_range_min: "0", feature_range_max: "1" },
    reason: "Rescale features to [0,1] range. Good for neural nets and distance-based algorithms.",
  },
  robust_scaler: {
    label: "Robust Scaler (IQR)", category: "preprocessing",
    args: { columns_to_scale: "" },
    reason: "Scale using median and IQR — resistant to outliers. Use when data has significant outliers.",
  },
  log_transform: {
    label: "Log Transform (skew fix)", category: "preprocessing",
    args: { column: "" },
    reason: "Apply log1p transform to reduce right skew in distributions. Useful for income, price, count features.",
  },
  // ─ Encoding ─────────────────────────────────────────
  one_hot_encode: {
    label: "One-Hot Encoding", category: "preprocessing",
    args: { columns_to_encode: "", drop_first: "true" },
    reason: "Convert categorical columns to binary dummy variables. Required by most linear/tree models.",
  },
  label_encode: {
    label: "Label Encoding (ordinal)", category: "preprocessing",
    args: { column: "" },
    reason: "Map categories to integers. Use for ordinal data or tree-based models that handle integers well.",
  },
  // ─ Feature Engineering ───────────────────────────────
  pca_transform: {
    label: "PCA Dimensionality Reduction", category: "preprocessing",
    args: { n_components: "5", target_column: "" },
    reason: "Reduce feature dimensions via PCA, retaining variance. Removes multicollinearity and speeds up training.",
  },
  polynomial_features: {
    label: "Polynomial Features", category: "preprocessing",
    args: { columns_to_scale: "", degree: "2" },
    reason: "Create interaction and polynomial terms (x², x·y). Helps linear models capture non-linear patterns.",
  },
  drop_columns: {
    label: "Drop Columns", category: "cleaning",
    args: { column: "" },
    reason: "Remove a column from the dataset to reduce noise or eliminate leakage columns before training.",
  },
  // ─ Splitting / Validation ────────────────────────────
  train_test_split: {
    label: "Train/Test Split", category: "preprocessing",
    args: { target_column: "", test_size: "0.2", stratify: "false" },
    reason: "Split dataset into train/test sets. Run before AutoML to prevent data leakage in evaluation.",
  },
  // ─ Modeling ─────────────────────────────────────────
  auto_ml_pipeline: {
    label: "AutoML Pipeline", category: "modeling",
    args: { target_column: "", cv_folds: "5", include_preprocessing: "true" },
    reason: "Train Random Forest, XGBoost, LightGBM, SVM, Logistic/Linear Regression with cross-validation. Uses the CURRENT cleaned dataset.",
  },
  cross_validate_model: {
    label: "Cross-Validate Best Model", category: "modeling",
    args: { target_column: "", model: "random_forest", cv_folds: "10" },
    reason: "Run k-fold cross-validation on the cleaned data to get robust accuracy estimates and avoid overfitting.",
  },
  hyperparameter_tune: {
    label: "Hyperparameter Tuning (Grid Search)", category: "modeling",
    args: { target_column: "", model: "random_forest", cv_folds: "5" },
    reason: "Grid search for optimal hyperparameters. Finds the best depth, estimators, learning rate, etc.",
  },
  feature_importance: {
    label: "Feature Importance", category: "modeling",
    args: { target_column: "" },
    reason: "Train a Random Forest to rank features by predictive importance. Identify which columns drive predictions.",
  },
  model_evaluation: {
    label: "Model Evaluation Report", category: "modeling",
    args: { target_column: "", model: "random_forest" },
    reason: "Accuracy, F1, Precision, Recall, ROC-AUC for classifiers; RMSE, MAE, R² for regressors.",
  },
};

/* ── Types ──────────────────────────────────────────────────────── */
export type PipelineStep = {
  id: string; tool: string; label: string; args: Record<string, any>;
  reason: string; category: string;
  status: "pending" | "running" | "done" | "error";
  result?: any; imageBase64?: string; executionMs?: number; errorMsg?: string;
  aiSummary?: string; loadingSummary?: boolean;
};

interface DatasetColumns {
  all: string[];
  numeric: string[];
  categorical: string[];
}

interface InitialPipeline {
  id: string;
  name: string;
  sessionId?: string | null;
  status: string;
  steps: any[];
  metadata?: any;
}

interface PipelineBuilderProps {
  onSaved?: (pipelineId: string) => void;
  initialPipeline?: InitialPipeline;
}

/* ── Portal-based Column Dropdown (fixes clipping from overflow:hidden) ── */
function ColDropdown({
  value, onChange, cols, label,
}: {
  value: string; onChange: (v: string) => void; cols: string[]; label: string;
}) {
  const [open, setOpen] = useState(false);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const portalId = useRef<string>(`col-dp-${Math.random().toString(36).slice(2)}`);

  const openDropdown = () => {
    if (!btnRef.current) return;
    const rect = btnRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const dropH = Math.min(cols.length * 36 + 60, 240);
    // Flip upward if there's not enough room below
    const top = spaceBelow < dropH && rect.top > dropH
      ? rect.top - dropH - 4
      : rect.bottom + 4;
    setDropPos({
      top,
      left: rect.left,
      width: Math.max(rect.width, 200),
    });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const portal = document.getElementById(portalId.current);
      if (
        btnRef.current && !btnRef.current.contains(e.target as Node) &&
        (!portal || !portal.contains(e.target as Node))
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const dropdownEl = open ? createPortal(
    <div
      id={portalId.current}
      style={{
        position: "fixed",
        top: dropPos.top,
        left: dropPos.left,
        width: dropPos.width,
        zIndex: 99999,
        background: "#1E1E1E",
        border: `1px solid ${C.borderMd}`,
        borderRadius: 10,
        maxHeight: 240,
        overflowY: "auto",
        boxShadow: "0 12px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(255,255,255,0.06)",
        scrollbarWidth: "thin" as const,
        scrollbarColor: `${C.border} transparent`,
      }}
    >
      {/* Search / clear header */}
      <div style={{ padding: "6px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 10, color: C.textMute }}>🔍</span>
        <span style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono }}>
          {cols.length} column{cols.length !== 1 ? "s" : ""}
        </span>
      </div>
      <button
        onMouseDown={e => { e.preventDefault(); onChange(""); setOpen(false); }}
        style={{ display: "block", width: "100%", padding: "8px 12px", background: "transparent", border: "none", color: C.textMute, fontSize: 11, fontFamily: C.mono, cursor: "pointer", textAlign: "left", borderBottom: `1px solid ${C.border}` }}
        onMouseEnter={e => (e.currentTarget.style.background = C.cardHover)}
        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
      >
        — clear —
      </button>
      {cols.length === 0 && (
        <div style={{ padding: "12px", color: C.textMute, fontSize: 10, fontFamily: C.mono, textAlign: "center" }}>
          Upload a CSV to see columns
        </div>
      )}
      {cols.map(col => (
        <button
          key={col}
          onMouseDown={e => { e.preventDefault(); onChange(col); setOpen(false); }}
          style={{
            display: "flex", alignItems: "center", gap: 8,
            width: "100%", padding: "8px 12px",
            background: col === value ? `${C.cyan}15` : "transparent",
            border: "none",
            color: col === value ? C.cyan : C.textSub,
            fontSize: 11, fontFamily: C.mono, cursor: "pointer", textAlign: "left",
            borderBottom: `1px solid ${C.border}`,
          }}
          onMouseEnter={e => { if (col !== value) (e.currentTarget as HTMLElement).style.background = C.cardHover; }}
          onMouseLeave={e => { if (col !== value) (e.currentTarget as HTMLElement).style.background = "transparent"; }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: col === value ? C.cyan : C.textMute, flexShrink: 0 }} />
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{col}</span>
          {col === value && <span style={{ fontSize: 9, color: C.cyan }}>✓</span>}
        </button>
      ))}
    </div>,
    document.body
  ) : null;

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <label style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.05em", display: "block", marginBottom: 3 }}>{label}</label>
      <button
        ref={btnRef}
        onClick={open ? () => setOpen(false) : openDropdown}
        style={{
          display: "flex", alignItems: "center", gap: 6,
          background: C.input, border: `1px solid ${open ? C.cyan + "66" : C.border}`,
          borderRadius: 6, padding: "5px 10px",
          color: value ? C.text : C.textMute,
          fontSize: 11, fontFamily: C.mono, cursor: "pointer", minWidth: 160,
          transition: "border-color 0.15s", outline: "none",
          boxShadow: open ? `0 0 0 2px ${C.cyan}22` : "none",
        }}
      >
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {value || <span style={{ color: C.textMute }}>Select column…</span>}
        </span>
        <span style={{ color: C.textMute, fontSize: 9, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}>▼</span>
      </button>
      {dropdownEl}
    </div>
  );
}

/* ── Arg Field — auto-detects dropdown vs text input ───────────── */
function ArgField({
  argKey, value, onChange, datasetCols,
}: {
  argKey: string; value: string; onChange: (v: string) => void; datasetCols: DatasetColumns;
}) {
  const colType = COL_ARG_MAP[argKey] as keyof DatasetColumns | undefined;
  const availableCols = colType ? datasetCols[colType] : [];

  if (colType) {
    return (
      <ColDropdown
        value={value}
        onChange={onChange}
        cols={availableCols}
        label={argKey}
      />
    );
  }

  // Enum select for model arg
  if (argKey === "model") {
    const models = ["random_forest", "xgboost", "lightgbm", "svm", "logistic_regression", "linear_regression", "gradient_boosting", "extra_trees", "knn", "naive_bayes"];
    return (
      <div>
        <label style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.05em", display: "block", marginBottom: 3 }}>{argKey}</label>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 5, padding: "5px 8px", color: C.text, fontSize: 11, fontFamily: C.mono, outline: "none", minWidth: 160, cursor: "pointer" }}
        >
          {models.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
      </div>
    );
  }

  // Boolean toggle
  if (argKey === "stratify" || argKey === "drop_first" || argKey === "include_preprocessing") {
    return (
      <div>
        <label style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.05em", display: "block", marginBottom: 3 }}>{argKey}</label>
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 5, padding: "5px 8px", color: C.text, fontSize: 11, fontFamily: C.mono, outline: "none", cursor: "pointer" }}
        >
          <option value="true">true</option>
          <option value="false">false</option>
        </select>
      </div>
    );
  }

  // Fallback text input
  return (
    <div>
      <label style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.05em", display: "block", marginBottom: 3 }}>{argKey}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ background: C.input, border: `1px solid ${C.border}`, borderRadius: 5, padding: "5px 8px", color: C.text, fontSize: 11, fontFamily: C.mono, outline: "none", width: 120 }}
      />
    </div>
  );
}

/* ── Drag Handle ───────────────────────────────────────────────── */
function DragHandle({ controls }: { controls: ReturnType<typeof useDragControls> }) {
  return (
    <div
      onPointerDown={e => controls.start(e)}
      style={{
        color: C.textMute, cursor: "grab", fontSize: 16, flexShrink: 0,
        lineHeight: 1, padding: "2px 4px", borderRadius: 4,
        display: "flex", alignItems: "center", justifyContent: "center",
        userSelect: "none", touchAction: "none",
      }}
      title="Drag to reorder"
    >
      ⠿
    </div>
  );
}

/* ── Human-readable result renderer ───────────────────────────── */
function HumanResult({ step }: { step: PipelineStep }) {
  const { tool, result, imageBase64 } = step;
  if (!result && !imageBase64) return null;

  if (imageBase64) {
    return (
      <div style={{ padding: "0 12px 12px" }}>
        <img src={imageBase64} alt="Chart" style={{ width: "100%", borderRadius: 10, border: `1px solid ${C.border}` }} />
        {result && <SmallStatRow data={result} />}
      </div>
    );
  }

  if (tool === "detect_missing_values" && result) {
    const cols = result.missing_data || [];
    return (
      <ResultCard>
        <StatBadges items={[
          { label: "Total Rows", value: result.total_rows?.toLocaleString(), color: C.text },
          { label: "Columns Affected", value: result.columns_with_missing, color: cols.length > 0 ? C.amber : C.green },
        ]} />
        {cols.length === 0
          ? <GreenBanner text="✓ No missing values found — dataset is complete!" />
          : <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono, marginBottom: 6, letterSpacing: "0.08em" }}>MISSING DATA BY COLUMN</div>
            {cols.map((c: any) => <MissingBar key={c.column} column={c.column} pct={c.null_percentage} count={c.null_count} total={result.total_rows} />)}
          </div>}
      </ResultCard>
    );
  }

  if (tool === "dataset_overview" && result) {
    const shape = result.shape || {};
    const missing = result.missing_data_summary || {};
    const numeric = result.column_types?.numeric || [];
    const categorical = result.column_types?.categorical || [];
    return (
      <ResultCard>
        <StatBadges items={[
          { label: "Rows", value: shape.rows?.toLocaleString(), color: C.cyan },
          { label: "Columns", value: shape.columns, color: C.violet },
          { label: "Memory", value: `${result.memory_usage_mb} MB`, color: C.textSub },
          { label: "Missing", value: `${missing.missing_percentage}%`, color: missing.missing_percentage > 5 ? C.amber : C.green },
        ]} />
        <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          {numeric.map((c: string) => <Chip key={c} label={c} color={C.cyan} icon="#" />)}
          {categorical.map((c: string) => <Chip key={c} label={c} color={C.violet} icon="A" />)}
        </div>
      </ResultCard>
    );
  }

  if (tool === "detect_outliers" && result) {
    const pct = result.outlier_percentage || 0;
    const severity = pct > 10 ? "high" : pct > 3 ? "medium" : "low";
    const color = severity === "high" ? C.red : severity === "medium" ? C.amber : C.green;
    return (
      <ResultCard>
        <StatBadges items={[
          { label: "Column", value: result.column, color: C.textSub },
          { label: "Outliers Found", value: result.outlier_count, color },
          { label: "% of Data", value: `${pct}%`, color },
          { label: "Method", value: result.method?.toUpperCase(), color: C.textMute },
        ]} />
        {result.bounds && (
          <div style={{ marginTop: 8, padding: "8px 12px", background: `${color}0D`, borderRadius: 8, border: `1px solid ${color}22`, fontSize: 11, color: C.textSub, fontFamily: C.mono }}>
            Normal range: <span style={{ color }}>[{result.bounds.lower?.toFixed(2)} — {result.bounds.upper?.toFixed(2)}]</span>
          </div>
        )}
        {severity === "low" && <GreenBanner text="✓ Outlier count is within acceptable range." />}
      </ResultCard>
    );
  }

  if ((tool === "remove_duplicates" || tool === "remove_outliers") && result) {
    const removed = result.duplicates_removed ?? result.rows_removed ?? 0;
    return (
      <ResultCard>
        <StatBadges items={[
          { label: "Rows Removed", value: removed, color: removed > 0 ? C.amber : C.green },
          { label: "Rows Remaining", value: result.rows_remaining?.toLocaleString(), color: C.cyan },
          { label: "% Removed", value: `${result.duplicate_percentage ?? result.removal_percentage ?? 0}%`, color: C.textSub },
        ]} />
        {removed === 0 ? <GreenBanner text="✓ No rows removed — dataset unchanged." /> : <div style={{ marginTop: 8, fontSize: 11, color: C.textSub }}>{removed} rows were cleaned from the dataset.</div>}
      </ResultCard>
    );
  }

  if (tool === "fill_missing_values" && result) {
    return (
      <ResultCard>
        <StatBadges items={[
          { label: "Column", value: result.column, color: C.textSub },
          { label: "Before", value: result.nulls_before, color: result.nulls_before > 0 ? C.amber : C.green },
          { label: "After", value: result.nulls_after, color: result.nulls_after === 0 ? C.green : C.amber },
          { label: "Strategy", value: result.strategy, color: C.cyan },
        ]} />
        <div style={{ marginTop: 8, fontSize: 11, color: C.textSub, fontStyle: "italic" }}>{result.action}</div>
      </ResultCard>
    );
  }

  if (tool === "correlation_analysis" && result) {
    const corrs = result.significant_correlations || [];
    const strong = corrs.filter((c: any) => c.strength === "strong");
    return (
      <ResultCard>
        <StatBadges items={[
          { label: "Pairs Analyzed", value: result.numeric_columns?.length, color: C.cyan },
          { label: "Correlations Found", value: result.total_correlations, color: C.violet },
          { label: "Strong", value: strong.length, color: strong.length > 0 ? C.green : C.textMute },
        ]} />
        {corrs.slice(0, 5).map((c: any) => <CorrRow key={`${c.column1}-${c.column2}`} {...c} />)}
      </ResultCard>
    );
  }

  if (tool === "auto_ml_pipeline" && result) {
    const best = result.best_model;
    const score = result.best_score;
    const isClass = result.problem_type === "classification";
    return (
      <ResultCard>
        <div style={{ textAlign: "center", padding: "12px 0 8px" }}>
          <div style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.1em", marginBottom: 4 }}>BEST MODEL</div>
          <div style={{ fontFamily: C.head, fontSize: 22, fontWeight: 700, color: C.green }}>{best}</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: C.text, fontFamily: C.head, marginTop: 2 }}>{(score * 100).toFixed(1)}%</div>
          <div style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono }}>{isClass ? "ACCURACY" : "R² SCORE"}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: 8 }}>
          {Object.entries(result.results || {}).map(([name, metrics]: [string, any]) => (
            !metrics.error && (
              <div key={name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 7, background: name === best ? `${C.green}0D` : "transparent", border: `1px solid ${name === best ? C.green + "33" : C.border}` }}>
                <span style={{ fontSize: 11, color: name === best ? C.green : C.textSub, flex: 1, fontWeight: name === best ? 600 : 400 }}>{name}</span>
                <span style={{ fontFamily: C.mono, fontSize: 11, color: name === best ? C.green : C.textMute }}>
                  {isClass ? `${((metrics.accuracy ?? 0) * 100).toFixed(1)}%` : `R²=${(metrics.r2_score ?? 0).toFixed(3)}`}
                </span>
                {name === best && <span style={{ fontSize: 9, color: C.green }}>★ BEST</span>}
              </div>
            )
          ))}
        </div>
      </ResultCard>
    );
  }

  if (tool === "column_statistics" && result) {
    return (
      <ResultCard>
        <StatBadges items={[
          { label: "Column", value: result.column, color: C.textSub },
          { label: "Type", value: result.dtype, color: C.violet },
          { label: "Nulls", value: `${result.null_percentage}%`, color: result.null_percentage > 5 ? C.amber : C.green },
          { label: "Unique", value: result.unique_count, color: C.cyan },
        ]} />
        {"mean" in result && (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6, marginTop: 8 }}>
            {[["Mean", result.mean], ["Median", result.median], ["Std Dev", result.std], ["Min", result.min], ["Max", result.max], ["Skew", result.skewness]].map(([k, v]) => (
              <div key={String(k)} style={{ textAlign: "center", padding: "6px 4px", background: C.input, borderRadius: 6 }}>
                <div style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono }}>{k}</div>
                <div style={{ fontSize: 12, color: C.text, fontWeight: 600 }}>{typeof v === "number" ? v.toFixed(2) : v}</div>
              </div>
            ))}
          </div>
        )}
      </ResultCard>
    );
  }

  if (tool === "data_quality_report" && result) {
    const issues = result.potential_issues || [];
    return (
      <ResultCard>
        <StatBadges items={[
          { label: "Rows", value: result.dataset_info?.rows?.toLocaleString(), color: C.cyan },
          { label: "Missing", value: result.missing_data?.total_missing, color: result.missing_data?.total_missing > 0 ? C.amber : C.green },
          { label: "Duplicates", value: result.duplicates?.duplicate_rows, color: result.duplicates?.duplicate_rows > 0 ? C.amber : C.green },
        ]} />
        {issues.length === 0
          ? <GreenBanner text="✓ Data quality looks great! No major issues found." />
          : issues.map((iss: string, i: number) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "6px 10px", background: `${C.amber}0D`, borderRadius: 6, marginTop: 5 }}>
              <span style={{ color: C.amber, fontSize: 12, flexShrink: 0 }}>⚠</span>
              <span style={{ fontSize: 11, color: C.textSub, lineHeight: 1.5 }}>{iss}</span>
            </div>
          ))}
      </ResultCard>
    );
  }

  if (tool === "feature_importance" && result) {
    const top = result.top_10_features || [];
    const maxImp = top[0]?.importance || 1;
    return (
      <ResultCard>
        <div style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono, marginBottom: 8 }}>TOP FEATURES — {result.model_name}</div>
        {top.slice(0, 6).map((f: any, i: number) => (
          <div key={f.feature} style={{ marginBottom: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ fontSize: 11, color: C.textSub }}>{f.feature}</span>
              <span style={{ fontFamily: C.mono, fontSize: 10, color: C.textMute }}>{(f.importance * 100).toFixed(1)}%</span>
            </div>
            <div style={{ height: 5, background: C.border, borderRadius: 2, overflow: "hidden" }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${(f.importance / maxImp) * 100}%` }} transition={{ delay: i * 0.06, duration: 0.5 }}
                style={{ height: "100%", background: `linear-gradient(90deg, ${C.green}, ${C.cyan})`, borderRadius: 2 }} />
            </div>
          </div>
        ))}
      </ResultCard>
    );
  }

  // ── Preprocessing: Scaler results ──────────────────────────────
  if (["standard_scaler", "min_max_scaler", "robust_scaler"].includes(tool) && result) {
    return (
      <ResultCard>
        <StatBadges items={[
          { label: "Scaler", value: result.scaler?.split(" ")[0], color: C.pink },
          { label: "Columns", value: result.columns_scaled?.length ?? "all", color: C.cyan },
          { label: "Rows", value: result.rows?.toLocaleString(), color: C.textSub },
        ]} />
        {result.before && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
            {Object.entries(result.before as Record<string, any>).slice(0, 4).map(([col, stats]: [string, any]) => (
              <div key={col} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", background: C.card, borderRadius: 6, fontSize: 10, fontFamily: C.mono }}>
                <span style={{ color: C.textSub, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{col}</span>
                <span style={{ color: C.textMute }}>μ {stats.mean?.toFixed(2)} σ {stats.std?.toFixed(2)}</span>
                <span style={{ color: C.textMute }}>→</span>
                <span style={{ color: C.green }}>μ {result.after?.[col]?.mean?.toFixed(2)} σ {result.after?.[col]?.std?.toFixed(2)}</span>
              </div>
            ))}
          </div>
        )}
        <GreenBanner text={`✓ ${result.note}`} />
      </ResultCard>
    );
  }

  // ── Log transform ───────────────────────────────────────────────
  if (tool === "log_transform" && result) {
    const improved = result.improvement > 0;
    return (
      <ResultCard>
        <StatBadges items={[
          { label: "Column", value: result.column, color: C.textSub },
          { label: "Skew Before", value: result.skewness_before, color: C.amber },
          { label: "Skew After", value: result.skewness_after, color: C.green },
          { label: "Improvement", value: result.improvement?.toFixed(3), color: improved ? C.green : C.red },
        ]} />
        {improved && <GreenBanner text="✓ Skewness reduced. Distribution is now more symmetric." />}
      </ResultCard>
    );
  }

  // ── One-hot encoding ────────────────────────────────────────────
  if (tool === "one_hot_encode" && result) {
    return (
      <ResultCard>
        <StatBadges items={[
          { label: "Encoded", value: result.encoded_columns?.length, color: C.violet },
          { label: "Cols Before", value: result.columns_before, color: C.textSub },
          { label: "Cols After", value: result.columns_after, color: C.cyan },
          { label: "Added", value: `+${result.new_columns_added}`, color: C.green },
        ]} />
        <GreenBanner text={`✓ ${result.encoded_columns?.join(", ")} encoded to binary dummies.`} />
      </ResultCard>
    );
  }

  // ── Label encode ────────────────────────────────────────────────
  if (tool === "label_encode" && result) {
    return (
      <ResultCard>
        <StatBadges items={[
          { label: "Column", value: result.column, color: C.textSub },
          { label: "Unique Values", value: result.unique_values, color: C.cyan },
        ]} />
        <div style={{ marginTop: 8, fontSize: 10, color: C.textMute, fontFamily: C.mono }}>
          {Object.entries(result.mapping_sample || {}).slice(0, 6).map(([k, v]) => (
            <span key={k} style={{ display: "inline-flex", gap: 4, marginRight: 8, color: C.textSub }}>
              {k} <span style={{ color: C.violet }}>→ {String(v)}</span>
            </span>
          ))}
        </div>
      </ResultCard>
    );
  }

  // ── PCA ─────────────────────────────────────────────────────────
  if (tool === "pca_transform" && result) {
    return (
      <ResultCard>
        <StatBadges items={[
          { label: "Components", value: result.n_components, color: C.cyan },
          { label: "Original Features", value: result.original_features, color: C.textSub },
          { label: "Variance Explained", value: `${result.cumulative_variance_explained}%`, color: result.cumulative_variance_explained > 80 ? C.green : C.amber },
        ]} />
        <div style={{ marginTop: 8 }}>
          {(result.variance_explained_per_component || []).map((pct: number, i: number) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, minWidth: 50 }}>PC{i + 1}</span>
              <div style={{ flex: 1, height: 5, background: C.border, borderRadius: 2, overflow: "hidden" }}>
                <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ delay: i * 0.05, duration: 0.4 }}
                  style={{ height: "100%", background: `${C.cyan}`, borderRadius: 2 }} />
              </div>
              <span style={{ fontSize: 9, color: C.textSub, fontFamily: C.mono, minWidth: 36 }}>{pct}%</span>
            </div>
          ))}
        </div>
        {result.image_base64 && (
          <div style={{ marginTop: 10 }}>
            <img src={result.image_base64} alt="PCA Scree" style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.border}` }} />
          </div>
        )}
      </ResultCard>
    );
  }

  // ── Cross-validation ────────────────────────────────────────────
  if (tool === "cross_validate_model" && result) {
    const scoreColor = result.mean_score > 0.85 ? C.green : result.mean_score > 0.65 ? C.amber : C.red;
    return (
      <ResultCard>
        <StatBadges items={[
          { label: "Model", value: result.model, color: C.textSub },
          { label: "Mean Score", value: result.mean_score?.toFixed(4), color: scoreColor },
          { label: "±Std", value: result.std_score?.toFixed(4), color: C.textMute },
          { label: "Folds", value: result.cv_folds, color: C.violet },
        ]} />
        <div style={{ marginTop: 8, fontSize: 10, color: C.textSub, fontFamily: C.mono }}>
          95% CI: [{result.confidence_interval_95?.[0]?.toFixed(4)} — {result.confidence_interval_95?.[1]?.toFixed(4)}]
        </div>
        {result.image_base64 && (
          <img src={result.image_base64} alt="CV scores" style={{ width: "100%", borderRadius: 8, border: `1px solid ${C.border}`, marginTop: 8 }} />
        )}
      </ResultCard>
    );
  }

  // ── Hyperparameter tuning ───────────────────────────────────────
  if (tool === "hyperparameter_tune" && result) {
    const scoreColor = result.best_score > 0.85 ? C.green : result.best_score > 0.65 ? C.amber : C.red;
    return (
      <ResultCard>
        <StatBadges items={[
          { label: "Best Score", value: result.best_score?.toFixed(4), color: scoreColor },
          { label: "Combinations", value: result.total_combinations_tried, color: C.cyan },
          { label: "Model", value: result.model, color: C.textSub },
        ]} />
        <div style={{ marginTop: 8, padding: "8px 10px", background: `${C.green}0D`, borderRadius: 7, border: `1px solid ${C.green}25`, fontSize: 10, fontFamily: C.mono, color: C.green }}>
          Best params: {JSON.stringify(result.best_params)}
        </div>
        {(result.top_5_results || []).slice(0, 3).map((r: any, i: number) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", marginTop: 4, background: i === 0 ? `${C.green}0A` : "transparent", borderRadius: 5, border: `1px solid ${i === 0 ? C.green + "30" : C.border}` }}>
            <span style={{ fontSize: 9, color: i === 0 ? C.green : C.textMute, fontFamily: C.mono, minWidth: 20 }}>#{i + 1}</span>
            <span style={{ flex: 1, fontSize: 9, color: C.textSub, fontFamily: C.mono, overflow: "hidden", textOverflow: "ellipsis" }}>{JSON.stringify(r.params)}</span>
            <span style={{ fontSize: 10, color: i === 0 ? C.green : C.textSub, fontFamily: C.mono }}>{r.mean_score?.toFixed(4)}</span>
          </div>
        ))}
      </ResultCard>
    );
  }

  // ── Drop column / train-test split / polynomial ─────────────────
  if (["drop_columns", "train_test_split", "polynomial_features"].includes(tool) && result) {
    const simpleKeys = Object.keys(result).filter(k => typeof result[k] !== "object" && !Array.isArray(result[k])).slice(0, 6);
    return (
      <ResultCard>
        <StatBadges items={simpleKeys.map(k => ({ label: k.replace(/_/g, " "), value: String(result[k]), color: C.textSub }))} />
        {result.note && <div style={{ marginTop: 6, fontSize: 10, color: C.textMute, fontStyle: "italic" }}>{result.note}</div>}
      </ResultCard>
    );
  }

  if (result && typeof result === "object") {
    const keys = Object.keys(result).filter(k => !["correlation_matrix"].includes(k));
    const simple = keys.filter(k => typeof result[k] !== "object").slice(0, 6);
    if (simple.length > 0) {
      return (
        <ResultCard>
          <StatBadges items={simple.map(k => ({ label: k.replace(/_/g, " "), value: String(result[k]), color: C.textSub }))} />
        </ResultCard>
      );
    }
  }
  return null;
}

/* ── Sub-components ─────────────────────────────────────────────── */
function ResultCard({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: "10px 12px 12px", background: C.input, borderRadius: 10, margin: "0 12px 12px" }}>{children}</div>;
}

function StatBadges({ items }: { items: { label: string; value: any; color: string }[] }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
      {items.map(({ label, value, color }) => (
        <div key={label} style={{ padding: "5px 10px", borderRadius: 8, background: C.card, border: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 1, minWidth: 60 }}>
          <div style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color, fontFamily: C.head }}>{value ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}
function Chip({ label, color, icon }: { label: string; color: string; icon: string }) {
  return <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 5, background: `${color}18`, color, border: `1px solid ${color}30`, fontFamily: C.mono, display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ opacity: 0.6, fontSize: 9 }}>{icon}</span>{label}</span>;
}
function GreenBanner({ text }: { text: string }) {
  return <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", background: `${C.green}0D`, borderRadius: 7, border: `1px solid ${C.green}25`, marginTop: 6 }}><span style={{ fontSize: 11, color: C.green }}>{text}</span></div>;
}
function MissingBar({ column, pct, count, total }: { column: string; pct: number; count: number; total: number }) {
  const color = pct > 30 ? C.red : C.amber;
  return (
    <div style={{ marginBottom: 7 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
        <span style={{ fontSize: 11, color: C.textSub, fontFamily: C.mono }}>{column}</span>
        <span style={{ fontSize: 10, color, fontFamily: C.mono }}>{pct}% ({count.toLocaleString()} rows)</span>
      </div>
      <div style={{ height: 6, background: C.border, borderRadius: 3, overflow: "hidden" }}>
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6 }} style={{ height: "100%", background: color, borderRadius: 3 }} />
      </div>
    </div>
  );
}
function CorrRow({ column1, column2, correlation, strength, direction }: any) {
  const color = strength === "strong" ? C.green : strength === "moderate" ? C.amber : C.textMute;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 0", borderBottom: `1px solid ${C.border}` }}>
      <span style={{ fontSize: 10, color: C.textSub, fontFamily: C.mono, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{column1} ↔ {column2}</span>
      <div style={{ width: 60, height: 5, background: C.border, borderRadius: 2, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${Math.abs(correlation) * 100}%`, background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: C.mono, fontSize: 10, color, minWidth: 48, textAlign: "right" }}>{direction === "positive" ? "+" : ""}{correlation.toFixed(3)}</span>
    </div>
  );
}
function SmallStatRow({ data }: { data: any }) {
  const items: { label: string; value: any }[] = [];
  if (data.chart_type) items.push({ label: "Type", value: data.chart_type.replace(/_/g, " ") });
  if (data.correlation != null) items.push({ label: "Correlation", value: data.correlation.toFixed(3) });
  if (data.statistics?.mean != null) items.push({ label: "Mean", value: data.statistics.mean.toFixed(2) }, { label: "Std", value: data.statistics.std?.toFixed(2) });
  if (!items.length) return null;
  return (
    <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
      {items.map(i => <span key={i.label} style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono }}><span style={{ color: C.textSub }}>{i.label}:</span> {i.value}</span>)}
    </div>
  );
}

/* ── AI Summary ─────────────────────────────────────────────────── */
function AISummary({ step, onGenerate }: { step: PipelineStep; onGenerate: () => void }) {
  if (step.status !== "done") return null;
  return (
    <div style={{ margin: "0 12px 12px", padding: "10px 12px", background: `${C.violet}0D`, border: `1px solid ${C.violet}25`, borderRadius: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: step.aiSummary ? 6 : 0 }}>
        <span style={{ fontSize: 12 }}>✨</span>
        <span style={{ fontSize: 10, fontWeight: 600, color: C.violet, fontFamily: C.head }}>AI Insight</span>
        {!step.aiSummary && !step.loadingSummary && (
          <button onClick={onGenerate} style={{ marginLeft: "auto", fontSize: 9, padding: "2px 8px", borderRadius: 4, border: `1px solid ${C.violet}44`, background: `${C.violet}15`, color: C.violet, cursor: "pointer", fontFamily: C.mono }}>Explain this →</button>
        )}
        {step.loadingSummary && (
          <div style={{ marginLeft: "auto", display: "flex", gap: 3, alignItems: "center" }}>
            {[0, 1, 2].map(i => <div key={i} style={{ width: 4, height: 4, borderRadius: "50%", background: C.violet, animation: `dot 1.2s ${i * 0.2}s ease-in-out infinite` }} />)}
          </div>
        )}
      </div>
      {step.aiSummary && <p style={{ fontSize: 12, color: C.textSub, lineHeight: 1.65, margin: 0 }}>{step.aiSummary}</p>}
    </div>
  );
}

/* ── Status Badge ───────────────────────────────────────────────── */
function StatusBadge({ status, color }: { status: PipelineStep["status"]; color: string }) {
  const cfg = {
    pending: { label: "Pending", bg: C.border, tc: C.textMute },
    running: { label: "Running", bg: `${color}22`, tc: color },
    done: { label: "Done", bg: `${C.green}22`, tc: C.green },
    error: { label: "Error", bg: `${C.red}22`, tc: C.red },
  }[status];
  return (
    <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, background: cfg.bg, color: cfg.tc, fontFamily: C.mono, fontWeight: 600, flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}>
      {status === "running" && <span style={{ width: 5, height: 5, borderRadius: "50%", background: color, animation: "pls 1.2s ease-in-out infinite" }} />}
      {cfg.label}
    </span>
  );
}

/* ── Step Card with drag controls ──────────────────────────────── */
function StepCard({
  step, idx, phase, isRunning, expanded, onToggleExpand,
  onRemove, onUpdateArg, onRunFrom, onGenerateSummary,
  datasetCols,
}: {
  step: PipelineStep; idx: number; phase: string; isRunning: boolean;
  expanded: boolean; onToggleExpand: () => void; onRemove: () => void;
  onUpdateArg: (k: string, v: string) => void; onRunFrom: () => void;
  onGenerateSummary: () => void;
  datasetCols: DatasetColumns;
}) {
  const controls = useDragControls();
  const color = CAT_COLOR[step.category] || C.textSub;
  const [hovRun, setHovRun] = useState(false);
  const canRunFrom = !isRunning && (step.status === "pending" || step.status === "error") && idx > 0;
  const borderColor = step.status === "running" ? color + "88" : step.status === "done" ? color + "33" : step.status === "error" ? C.red + "55" : C.border;

  return (
    <Reorder.Item
      value={step}
      id={step.id}
      dragListener={false}
      dragControls={controls}
      as="div"
      style={{ background: C.card, border: `1px solid ${borderColor}`, borderRadius: 12, overflow: "hidden", flexShrink: 0, cursor: "default" }}
      initial={{ opacity: 0, x: -14 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 14 }}
      transition={{ duration: 0.2 }}
      whileDrag={{ scale: 1.01, boxShadow: `0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px ${color}55`, zIndex: 100 }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 13px", background: step.status === "running" ? `${color}08` : step.status === "done" ? `${color}03` : "transparent" }}>
        {/* Drag handle — only when not running */}
        {!isRunning ? (
          <DragHandle controls={controls} />
        ) : (
          <div style={{ width: 20 }} />
        )}

        {/* Index */}
        <div style={{ width: 22, height: 22, borderRadius: 6, background: `${color}22`, border: `1px solid ${color}44`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color, fontFamily: C.mono, flexShrink: 0 }}>{idx + 1}</div>
        <span style={{ fontSize: 14, flexShrink: 0 }}>{CAT_ICON[step.category] || "⚙️"}</span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.text, fontFamily: C.head, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{step.label}</div>
          <div style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono }}>{step.tool}</div>
        </div>

        {canRunFrom && (
          <button onClick={onRunFrom} onMouseEnter={() => setHovRun(true)} onMouseLeave={() => setHovRun(false)}
            title="Run from this step onwards"
            style={{ padding: "3px 8px", borderRadius: 5, border: `1px solid ${hovRun ? color + "66" : C.border}`, background: hovRun ? `${color}18` : "transparent", color: hovRun ? color : C.textMute, fontSize: 9, fontFamily: C.mono, cursor: "pointer", transition: "all 0.15s", flexShrink: 0 }}>
            ▶ from here
          </button>
        )}

        <StatusBadge status={step.status} color={color} />
        {step.executionMs != null && <span style={{ fontSize: 9, color: C.textMute, fontFamily: C.mono, flexShrink: 0 }}>{step.executionMs}ms</span>}

        {!isRunning && phase !== "run" && (
          <button onClick={onRemove} title="Remove step"
            style={{ background: "none", border: "none", color: C.textMute, cursor: "pointer", fontSize: 12, padding: "2px 4px", borderRadius: 4, flexShrink: 0 }}
            onMouseEnter={e => (e.currentTarget.style.color = C.red)}
            onMouseLeave={e => (e.currentTarget.style.color = C.textMute)}>✕</button>
        )}
      </div>

      {/* Error */}
      {step.status === "error" && step.errorMsg && (
        <div style={{ padding: "7px 13px", background: `${C.red}08`, borderTop: `1px solid ${C.red}22`, fontSize: 11, color: C.red, fontFamily: C.mono, lineHeight: 1.5, wordBreak: "break-word" }}>
          ⚠ {step.errorMsg.slice(0, 250)}
        </div>
      )}

      {/* Args — smart dropdowns */}
      {!isRunning && Object.keys(step.args).length > 0 && (
        <div style={{ padding: "10px 13px", borderTop: `1px solid ${C.border}`, display: "flex", flexWrap: "wrap", gap: 10 }}>
          {Object.entries(step.args).map(([key, val]) => (
            <ArgField
              key={key}
              argKey={key}
              value={String(val)}
              onChange={v => onUpdateArg(key, v)}
              datasetCols={datasetCols}
            />
          ))}
        </div>
      )}

      {/* Reason */}
      <div style={{ padding: "5px 13px 8px", fontSize: 10, color: C.textMute, fontFamily: C.sans, borderTop: `1px solid ${C.border}`, fontStyle: "italic", lineHeight: 1.55 }}>{step.reason}</div>

      {/* Results */}
      {(step.result || step.imageBase64) && (
        <div style={{ borderTop: `1px solid ${C.border}` }}>
          <button onClick={onToggleExpand}
            style={{ width: "100%", padding: "7px 13px", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color, fontSize: 10, fontFamily: C.mono, textAlign: "left" }}>
            {expanded ? "▲" : "▼"} {expanded ? "Hide" : "View"} Results
          </button>
          <AnimatePresence>
            {expanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.18 }} style={{ overflow: "hidden" }}>
                <HumanResult step={step} />
                <AISummary step={step} onGenerate={onGenerateSummary} />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Running animation bar */}
      {step.status === "running" && (
        <div style={{ height: 2, background: `${color}20`, overflow: "hidden" }}>
          <motion.div style={{ height: "100%", background: color }} animate={{ x: ["-100%", "100%"] }} transition={{ repeat: Infinity, duration: 1.1, ease: "linear" }} />
        </div>
      )}
    </Reorder.Item>
  );
}

/* ── Suggestion Card ────────────────────────────────────────────── */
function SuggestionCard({ suggestion, onAdd, disabled }: { suggestion: any; onAdd: () => void; disabled: boolean }) {
  const [hov, setHov] = useState(false);
  const color = CAT_COLOR[suggestion.category] || C.textSub;
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.18 }}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      onClick={disabled ? undefined : onAdd}
      style={{ padding: "10px 12px", borderRadius: 10, background: hov && !disabled ? C.cardHover : C.card, border: `1px solid ${hov && !disabled ? color + "55" : C.border}`, cursor: disabled ? "not-allowed" : "pointer", transition: "all 0.15s", opacity: disabled ? 0.5 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 4 }}>
        <span style={{ fontSize: 13 }}>{CAT_ICON[suggestion.category] || "⚙️"}</span>
        <span style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: C.head, flex: 1 }}>{suggestion.label}</span>
        <span style={{ fontSize: 9, padding: "2px 5px", borderRadius: 4, background: `${color}18`, color, fontFamily: C.mono, fontWeight: 600, border: `1px solid ${color}33` }}>{suggestion.category}</span>
      </div>
      <div style={{ fontSize: 9.5, color: C.textMute, fontFamily: C.mono, marginBottom: 3 }}>{suggestion.tool}</div>
      <div style={{ fontSize: 10, color: C.textSub, lineHeight: 1.5 }}>{suggestion.reason}</div>
      {hov && !disabled && <div style={{ marginTop: 6, fontSize: 10, color, fontFamily: C.mono, fontWeight: 600 }}>+ Add to pipeline →</div>}
    </motion.div>
  );
}

/* ── Export utilities ───────────────────────────────────────────── */
function buildExportText(steps: PipelineStep[], pipelineName: string): string {
  const lines: string[] = [`DSAgent Pipeline Report: ${pipelineName}`, `Generated: ${new Date().toLocaleString()}`, "=".repeat(60), ""];
  steps.forEach((step, i) => {
    lines.push(`Step ${i + 1}: ${step.label} [${step.status.toUpperCase()}]`, `Tool: ${step.tool}`);
    if (step.executionMs) lines.push(`Time: ${step.executionMs}ms`);
    if (step.aiSummary) lines.push(`AI Insight: ${step.aiSummary}`);
    if (step.errorMsg) lines.push(`Error: ${step.errorMsg}`);
    if (step.result) lines.push(`Result: ${JSON.stringify(step.result, null, 2)}`);
    lines.push("");
  });
  return lines.join("\n");
}
function downloadText(text: string, filename: string) {
  const blob = new Blob([text], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
}
function downloadJSON(data: any, filename: string) {
  downloadText(JSON.stringify(data, null, 2), filename);
}
function downloadCSV(steps: PipelineStep[], name: string) {
  const rows = [["Step", "Tool", "Category", "Status", "Time (ms)", "AI Insight", "Error"]];
  steps.forEach((s, i) => rows.push([String(i + 1), s.tool, s.category, s.status, String(s.executionMs ?? ""), s.aiSummary ?? "", s.errorMsg ?? ""]));
  downloadText(rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n"), `${name.replace(/\s+/g, "_")}_results.csv`);
}

/* ── Export Modal ───────────────────────────────────────────────── */
function ExportModal({ steps, pipelineName, onClose }: { steps: PipelineStep[]; pipelineName: string; onClose: () => void }) {
  const [exporting, setExporting] = useState<string | null>(null);
  const doExport = async (type: string) => {
    setExporting(type);
    await new Promise(r => setTimeout(r, 400));
    if (type === "json") downloadJSON({ name: pipelineName, steps }, `${pipelineName.replace(/\s+/g, "_")}.json`);
    if (type === "txt") downloadText(buildExportText(steps, pipelineName), `${pipelineName.replace(/\s+/g, "_")}_report.txt`);
    if (type === "csv") downloadCSV(steps, pipelineName);
    setExporting(null);
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <motion.div initial={{ scale: 0.93, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93 }} onClick={e => e.stopPropagation()}
        style={{ background: C.card, borderRadius: 18, border: `1px solid ${C.borderMd}`, width: "100%", maxWidth: 420, overflow: "hidden" }}>
        <div style={{ padding: "20px 22px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: C.head, fontSize: "1rem", fontWeight: 700, color: C.text, marginBottom: 4 }}>Export Results</div>
          <div style={{ fontSize: 12, color: C.textSub }}>Download your pipeline results in various formats.</div>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {[
            { id: "json", icon: "{ }", label: "JSON Export", desc: "Full structured data, all results", color: C.cyan },
            { id: "txt", icon: "📄", label: "Text Report", desc: "Human-readable summary with AI insights", color: C.violet },
            { id: "csv", icon: "📊", label: "CSV Summary", desc: "Spreadsheet-friendly step results table", color: C.green },
          ].map(({ id, icon, label, desc, color }) => (
            <button key={id} onClick={() => doExport(id)} disabled={exporting === id}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: exporting === id ? `${color}15` : C.input, border: `1px solid ${exporting === id ? color + "44" : C.border}`, borderRadius: 10, cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}>
              <div style={{ width: 36, height: 36, borderRadius: 9, background: `${color}18`, border: `1px solid ${color}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, flexShrink: 0 }}>{icon}</div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: C.head }}>{exporting === id ? "Preparing…" : label}</div>
                <div style={{ fontSize: 11, color: C.textSub }}>{desc}</div>
              </div>
              <div style={{ marginLeft: "auto", fontSize: 16, color, opacity: 0.6 }}>↓</div>
            </button>
          ))}
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "6px 16px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.textSub, fontSize: 12, cursor: "pointer", fontFamily: C.sans }}>Close</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── Templates ──────────────────────────────────────────────────── */
const TEMPLATES: Record<string, { name: string; icon: string; desc: string; steps: any[] }> = {
  eda_starter: {
    name: "EDA Starter", icon: "🔍", desc: "Explore any dataset in 5 steps",
    steps: [
      { tool: "detect_missing_values", label: "Detect Missing Values", args: {}, reason: "Identify columns with missing data.", category: "cleaning" },
      { tool: "data_quality_report", label: "Data Quality Report", args: {}, reason: "Get a full data quality overview.", category: "eda" },
      { tool: "dataset_overview", label: "Dataset Overview", args: {}, reason: "Understand shape and distributions.", category: "eda" },
      { tool: "correlation_analysis", label: "Correlation Analysis", args: {}, reason: "Find relationships between numeric columns.", category: "eda" },
      { tool: "create_correlation_heatmap", label: "Correlation Heatmap", args: {}, reason: "Visualize all correlations at once.", category: "visualization" },
    ],
  },
  clean_scale_model: {
    name: "Clean → Scale → AutoML", icon: "🚀", desc: "Full DS pipeline: clean, encode, scale, then train",
    steps: [
      { tool: "detect_missing_values", label: "Detect Missing Values", args: {}, reason: "Find columns needing imputation.", category: "cleaning" },
      { tool: "remove_duplicates", label: "Remove Duplicates", args: {}, reason: "Ensure unique rows before training.", category: "cleaning" },
      { tool: "remove_outliers", label: "Remove Outliers", args: { column: "" }, reason: "Remove extreme outliers using IQR method.", category: "cleaning" },
      { tool: "one_hot_encode", label: "One-Hot Encoding", args: { columns_to_encode: "", drop_first: "true" }, reason: "Encode categorical columns to numeric.", category: "preprocessing" },
      { tool: "standard_scaler", label: "Standard Scaler", args: { columns_to_scale: "" }, reason: "Standardize features before training.", category: "preprocessing" },
      { tool: "auto_ml_pipeline", label: "AutoML Pipeline", args: { target_column: "", cv_folds: "5", include_preprocessing: "true" }, reason: "Train models on the fully cleaned & scaled dataset.", category: "modeling" },
      { tool: "feature_importance", label: "Feature Importance", args: { target_column: "" }, reason: "Rank features by predictive power.", category: "modeling" },
    ],
  },
  advanced_ml: {
    name: "Advanced ML (PCA + Tuning)", icon: "🧠", desc: "PCA reduction, hyperparam search, cross-validation",
    steps: [
      { tool: "detect_missing_values", label: "Detect Missing Values", args: {}, reason: "Check what needs fixing.", category: "cleaning" },
      { tool: "remove_duplicates", label: "Remove Duplicates", args: {}, reason: "Clean before feature engineering.", category: "cleaning" },
      { tool: "one_hot_encode", label: "One-Hot Encoding", args: { columns_to_encode: "", drop_first: "true" }, reason: "Encode categoricals.", category: "preprocessing" },
      { tool: "standard_scaler", label: "Standard Scaler", args: { columns_to_scale: "" }, reason: "Required before PCA and SVM.", category: "preprocessing" },
      { tool: "pca_transform", label: "PCA Reduction", args: { n_components: "8", target_column: "" }, reason: "Reduce dimensions, remove multicollinearity.", category: "preprocessing" },
      { tool: "auto_ml_pipeline", label: "AutoML Pipeline", args: { target_column: "", cv_folds: "5", include_preprocessing: "true" }, reason: "Train all models on PCA-transformed data.", category: "modeling" },
      { tool: "hyperparameter_tune", label: "Hyperparameter Tuning", args: { target_column: "", model: "random_forest", cv_folds: "5" }, reason: "Grid search for optimal model settings.", category: "modeling" },
      { tool: "cross_validate_model", label: "Cross-Validation", args: { target_column: "", model: "random_forest", cv_folds: "10" }, reason: "Get robust performance estimates via k-fold.", category: "modeling" },
    ],
  },
  viz_deep_dive: {
    name: "Visualization Pack", icon: "📊", desc: "Explore your data visually",
    steps: [
      { tool: "dataset_overview", label: "Dataset Overview", args: {}, reason: "Understand which columns to visualize.", category: "eda" },
      { tool: "create_correlation_heatmap", label: "Correlation Heatmap", args: {}, reason: "See all numeric relationships at once.", category: "visualization" },
      { tool: "create_box_plot", label: "Box Plot (Outlier Check)", args: {}, reason: "Spot outliers visually.", category: "visualization" },
      { tool: "correlation_analysis", label: "Correlation Analysis", args: {}, reason: "Find the strongest numeric correlations.", category: "eda" },
    ],
  },
};

function TemplateModal({ onSelect, onClose }: { onSelect: (steps: any[]) => void; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(6px)", zIndex: 999, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <motion.div initial={{ scale: 0.93, y: 16 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.93 }} onClick={e => e.stopPropagation()}
        style={{ background: C.card, borderRadius: 18, border: `1px solid ${C.borderMd}`, width: "100%", maxWidth: 480 }}>
        <div style={{ padding: "20px 22px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ fontFamily: C.head, fontSize: "1rem", fontWeight: 700, color: C.text, marginBottom: 4 }}>Pipeline Templates</div>
          <div style={{ fontSize: 12, color: C.textSub }}>Start with a curated workflow — customise after loading.</div>
        </div>
        <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(TEMPLATES).map(([id, tmpl]) => (
            <button key={id} onClick={() => onSelect(tmpl.steps)}
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: C.input, border: `1px solid ${C.border}`, borderRadius: 10, cursor: "pointer", textAlign: "left", transition: "all 0.15s" }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = C.cyan + "55"; (e.currentTarget as HTMLElement).style.background = `${C.cyan}08`; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = C.border; (e.currentTarget as HTMLElement).style.background = C.input; }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: `${C.cyan}15`, border: `1px solid ${C.cyan}30`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, flexShrink: 0 }}>{tmpl.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: C.head, marginBottom: 2 }}>{tmpl.name}</div>
                <div style={{ fontSize: 11, color: C.textSub, marginBottom: 4 }}>{tmpl.desc}</div>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                  {tmpl.steps.map((s, i) => <span key={i} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 4, background: `${CAT_COLOR[s.category]}18`, color: CAT_COLOR[s.category], fontFamily: C.mono }}>{s.label}</span>)}
                </div>
              </div>
              <span style={{ color: C.cyan, fontSize: 18, opacity: 0.6 }}>→</span>
            </button>
          ))}
        </div>
        <div style={{ padding: "12px 20px", borderTop: `1px solid ${C.border}`, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "6px 16px", borderRadius: 7, border: `1px solid ${C.border}`, background: "transparent", color: C.textSub, fontSize: 12, cursor: "pointer", fontFamily: C.sans }}>Cancel</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

/* ── MAIN PipelineBuilder ───────────────────────────────────────── */
export default function PipelineBuilder({ onSaved, initialPipeline }: PipelineBuilderProps) {
  const isEditing = !!initialPipeline;

  // If editing, skip the upload phase and restore existing data
  const [phase, setPhase] = useState<"upload" | "build" | "run" | "done">(
    isEditing ? "build" : "upload"
  );
  const [sessionId, setSessionId] = useState<string | null>(
    initialPipeline?.sessionId ?? null
  );
  const [datasetMeta, setDatasetMeta] = useState(
    initialPipeline?.metadata?.datasetMeta ?? ""
  );
  const [datasetLabel, setDatasetLabel] = useState(
    isEditing ? (initialPipeline?.name?.replace(/^Pipeline\s*[–-]\s*/i, "") || "") : ""
  );
  const [datasetCols, setDatasetCols] = useState<DatasetColumns>(() => {
    // Try to parse columns from stored datasetMeta
    const meta = initialPipeline?.metadata?.datasetMeta ?? "";
    const numMatch = meta.match(/Numeric columns:\s*([^\n]+)/);
    const catMatch = meta.match(/Categorical columns:\s*([^\n]+)/);
    const numericCols = numMatch ? numMatch[1].split(",").map((c: string) => c.trim()).filter(Boolean) : [];
    const categoricalCols = catMatch ? catMatch[1].split(",").map((c: string) => c.trim()).filter((c: string) => c !== "none") : [];
    return {
      all: [...numericCols, ...categoricalCols],
      numeric: numericCols,
      categorical: categoricalCols,
    };
  });

  // Restore steps from the saved pipeline
  const [steps, setSteps] = useState<PipelineStep[]>(() => {
    if (!initialPipeline?.steps?.length) return [];
    return initialPipeline.steps.map((s: any, i: number) => ({
      id: s.id || `step-restored-${Date.now()}-${i}`,
      tool: s.tool,
      label: s.label,
      args: s.args || {},
      reason: s.reason || "",
      category: s.category || "eda",
      status: "pending" as const,  // always reset to pending when re-opening
    }));
  });

  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [loadingSuggest, setLoadingSuggest] = useState(false);
  const [pipelineName, setPipelineName] = useState(initialPipeline?.name ?? "My Pipeline");
  const [pipelineId, setPipelineId] = useState<string | null>(initialPipeline?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  const [runningFromIdx, setRunningFromIdx] = useState<number | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [rightTab, setRightTab] = useState<"ai" | "advanced">("ai");

  // Restore session + columns from backend when editing
  useEffect(() => {
    if (!isEditing || !initialPipeline?.sessionId) return;
    fetch(`/api/agent/session/${initialPipeline.sessionId}/metadata`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.found) return;
        const meta = data.metadata;
        const numericCols: string[] = meta.numeric_columns || [];
        const categoricalCols: string[] = meta.categorical_columns || [];
        setDatasetCols({ all: [...numericCols, ...categoricalCols], numeric: numericCols, categorical: categoricalCols });
        setDatasetLabel(meta.filename || datasetLabel);
        const metaSummary = [
          `Filename: ${meta.filename}`,
          `Rows: ${meta.row_count?.toLocaleString()}, Columns: ${meta.column_count}`,
          `Size: ${meta.memory_usage_mb} MB`,
          `Numeric columns: ${numericCols.join(", ") || "none"}`,
          `Categorical columns: ${categoricalCols.join(", ") || "none"}`,
        ].join("\n");
        setDatasetMeta(metaSummary);
      })
      .catch(() => { });
  }, [isEditing, initialPipeline?.sessionId]);

  // Auto-fetch suggestions when editing (so panel is populated)
  useEffect(() => {
    if (isEditing && datasetMeta) {
      fetchSuggestions(steps, datasetMeta, "");
    }
  }, [isEditing, datasetMeta]);

  const fileRef = useRef<HTMLInputElement>(null);
  const stepsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (stepsEndRef.current && steps.length > 0)
      stepsEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [steps.length]);

  /* upload */
  const handleUpload = async (file: File) => {
    if (!file.name.endsWith(".csv")) return;
    setUploading(true);
    try {
      const fd = new FormData(); fd.append("file", file);
      const res = await fetch("/api/agent/upload", { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      const data = await res.json();
      const meta = data.metadata;
      setSessionId(data.session_id);
      setDatasetLabel(meta.filename);

      // Parse column names for smart dropdowns
      const numericCols: string[] = meta.numeric_columns || [];
      const categoricalCols: string[] = meta.categorical_columns || [];
      setDatasetCols({
        all: [...numericCols, ...categoricalCols],
        numeric: numericCols,
        categorical: categoricalCols,
      });

      const metaSummary = [
        `Filename: ${meta.filename}`,
        `Rows: ${meta.row_count?.toLocaleString()}, Columns: ${meta.column_count}`,
        `Size: ${meta.memory_usage_mb} MB`,
        `Numeric columns: ${numericCols.join(", ") || "none"}`,
        `Categorical columns: ${categoricalCols.join(", ") || "none"}`,
      ].join("\n");
      setDatasetMeta(metaSummary);
      setPipelineName(`Pipeline – ${meta.filename}`);
      setPhase("build");
      await fetchSuggestions([], metaSummary, "Dataset just uploaded.");
    } catch (e) { console.error(e); }
    finally { setUploading(false); }
  };

  /* suggestions */
  const fetchSuggestions = async (currentSteps: PipelineStep[], meta: string, lastResult: string) => {
    setLoadingSuggest(true); setSuggestions([]);
    try {
      const res = await fetch("/api/pipelines/suggest", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completedSteps: currentSteps.map(s => ({ tool: s.tool, label: s.label })), datasetMeta: meta, lastResult }),
      });
      const data = await res.json();
      const existing = new Set(currentSteps.map(s => s.tool));
      setSuggestions((data.suggestions || []).filter((s: any) => !existing.has(s.tool)));
    } catch (e) { console.error(e); }
    finally { setLoadingSuggest(false); }
  };

  const addStep = (suggestion: any) => {
    setSteps(prev => [...prev, {
      id: `step-${Date.now()}-${Math.random()}`, tool: suggestion.tool, label: suggestion.label,
      args: suggestion.args || {}, reason: suggestion.reason, category: suggestion.category, status: "pending",
    }]);
    setSuggestions(prev => prev.filter(s => s.tool !== suggestion.tool));
  };

  const loadTemplate = (templateSteps: any[]) => {
    setSteps(templateSteps.map((s, i) => ({ ...s, id: `step-tmpl-${Date.now()}-${i}`, status: "pending" as const })));
    setShowTemplates(false);
  };

  const removeStep = (id: string) => setSteps(prev => prev.filter(s => s.id !== id));
  const updateArg = (stepId: string, key: string, value: string) =>
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, args: { ...s.args, [key]: value } } : s));

  /* AI summary */
  const generateSummary = async (stepId: string) => {
    const step = steps.find(s => s.id === stepId);
    if (!step?.result) return;
    setSteps(prev => prev.map(s => s.id === stepId ? { ...s, loadingSummary: true } : s));
    try {
      const res = await fetch("/api/llm/run", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            { role: "system", content: "You are a data science assistant. Explain the result of a pipeline step in 2-3 plain English sentences. Be specific about numbers. No markdown, no bullet points — just a clean paragraph a business user can understand." },
            { role: "user", content: `Step: ${step.label}\nTool: ${step.tool}\nResult: ${JSON.stringify(step.result).slice(0, 1000)}\n\nExplain what this means for the dataset.` },
          ],
        }),
      });
      const data = await res.json();
      let text = "";
      for (const item of (data?.output || [])) {
        for (const block of (item?.content || [])) {
          if (block.type === "output_text") text += block.text || "";
        }
      }
      if (!text) text = data?.content?.[0]?.text || "";
      setSteps(prev => prev.map(s => s.id === stepId ? { ...s, aiSummary: text, loadingSummary: false } : s));
    } catch {
      setSteps(prev => prev.map(s => s.id === stepId ? { ...s, loadingSummary: false } : s));
    }
  };

  /* save */
  const savePipelineToDb = async (currentSteps: PipelineStep[], status: string, existingId?: string | null): Promise<string | null> => {
    try {
      const payload = currentSteps.map(s => ({ tool: s.tool, label: s.label, args: s.args, category: s.category, reason: s.reason }));
      if (!existingId) {
        const res = await fetch("/api/pipelines", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: pipelineName, sessionId, metadata: { datasetMeta } }) });
        const data = await res.json();
        const newId = data.pipeline?.id;
        if (!newId) return null;
        await fetch(`/api/pipelines/${newId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ steps: payload, status }) });
        setPipelineId(newId); onSaved?.(newId); return newId;
      } else {
        await fetch(`/api/pipelines/${existingId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: pipelineName, steps: payload, status }) });
        return existingId;
      }
    } catch { return null; }
  };

  const handleManualSave = async () => {
    if (!steps.length) return;
    setSaving(true); setSaveMsg(null);
    const id = await savePipelineToDb(steps, phase === "done" ? "completed" : "draft", pipelineId);
    setSaving(false); setSaveMsg(id ? "Saved ✓" : "Failed");
    setTimeout(() => setSaveMsg(null), 2000);
  };

  const saveRunHistory = async (pid: string, results: any[]) => {
    try {
      await fetch(`/api/pipelines/${pid}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessionId, stepResults: results }) });
    } catch { }
  };

  /* run loop */
  const runStepsFrom = async (startIdx: number) => {
    if (!sessionId) return;
    setPhase("run"); setRunningFromIdx(startIdx);
    const snapshot = [...steps];
    setSteps(prev => prev.map((s, i) => i >= startIdx ? { ...s, status: "pending", result: undefined, imageBase64: undefined, errorMsg: undefined, aiSummary: undefined } : s));
    const runResults: any[] = [];
    for (let i = startIdx; i < snapshot.length; i++) {
      setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: "running" } : s));
      const step = snapshot[i];
      const args: Record<string, any> = { session_id: sessionId };
      for (const [k, v] of Object.entries(step.args)) { if (String(v).trim() !== "") args[k] = v; }
      try {
        const res = await fetch("/api/agent/tools", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tool_name: step.tool, arguments: args }) });
        const result = await res.json();
        const img64 = result?.output?.image_base64 || result?.output?.chart_base64;
        const clean = result.output ? Object.fromEntries(Object.entries(result.output).filter(([k]) => k !== "image_base64" && k !== "chart_base64")) : null;
        const errMsg = result.success ? undefined : (result.error || result.details || "Tool failed");
        setSteps(prev => prev.map((s, idx) => idx === i ? {
          ...s, status: result.success ? "done" : "error", result: clean,
          imageBase64: img64 ? (img64.startsWith("data:") ? img64 : `data:image/png;base64,${img64}`) : undefined,
          executionMs: result.execution_time_ms, errorMsg: errMsg,
        } : s));
        if (result.success) setExpandedResult(step.id);
        runResults.push({ tool: step.tool, success: result.success, executionMs: result.execution_time_ms, errorMsg: errMsg });
        await new Promise(r => setTimeout(r, 200));
      } catch (err: any) {
        setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, status: "error", errorMsg: err.message } : s));
        runResults.push({ tool: step.tool, success: false, errorMsg: err.message });
      }
    }
    setRunningFromIdx(null); setPhase("done");
    const finalId = await savePipelineToDb(snapshot, "completed", pipelineId);
    if (finalId) { setPipelineId(finalId); await saveRunHistory(finalId, runResults); }
  };

  const runAll = async () => { const id = await savePipelineToDb(steps, "running", pipelineId); if (id) setPipelineId(id); await runStepsFrom(0); };
  const runFrom = async (idx: number) => { const id = await savePipelineToDb(steps, "running", pipelineId); if (id) setPipelineId(id); await runStepsFrom(idx); };
  const resetAll = () => { setSteps(prev => prev.map(s => ({ ...s, status: "pending", result: undefined, imageBase64: undefined, errorMsg: undefined, aiSummary: undefined }))); setPhase("build"); setRunningFromIdx(null); };
  const getLastResultSummary = () => { const last = [...steps].reverse().find(s => s.status === "done"); return last?.result ? JSON.stringify(last.result).slice(0, 400) : ""; };

  const doneCount = steps.filter(s => s.status === "done").length;
  const errCount = steps.filter(s => s.status === "error").length;
  const isRunning = phase === "run";

  /* ── UPLOAD PHASE — only shown for new pipelines ── */
  if (phase === "upload") {
    return (
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 24 }}>
        <div style={{ textAlign: "center" }}>
          <h2 style={{ fontFamily: C.head, fontSize: "1.4rem", fontWeight: 700, color: C.text, marginBottom: 8, letterSpacing: "-0.03em" }}>Build a Pipeline</h2>
          <p style={{ fontSize: 12.5, color: C.textSub, maxWidth: 420, lineHeight: 1.65 }}>
            Upload a CSV — DSAgent will suggest cleaning, analysis, visualisation and modelling steps. Results are explained in plain English.
          </p>
        </div>
        <div onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files[0]; if (f) handleUpload(f); }}
          onClick={() => fileRef.current?.click()}
          style={{ width: "100%", maxWidth: 460, border: `2px dashed ${dragOver ? C.cyan : C.borderMd}`, borderRadius: 18, padding: "52px 32px", textAlign: "center", cursor: uploading ? "default" : "pointer", background: dragOver ? `${C.cyan}06` : C.card, transition: "all 0.2s" }}>
          {uploading ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
              <div style={{ width: 34, height: 34, border: `3px solid ${C.cyan}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <span style={{ fontSize: 13, color: C.textSub }}>Uploading & analysing…</span>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📂</div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.cyan, marginBottom: 6 }}>Drop your CSV here</div>
              <div style={{ fontSize: 11, color: C.textMute }}>or click to browse</div>
            </>
          )}
        </div>
        <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ height: 1, width: 80, background: C.border }} />
          <span style={{ fontSize: 11, color: C.textMute }}>or start from a template</span>
          <div style={{ height: 1, width: 80, background: C.border }} />
        </div>
        <button onClick={() => { setDatasetMeta(""); setDatasetLabel("Template"); setPipelineName("New Pipeline"); setPhase("build"); setShowTemplates(true); }}
          style={{ padding: "9px 22px", borderRadius: 9, border: `1px solid ${C.borderMd}`, background: "transparent", color: C.text, fontSize: 12, fontWeight: 600, fontFamily: C.head, cursor: "pointer", transition: "all 0.15s" }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = C.cardHover; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = "transparent"; }}>
          📋 Browse Templates →
        </button>
        <AnimatePresence>{showTemplates && <TemplateModal onSelect={loadTemplate} onClose={() => setShowTemplates(false)} />}</AnimatePresence>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </motion.div>
    );
  }

  /* ── BUILD / RUN / DONE ── */
  return (
    <div style={{ display: "flex", gap: 16, height: "100%", overflow: "hidden" }}>
      {/* LEFT: pipeline canvas */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 10, minWidth: 0, overflow: "hidden" }}>

        {/* Toolbar */}
        <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "10px 14px", background: C.card, borderRadius: 11, border: `1px solid ${C.border}`, flexShrink: 0, flexWrap: "wrap" }}>
          <input value={pipelineName} onChange={e => setPipelineName(e.target.value)}
            style={{ background: "transparent", border: "none", outline: "none", color: C.text, fontFamily: C.head, fontSize: 13, fontWeight: 600, flex: 1, minWidth: 100 }} />
          {/* Dataset label / Upload CSV */}
          {datasetLabel ? (
            <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, background: `${C.cyan}15`, color: C.cyan, border: `1px solid ${C.cyan}30`, fontFamily: C.mono, flexShrink: 0 }}>{datasetLabel}</span>
          ) : (
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={{ fontSize: 10, padding: "4px 10px", borderRadius: 5, background: `${C.amber}12`, color: C.amber, border: `1px solid ${C.amber}30`, fontFamily: C.mono, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", gap: 4 }}
              title="Upload a CSV to enable column dropdowns and AI suggestions"
            >
              {uploading ? "⏳ Uploading…" : "📂 Upload CSV to run"}
            </button>
          )}
          <input ref={fileRef} type="file" accept=".csv" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ""; }} />
          <span style={{ fontSize: 10, padding: "3px 8px", borderRadius: 5, fontFamily: C.mono, fontWeight: 600, flexShrink: 0, background: phase === "done" ? `${C.green}20` : isRunning ? `${C.amber}20` : `${C.violet}15`, color: phase === "done" ? C.green : isRunning ? C.amber : C.violet, border: `1px solid ${phase === "done" ? C.green + "40" : isRunning ? C.amber + "40" : C.violet + "30"}` }}>
            {phase === "done" ? `✓ ${doneCount}/${steps.length}` : isRunning ? `Running… ${doneCount}/${steps.length}` : `${steps.length} steps`}
          </span>

          {/* Reorder hint */}
          {!isRunning && steps.length > 1 && (
            <span style={{ fontSize: 10, color: C.textMute, fontFamily: C.mono, display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ fontSize: 12 }}>⠿</span> drag to reorder
            </span>
          )}

          {!isRunning && (
            <button onClick={() => setShowTemplates(true)}
              style={{ padding: "5px 10px", borderRadius: 6, border: `1px solid ${C.border}`, background: "transparent", color: C.textSub, fontSize: 11, fontFamily: C.sans, cursor: "pointer", flexShrink: 0, transition: "all 0.15s" }}
              onMouseEnter={e => (e.currentTarget.style.color = C.text)} onMouseLeave={e => (e.currentTarget.style.color = C.textSub)}>
              📋 Templates
            </button>
          )}
          {phase === "done" && (
            <button onClick={() => setShowExport(true)}
              style={{ padding: "5px 11px", borderRadius: 6, border: `1px solid ${C.green}33`, background: `${C.green}10`, color: C.green, fontSize: 11, fontFamily: C.sans, cursor: "pointer", flexShrink: 0 }}>
              ↓ Export
            </button>
          )}
          <button onClick={handleManualSave} disabled={saving || !steps.length}
            style={{ padding: "5px 11px", borderRadius: 6, border: `1px solid ${C.borderMd}`, background: saveMsg === "Saved ✓" ? `${C.green}20` : "transparent", color: saveMsg === "Saved ✓" ? C.green : C.textSub, fontSize: 11, fontFamily: C.sans, cursor: !steps.length ? "not-allowed" : "pointer", opacity: !steps.length ? 0.4 : 1, transition: "all 0.2s", flexShrink: 0 }}>
            {saving ? "…" : saveMsg || "💾 Save"}
          </button>
          {!isRunning && (
            <button onClick={runAll} disabled={!steps.length || !sessionId}
              title={!sessionId ? "Upload a CSV first to run this pipeline" : undefined}
              style={{ padding: "6px 16px", borderRadius: 7, border: "none", background: (!steps.length || !sessionId) ? C.border : `linear-gradient(135deg, ${C.cyan}, #0099CC)`, color: (!steps.length || !sessionId) ? C.textMute : "#030712", fontSize: 11, fontWeight: 700, fontFamily: C.head, cursor: (!steps.length || !sessionId) ? "not-allowed" : "pointer", flexShrink: 0 }}>
              {!sessionId ? "⚠ Upload CSV first" : "▶ Run All"}
            </button>
          )}
          {(phase === "done" || isRunning) && (
            <button onClick={resetAll} disabled={isRunning}
              style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${C.borderMd}`, background: "transparent", color: C.text, fontSize: 11, fontWeight: 600, fontFamily: C.head, cursor: isRunning ? "not-allowed" : "pointer", opacity: isRunning ? 0.5 : 1, flexShrink: 0 }}>
              ↺ Reset
            </button>
          )}
        </div>

        {/* Session-lost warning for editing mode without active dataset */}
        {isEditing && !sessionId && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: "10px 14px", background: `${C.amber}0D`, borderRadius: 9, border: `1px solid ${C.amber}33`, flexShrink: 0, display: "flex", alignItems: "center", gap: 10 }}
          >
            <span style={{ fontSize: 14 }}>⚠️</span>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, fontWeight: 600, color: C.amber, fontFamily: C.head, marginBottom: 2 }}>Dataset not loaded</div>
              <div style={{ fontSize: 10, color: C.textSub, fontFamily: C.mono }}>
                The original dataset session has expired. Upload the CSV again to run steps and get column dropdowns.
              </div>
            </div>
            <button
              onClick={() => fileRef.current?.click()}
              style={{ padding: "5px 12px", borderRadius: 6, border: `1px solid ${C.amber}44`, background: `${C.amber}15`, color: C.amber, fontSize: 10, fontFamily: C.mono, cursor: "pointer", flexShrink: 0 }}
            >
              Upload CSV →
            </button>
          </motion.div>
        )}

        {/* Session restored success banner */}
        {isEditing && sessionId && datasetLabel && (
          <motion.div
            initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: "8px 14px", background: `${C.green}0A`, borderRadius: 9, border: `1px solid ${C.green}28`, flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}
          >
            <span style={{ fontSize: 12 }}>✅</span>
            <span style={{ fontSize: 10, color: C.green, fontFamily: C.mono }}>
              Dataset <strong>{datasetLabel}</strong> loaded — {datasetCols.all.length} columns available · {steps.length} steps restored
            </span>
          </motion.div>
        )}

        {/* Progress bar */}
        {isRunning && (
          <div style={{ padding: "8px 14px", background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5, fontSize: 10, color: C.textSub, fontFamily: C.mono }}>
              <span>Running…</span>
              <span>{doneCount + errCount}/{steps.length} · {errCount > 0 ? `${errCount} error(s)` : "no errors"}</span>
            </div>
            <div style={{ height: 3, background: C.border, borderRadius: 2, overflow: "hidden" }}>
              <motion.div style={{ height: "100%", background: `linear-gradient(90deg,${C.cyan},${C.violet})`, borderRadius: 2 }}
                animate={{ width: `${((doneCount + errCount) / steps.length) * 100}%` }} transition={{ duration: 0.4 }} />
            </div>
          </div>
        )}


        {/* Done banner */}
        {phase === "done" && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
            style={{ padding: "10px 14px", background: `${C.green}0A`, borderRadius: 9, border: `1px solid ${C.green}28`, flexShrink: 0, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <span>✅</span>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.green, fontFamily: C.head }}>Pipeline complete</span>
            <span style={{ fontSize: 10, color: C.textSub, fontFamily: C.mono }}>{doneCount} ok · {errCount} failed</span>
            <span style={{ flex: 1 }} />
            <button onClick={() => fetchSuggestions(steps, datasetMeta, getLastResultSummary())}
              style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${C.cyan}33`, background: `${C.cyan}10`, color: C.cyan, fontSize: 10, fontFamily: C.mono, cursor: "pointer" }}>
              Get next steps →
            </button>
            <button onClick={() => setShowExport(true)}
              style={{ padding: "4px 10px", borderRadius: 5, border: `1px solid ${C.green}44`, background: `${C.green}12`, color: C.green, fontSize: 10, fontFamily: C.mono, cursor: "pointer" }}>
              ↓ Export results
            </button>
          </motion.div>
        )}

        {/* ── Steps list with Reorder ── */}
        <div style={{ flex: 1, overflowY: "auto", paddingRight: 2, scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent` }}>
          {steps.length === 0 ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: C.textMute, fontSize: 12, gap: 10, minHeight: 200 }}>
              <div style={{ fontSize: 32 }}>⚡</div>
              <div>Add steps from the suggestions panel →</div>
              <button onClick={() => setShowTemplates(true)}
                style={{ padding: "7px 16px", borderRadius: 8, border: `1px solid ${C.borderMd}`, background: "transparent", color: C.textSub, fontSize: 11, cursor: "pointer", fontFamily: C.sans }}>
                or load a template
              </button>
            </div>
          ) : (
            <Reorder.Group
              axis="y"
              values={steps}
              onReorder={(newOrder) => {
                if (!isRunning) setSteps(newOrder);
              }}
              style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", padding: 0, margin: 0 }}
              as="div"
            >
              <AnimatePresence>
                {steps.map((step, idx) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    idx={idx}
                    phase={phase}
                    isRunning={isRunning}
                    expanded={expandedResult === step.id}
                    onToggleExpand={() => setExpandedResult(expandedResult === step.id ? null : step.id)}
                    onRemove={() => removeStep(step.id)}
                    onUpdateArg={(k, v) => updateArg(step.id, k, v)}
                    onRunFrom={() => runFrom(idx)}
                    onGenerateSummary={() => generateSummary(step.id)}
                    datasetCols={datasetCols}
                  />
                ))}
              </AnimatePresence>
              <div ref={stepsEndRef} style={{ height: 1 }} />
            </Reorder.Group>
          )}
        </div>
      </div>

      {/* RIGHT: suggestions + advanced tools panel */}
      <div style={{ width: 300, flexShrink: 0, display: "flex", flexDirection: "column", gap: 8, overflow: "hidden" }}>

        {/* Tab header */}
        <div style={{ display: "flex", gap: 0, background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, overflow: "hidden", flexShrink: 0 }}>
          {(["ai", "advanced"] as const).map(tab => (
            <button key={tab} onClick={() => setRightTab(tab)}
              style={{ flex: 1, padding: "9px 6px", background: rightTab === tab ? `${C.cyan}12` : "transparent", border: "none", borderBottom: rightTab === tab ? `2px solid ${C.cyan}` : "2px solid transparent", color: rightTab === tab ? C.cyan : C.textMute, fontSize: 10, fontFamily: C.mono, fontWeight: 600, cursor: "pointer", transition: "all 0.15s", letterSpacing: "0.04em" }}>
              {tab === "ai" ? "🤖 AI Suggestions" : "⚙️ Advanced Tools"}
            </button>
          ))}
        </div>

        {/* AI Suggestions tab */}
        {rightTab === "ai" && (
          <>
            <div style={{ padding: "8px 12px", background: C.card, borderRadius: 8, border: `1px solid ${C.border}`, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 10, color: C.textMute }}>Context-aware suggestions</span>
              <button onClick={() => fetchSuggestions(steps, datasetMeta, getLastResultSummary())} disabled={loadingSuggest}
                style={{ background: "none", border: `1px solid ${C.borderMd}`, borderRadius: 5, padding: "3px 8px", color: C.cyan, fontSize: 10, fontFamily: C.mono, cursor: "pointer", opacity: loadingSuggest ? 0.5 : 1 }}>
                {loadingSuggest ? "…" : "↻ Refresh"}
              </button>
            </div>
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 7, scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent` }}>
              {loadingSuggest && [1, 2, 3].map(i => <div key={i} style={{ height: 80, borderRadius: 10, background: C.card, border: `1px solid ${C.border}`, opacity: 0.3 + i * 0.1 }} />)}
              {!loadingSuggest && !suggestions.length && (
                <div style={{ padding: 14, textAlign: "center", color: C.textMute, fontSize: 11, background: C.card, borderRadius: 10, border: `1px solid ${C.border}` }}>
                  {phase === "done" ? "✓ Done. Click ↻ for more steps." : "No suggestions yet. Click ↻ to refresh."}
                </div>
              )}
              <AnimatePresence>
                {suggestions.map((s, i) => <SuggestionCard key={s.tool + i} suggestion={s} onAdd={() => addStep(s)} disabled={isRunning} />)}
              </AnimatePresence>
            </div>
          </>
        )}

        {/* Advanced Tools tab */}
        {rightTab === "advanced" && (
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5, scrollbarWidth: "thin", scrollbarColor: `${C.border} transparent` }}>
            {/* Group by category */}
            {(["preprocessing", "cleaning", "modeling"] as const).map(cat => {
              const tools = Object.entries(ADVANCED_TOOLS).filter(([, t]) => t.category === cat);
              if (!tools.length) return null;
              const catColor = CAT_COLOR[cat] || C.textSub;
              return (
                <div key={cat}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: catColor, fontFamily: C.mono, letterSpacing: "0.09em", textTransform: "uppercase", padding: "6px 2px 4px", display: "flex", alignItems: "center", gap: 5 }}>
                    <span>{CAT_ICON[cat]}</span> {cat}
                  </div>
                  {tools.map(([toolKey, tool]) => {
                    const alreadyAdded = steps.some(s => s.tool === toolKey);
                    return (
                      <motion.div key={toolKey}
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                        onClick={() => !isRunning && !alreadyAdded && addStep({ tool: toolKey, label: tool.label, args: { ...tool.args }, reason: tool.reason, category: tool.category })}
                        style={{
                          padding: "9px 11px", borderRadius: 8, background: alreadyAdded ? `${catColor}0A` : C.card,
                          border: `1px solid ${alreadyAdded ? catColor + "30" : C.border}`,
                          cursor: isRunning || alreadyAdded ? "default" : "pointer",
                          opacity: alreadyAdded ? 0.6 : 1,
                          transition: "all 0.13s",
                        }}
                        whileHover={!isRunning && !alreadyAdded ? { borderColor: catColor + "66", backgroundColor: `${catColor}0D` } : {}}
                      >
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 7 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: alreadyAdded ? catColor : C.text, fontFamily: C.head, marginBottom: 2, display: "flex", alignItems: "center", gap: 5 }}>
                              {tool.label}
                              {alreadyAdded && <span style={{ fontSize: 8, color: catColor, fontFamily: C.mono }}>✓ added</span>}
                            </div>
                            <div style={{ fontSize: 9.5, color: C.textMute, lineHeight: 1.5 }}>{tool.reason.split(".")[0]}.</div>
                          </div>
                          {!alreadyAdded && !isRunning && (
                            <span style={{ fontSize: 14, color: catColor, opacity: 0.5, flexShrink: 0, marginTop: 1 }}>+</span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        {/* Column reference — always shown at bottom */}
        {datasetCols.all.length > 0 && (
          <div style={{ padding: "10px 12px", background: C.card, borderRadius: 10, border: `1px solid ${C.border}`, flexShrink: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: C.textMute, marginBottom: 6, fontFamily: C.mono, letterSpacing: "0.07em" }}>DATASET COLUMNS</div>
            {datasetCols.numeric.length > 0 && (
              <div style={{ marginBottom: 5 }}>
                <div style={{ fontSize: 9, color: C.cyan, fontFamily: C.mono, marginBottom: 3 }}># numeric ({datasetCols.numeric.length})</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {datasetCols.numeric.map(c => <span key={c} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: `${C.cyan}12`, color: C.cyan, fontFamily: C.mono }}>{c}</span>)}
                </div>
              </div>
            )}
            {datasetCols.categorical.length > 0 && (
              <div>
                <div style={{ fontSize: 9, color: C.violet, fontFamily: C.mono, marginBottom: 3 }}>A categorical ({datasetCols.categorical.length})</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 3 }}>
                  {datasetCols.categorical.map(c => <span key={c} style={{ fontSize: 9, padding: "1px 5px", borderRadius: 3, background: `${C.violet}12`, color: C.violet, fontFamily: C.mono }}>{c}</span>)}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modals */}
      <AnimatePresence>
        {showExport && <ExportModal steps={steps} pipelineName={pipelineName} onClose={() => setShowExport(false)} />}
        {showTemplates && <TemplateModal onSelect={loadTemplate} onClose={() => setShowTemplates(false)} />}
      </AnimatePresence>

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes pls     { 0%,100%{opacity:1} 50%{opacity:0.2} }
        @keyframes dot     { 0%,80%,100%{transform:scale(0.6);opacity:0.3} 40%{transform:scale(1);opacity:1} }
        @keyframes shimmer { 0%,100%{opacity:0.3} 50%{opacity:0.6} }
      `}</style>
    </div>
  );
}