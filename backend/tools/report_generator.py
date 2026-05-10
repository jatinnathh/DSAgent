# backend/tools/report_generator.py
"""
Generate a professional PDF report from autonomous pipeline results.
Uses reportlab for PDF creation with embedded charts, tables, and text.
"""

import os
import io
import base64
import datetime
from typing import Dict, Any, List, Optional
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import inch, mm
from reportlab.lib.colors import HexColor, black, white
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
    Image, PageBreak, HRFlowable
)
from reportlab.platypus.flowables import KeepTogether

REPORTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)

# ── Colors ──
DARK_BG = HexColor("#0A0A0A")
CARD_BG = HexColor("#141414")
CYAN = HexColor("#00D4FF")
VIOLET = HexColor("#8B5CF6")
GREEN = HexColor("#3FB950")
AMBER = HexColor("#F59E0B")
RED = HexColor("#F85149")
TEXT_COLOR = HexColor("#222222")
LIGHT_GRAY = HexColor("#F5F5F5")
MED_GRAY = HexColor("#E0E0E0")
HEADER_BG = HexColor("#1A1A2E")


def _get_styles():
    styles = getSampleStyleSheet()
    styles.add(ParagraphStyle(
        'CoverTitle', parent=styles['Title'],
        fontSize=28, textColor=HexColor("#1A1A2E"),
        spaceAfter=12, alignment=TA_CENTER, fontName='Helvetica-Bold'
    ))
    styles.add(ParagraphStyle(
        'CoverSub', parent=styles['Normal'],
        fontSize=14, textColor=HexColor("#666666"),
        alignment=TA_CENTER, spaceAfter=6
    ))
    styles.add(ParagraphStyle(
        'SectionHead', parent=styles['Heading1'],
        fontSize=18, textColor=HexColor("#1A1A2E"),
        spaceBefore=20, spaceAfter=10, fontName='Helvetica-Bold',
        borderWidth=0, borderPadding=0,
    ))
    styles.add(ParagraphStyle(
        'SubHead', parent=styles['Heading2'],
        fontSize=13, textColor=HexColor("#333333"),
        spaceBefore=12, spaceAfter=6, fontName='Helvetica-Bold',
    ))
    styles.add(ParagraphStyle(
        'BodyText2', parent=styles['Normal'],
        fontSize=10, textColor=TEXT_COLOR,
        leading=15, alignment=TA_JUSTIFY, spaceAfter=6,
    ))
    styles.add(ParagraphStyle(
        'SmallMono', parent=styles['Normal'],
        fontSize=8, textColor=HexColor("#555555"),
        fontName='Courier', leading=11,
    ))
    styles.add(ParagraphStyle(
        'MetricValue', parent=styles['Normal'],
        fontSize=22, textColor=HexColor("#1A1A2E"),
        fontName='Helvetica-Bold', alignment=TA_CENTER,
    ))
    styles.add(ParagraphStyle(
        'MetricLabel', parent=styles['Normal'],
        fontSize=8, textColor=HexColor("#888888"),
        fontName='Helvetica', alignment=TA_CENTER,
    ))
    return styles


def _b64_to_image(b64_str: str, width=5.5*inch, max_height=4*inch) -> Optional[Image]:
    """Convert base64 image string to a reportlab Image flowable."""
    try:
        if b64_str.startswith("data:"):
            b64_str = b64_str.split(",", 1)[1]
        img_data = base64.b64decode(b64_str)
        img_buf = io.BytesIO(img_data)
        img = Image(img_buf, width=width, height=max_height)
        img.hAlign = 'CENTER'
        return img
    except Exception:
        return None


def _make_table(headers: List[str], rows: List[List[str]], col_widths=None) -> Table:
    """Create a styled table."""
    data = [headers] + rows
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), HEADER_BG),
        ('TEXTCOLOR', (0, 0), (-1, 0), white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('BACKGROUND', (0, 1), (-1, -1), white),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [white, LIGHT_GRAY]),
        ('GRID', (0, 0), (-1, -1), 0.5, MED_GRAY),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
    ]))
    return t


def _section_divider():
    return HRFlowable(width="100%", thickness=1, color=MED_GRAY, spaceBefore=8, spaceAfter=8)


def _clean_md(text: str) -> str:
    """Strip markdown formatting so LLM output renders cleanly in PDF."""
    import re
    if not text:
        return ""
    # Remove think tags
    text = re.sub(r'<think>[\s\S]*?</think>', '', text)
    # Headers → just the text
    text = re.sub(r'^#{1,6}\s+', '', text, flags=re.MULTILINE)
    # Bold/italic
    text = re.sub(r'\*{1,3}([^*]+)\*{1,3}', r'\1', text)
    text = re.sub(r'_{1,3}([^_]+)_{1,3}', r'\1', text)
    # Horizontal rules
    text = re.sub(r'^---+$', '', text, flags=re.MULTILINE)
    text = re.sub(r'^===+$', '', text, flags=re.MULTILINE)
    # Inline code
    text = re.sub(r'`([^`]+)`', r'\1', text)
    # Code blocks
    text = re.sub(r'```[\s\S]*?```', '', text)
    # Links [text](url) → text
    text = re.sub(r'\[([^\]]+)\]\([^)]+\)', r'\1', text)
    # Bullet markers → clean dash
    text = re.sub(r'^\s*[-*+]\s+', '• ', text, flags=re.MULTILINE)
    # Numbered list cleanup
    text = re.sub(r'^\s*\d+\.\s+', '', text, flags=re.MULTILINE)
    # Collapse excessive blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _md_to_paragraphs(text: str, style) -> list:
    """Convert cleaned markdown text into a list of Paragraph flowables,
    splitting on double newlines for proper paragraph breaks."""
    cleaned = _clean_md(text)
    if not cleaned:
        return []
    paras = []
    for chunk in cleaned.split('\n\n'):
        chunk = chunk.strip()
        if chunk:
            # Escape any residual XML special chars for reportlab
            chunk = chunk.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')
            paras.append(Paragraph(chunk, style))
            paras.append(Spacer(1, 4))
    return paras


def generate_report(
    report_id: str,
    dataset_name: str,
    session_id: str,
    pipeline_results: Dict[str, Any],
) -> str:
    """
    Generate a PDF report from autonomous pipeline results.
    Returns the file path of the generated PDF.
    """
    styles = _get_styles()
    filepath = os.path.join(REPORTS_DIR, f"{report_id}.pdf")

    doc = SimpleDocTemplate(
        filepath, pagesize=A4,
        topMargin=0.6*inch, bottomMargin=0.6*inch,
        leftMargin=0.7*inch, rightMargin=0.7*inch,
    )

    elements = []

    # ══════════════ COVER PAGE ══════════════
    elements.append(Spacer(1, 1.5*inch))
    elements.append(Paragraph("DSAgent", styles['CoverTitle']))
    elements.append(Paragraph("Autonomous Pipeline Report", styles['CoverSub']))
    elements.append(Spacer(1, 0.3*inch))
    elements.append(HRFlowable(width="40%", thickness=2, color=CYAN, spaceBefore=4, spaceAfter=16))
    elements.append(Paragraph(f"<b>Dataset:</b> {dataset_name}", styles['CoverSub']))
    elements.append(Paragraph(
        f"<b>Generated:</b> {datetime.datetime.now().strftime('%B %d, %Y at %I:%M %p')}",
        styles['CoverSub']
    ))
    elements.append(Paragraph(f"<b>Session:</b> {session_id[:12]}…", styles['CoverSub']))

    # Summary metrics on cover
    phases = pipeline_results.get("phases", {})
    total_steps = sum(len(p.get("steps", [])) for p in phases.values())
    total_time = pipeline_results.get("total_time_ms", 0)
    elements.append(Spacer(1, 0.5*inch))
    summary_data = [
        [str(total_steps), str(len(phases)), f"{total_time/1000:.1f}s"],
        ["Steps Executed", "Phases Completed", "Total Time"],
    ]
    summary_table = Table(summary_data, colWidths=[2*inch, 2*inch, 2*inch])
    summary_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 24),
        ('FONTSIZE', (0, 1), (-1, 1), 8),
        ('TEXTCOLOR', (0, 0), (-1, 0), HEADER_BG),
        ('TEXTCOLOR', (0, 1), (-1, 1), HexColor("#888888")),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
    ]))
    elements.append(summary_table)
    elements.append(PageBreak())

    # ══════════════ SECTION 1: DATASET OVERVIEW ══════════════
    eda_phase = phases.get("eda", {})
    eda_steps = eda_phase.get("steps", [])

    elements.append(Paragraph("1. Dataset Overview", styles['SectionHead']))
    elements.append(_section_divider())

    overview_step = next((s for s in eda_steps if s.get("tool") == "dataset_overview"), None)
    if overview_step and overview_step.get("result"):
        r = overview_step["result"]
        shape = r.get("shape", {})
        elements.append(Paragraph(
            f"The dataset contains <b>{shape.get('rows', '?'):,}</b> rows and "
            f"<b>{shape.get('columns', '?')}</b> columns, using "
            f"<b>{r.get('memory_usage_mb', '?')} MB</b> of memory.",
            styles['BodyText2']
        ))

        # Column types
        col_types = r.get("column_types", {})
        if col_types:
            type_rows = []
            for t, cols in col_types.items():
                if cols:
                    type_rows.append([t.capitalize(), str(len(cols)), ", ".join(cols[:8]) + ("…" if len(cols) > 8 else "")])
            if type_rows:
                elements.append(Spacer(1, 6))
                elements.append(_make_table(["Type", "Count", "Columns"], type_rows, [1.2*inch, 0.8*inch, 4.5*inch]))

        # Numeric summary
        num_summary = r.get("numeric_summary", {})
        if num_summary:
            elements.append(Spacer(1, 10))
            elements.append(Paragraph("Numeric Statistics", styles['SubHead']))
            headers = ["Column", "Mean", "Median", "Std", "Min", "Max"]
            rows = []
            for col, stats in list(num_summary.items())[:15]:
                rows.append([
                    col[:20],
                    f"{stats.get('mean', 0):.2f}",
                    f"{stats.get('median', 0):.2f}",
                    f"{stats.get('std', 0):.2f}",
                    f"{stats.get('min', 0):.2f}",
                    f"{stats.get('max', 0):.2f}",
                ])
            elements.append(_make_table(headers, rows))

    # LLM explanation for EDA
    eda_explanation = eda_phase.get("llm_explanation", "")
    if eda_explanation:
        elements.append(Spacer(1, 10))
        elements.append(Paragraph("AI Analysis", styles['SubHead']))
        elements.extend(_md_to_paragraphs(eda_explanation, styles['BodyText2']))

    elements.append(PageBreak())

    # ══════════════ SECTION 2: DATA QUALITY ══════════════
    elements.append(Paragraph("2. Data Quality Assessment", styles['SectionHead']))
    elements.append(_section_divider())

    missing_step = next((s for s in eda_steps if s.get("tool") == "detect_missing_values"), None)
    if missing_step and missing_step.get("result"):
        r = missing_step["result"]
        elements.append(Paragraph(
            f"Found <b>{r.get('columns_with_missing', 0)}</b> columns with missing values "
            f"out of {r.get('total_rows', '?'):,} rows.",
            styles['BodyText2']
        ))
        missing_data = r.get("missing_data", [])
        if missing_data:
            rows = [[m["column"], str(m["null_count"]), f"{m['null_percentage']}%"] for m in missing_data[:10]]
            elements.append(_make_table(["Column", "Missing Count", "Missing %"], rows))

    quality_step = next((s for s in eda_steps if s.get("tool") == "data_quality_report"), None)
    if quality_step and quality_step.get("result"):
        r = quality_step["result"]
        issues = r.get("potential_issues", [])
        dupes = r.get("duplicates", {})
        if dupes.get("duplicate_rows", 0) > 0:
            elements.append(Paragraph(
                f"Duplicate rows: <b>{dupes['duplicate_rows']}</b> ({dupes.get('duplicate_percentage', 0)}%)",
                styles['BodyText2']
            ))
        if issues:
            elements.append(Paragraph("Potential Issues:", styles['SubHead']))
            for issue in issues:
                elements.append(Paragraph(f"• {issue}", styles['BodyText2']))

    # ══════════════ SECTION 3: CLEANING ══════════════
    clean_phase = phases.get("cleaning", {})
    clean_steps = clean_phase.get("steps", [])
    if clean_steps:
        elements.append(Spacer(1, 10))
        elements.append(Paragraph("3. Data Cleaning Actions", styles['SectionHead']))
        elements.append(_section_divider())
        for step in clean_steps:
            elements.append(Paragraph(f"<b>{step.get('label', step.get('tool', ''))}</b>", styles['SubHead']))
            r = step.get("result", {})
            if isinstance(r, dict):
                for k, v in r.items():
                    if k not in ("image_base64", "chart_base64") and not isinstance(v, (dict, list)):
                        elements.append(Paragraph(f"  {k}: {v}", styles['SmallMono']))
        clean_explanation = clean_phase.get("llm_explanation", "")
        if clean_explanation:
            elements.extend(_md_to_paragraphs(clean_explanation, styles['BodyText2']))

    elements.append(PageBreak())

    # ══════════════ SECTION 4: VISUALIZATIONS ══════════════
    viz_phase = phases.get("visualization", {})
    viz_steps = viz_phase.get("steps", [])
    if viz_steps:
        elements.append(Paragraph("4. Visualizations & Insights", styles['SectionHead']))
        elements.append(_section_divider())
        for step in viz_steps:
            elements.append(Paragraph(f"<b>{step.get('label', step.get('tool', ''))}</b>", styles['SubHead']))
            img_b64 = step.get("image_base64", "")
            if img_b64:
                img = _b64_to_image(img_b64, width=5*inch, max_height=3.5*inch)
                if img:
                    elements.append(img)
                    elements.append(Spacer(1, 6))
            # Add inference if available
            inference = step.get("inference", "")
            if inference:
                elements.append(Paragraph(f"<i>{inference}</i>", styles['BodyText2']))
            elements.append(Spacer(1, 8))

        viz_explanation = viz_phase.get("llm_explanation", "")
        if viz_explanation:
            elements.append(Paragraph("AI Interpretation", styles['SubHead']))
            elements.extend(_md_to_paragraphs(viz_explanation, styles['BodyText2']))

    elements.append(PageBreak())

    # ══════════════ SECTION 5: FEATURE ENGINEERING ══════════════
    feat_phase = phases.get("feature_engineering", {})
    feat_steps = feat_phase.get("steps", [])
    if feat_steps:
        elements.append(Paragraph("5. Feature Engineering", styles['SectionHead']))
        elements.append(_section_divider())
        for step in feat_steps:
            elements.append(Paragraph(f"<b>{step.get('label', step.get('tool', ''))}</b>", styles['SubHead']))
            r = step.get("result", {})
            if isinstance(r, dict):
                for k, v in r.items():
                    if k not in ("image_base64", "chart_base64") and not isinstance(v, (dict, list)):
                        elements.append(Paragraph(f"  {k}: {v}", styles['SmallMono']))
            img_b64 = step.get("image_base64", "")
            if img_b64:
                img = _b64_to_image(img_b64, width=4.5*inch, max_height=3*inch)
                if img:
                    elements.append(img)
        feat_explanation = feat_phase.get("llm_explanation", "")
        if feat_explanation:
            elements.extend(_md_to_paragraphs(feat_explanation, styles['BodyText2']))

    # ══════════════ SECTION 6: MODEL TRAINING ══════════════
    model_phase = phases.get("modeling", {})
    model_steps = model_phase.get("steps", [])
    if model_steps:
        elements.append(PageBreak())
        elements.append(Paragraph("6. Model Training & Comparison", styles['SectionHead']))
        elements.append(_section_divider())

        automl_step = next((s for s in model_steps if s.get("tool") == "auto_ml_pipeline"), None)
        if automl_step and automl_step.get("result"):
            r = automl_step["result"]
            elements.append(Paragraph(
                f"Problem Type: <b>{r.get('problem_type', 'unknown')}</b> | "
                f"Target: <b>{r.get('target_column', '?')}</b> | "
                f"Features: <b>{r.get('feature_count', '?')}</b>",
                styles['BodyText2']
            ))
            elements.append(Paragraph(
                f"Best Model: <b>{r.get('best_model', '?')}</b> — "
                f"Score: <b>{(r.get('best_score', 0) * 100):.1f}%</b>",
                styles['BodyText2']
            ))

            # Model comparison table
            results = r.get("results", {})
            if results:
                is_class = r.get("problem_type") == "classification"
                if is_class:
                    headers = ["Model", "Accuracy", "Precision", "Recall", "F1"]
                    rows = []
                    for name, metrics in results.items():
                        if "error" not in metrics:
                            rows.append([
                                name,
                                f"{metrics.get('accuracy', 0)*100:.1f}%",
                                f"{metrics.get('precision', 0)*100:.1f}%",
                                f"{metrics.get('recall', 0)*100:.1f}%",
                                f"{metrics.get('f1_score', 0)*100:.1f}%",
                            ])
                else:
                    headers = ["Model", "R²", "RMSE", "MAE"]
                    rows = []
                    for name, metrics in results.items():
                        if "error" not in metrics:
                            rows.append([
                                name,
                                f"{metrics.get('r2_score', 0):.4f}",
                                f"{metrics.get('rmse', 0):.4f}",
                                f"{metrics.get('mae', 0):.4f}",
                            ])
                if rows:
                    elements.append(Spacer(1, 8))
                    elements.append(_make_table(headers, rows))

        model_explanation = model_phase.get("llm_explanation", "")
        if model_explanation:
            elements.append(Spacer(1, 8))
            elements.append(Paragraph("Model Selection Rationale", styles['SubHead']))
            elements.extend(_md_to_paragraphs(model_explanation, styles['BodyText2']))

    # ══════════════ SECTION 7: EVALUATION ══════════════
    eval_phase = phases.get("evaluation", {})
    eval_steps = eval_phase.get("steps", [])
    if eval_steps:
        elements.append(PageBreak())
        elements.append(Paragraph("7. Model Evaluation", styles['SectionHead']))
        elements.append(_section_divider())

        for step in eval_steps:
            elements.append(Paragraph(f"<b>{step.get('label', step.get('tool', ''))}</b>", styles['SubHead']))
            r = step.get("result", {})
            if isinstance(r, dict):
                # Show key metrics
                metric_keys = ["accuracy", "precision", "recall", "f1_score", "r2_score", "rmse", "mae"]
                shown = []
                for k in metric_keys:
                    if k in r:
                        val = r[k]
                        if isinstance(val, float) and val <= 1:
                            shown.append(f"{k}: {val*100:.1f}%")
                        else:
                            shown.append(f"{k}: {val}")
                if shown:
                    elements.append(Paragraph(" | ".join(shown), styles['BodyText2']))

            img_b64 = step.get("image_base64", "")
            if img_b64:
                img = _b64_to_image(img_b64, width=4.5*inch, max_height=3.5*inch)
                if img:
                    elements.append(img)
                    elements.append(Spacer(1, 6))

        eval_explanation = eval_phase.get("llm_explanation", "")
        if eval_explanation:
            elements.extend(_md_to_paragraphs(eval_explanation, styles['BodyText2']))

    # ══════════════ SECTION 8: CONCLUSIONS ══════════════
    conclusion = pipeline_results.get("conclusion", "")
    if conclusion:
        elements.append(PageBreak())
        elements.append(Paragraph("8. Conclusions &amp; Recommendations", styles['SectionHead']))
        elements.append(_section_divider())
        elements.extend(_md_to_paragraphs(conclusion, styles['BodyText2']))

    # ══════════════ FOOTER INFO ══════════════
    elements.append(Spacer(1, 0.5*inch))
    elements.append(HRFlowable(width="100%", thickness=1, color=MED_GRAY))
    elements.append(Spacer(1, 6))
    elements.append(Paragraph(
        f"Report generated by DSAgent on {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')} | Session: {session_id}",
        styles['SmallMono']
    ))

    # Build PDF
    doc.build(elements)
    return filepath
