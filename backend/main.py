from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import pandas as pd
import io
import os
import signal
import asyncio
from contextlib import asynccontextmanager
from dotenv import load_dotenv

# Import our modules
from core.metadata import extract_metadata, metadata_to_llm_prompt
from core.logging_config import setup_logging, get_logger
from core.middleware import (
    RequestIdMiddleware,
    TimingMiddleware,
    ConcurrencyLimitMiddleware,
    TimeoutMiddleware,
    AuditMiddleware,
    ErrorHandlerMiddleware,
)
from tools.cleaning import set_dataframe
from tools.registry import tool_registry
from tools.agent_tools import run_agent_analysis

from pathlib import Path

# Load from backend dir first, then override/supplement from project root .env
load_dotenv(Path(__file__).parent / ".env")
load_dotenv(Path(__file__).parent.parent / ".env", override=False)  # root .env

# ============================================
# LOGGING
# ============================================

setup_logging(log_level=os.getenv("LOG_LEVEL", "INFO"))
logger = get_logger("main")

# ============================================
# GRACEFUL SHUTDOWN / LIFESPAN
# ============================================

# Track active sessions for cleanup
_active_sessions: Dict[str, Any] = {}
_shutdown_event = asyncio.Event()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage startup and shutdown lifecycle."""
    # ---- STARTUP ----
    logger.info("DSAgent Backend starting up", extra={
        "tools_registered": len(tool_registry.list_tools()),
        "environment": os.getenv("ENVIRONMENT", "development"),
    })

    yield

    # ---- SHUTDOWN ----
    logger.info("DSAgent Backend shutting down gracefully...")

    # Signal all active tasks
    _shutdown_event.set()

    # Allow in-flight requests to complete (up to 10 seconds)
    logger.info("Draining in-flight requests...")
    await asyncio.sleep(2)

    # Clean up active sessions
    session_count = len(_active_sessions)
    _active_sessions.clear()
    logger.info(f"Cleaned up {session_count} active sessions")

    # Flush logs
    logger.info("Backend shutdown complete")


# ============================================
# APP INITIALIZATION
# ============================================

app = FastAPI(
    title="DSAgent Backend",
    version="2.0.0",
    description="Enterprise-grade autonomous data science backend with structured logging, fault tolerance, and observability",
    lifespan=lifespan,
)

# ============================================
# MIDDLEWARE STACK (order matters — outermost first)
# ============================================

# Error handler — outermost, catches all unhandled exceptions
app.add_middleware(ErrorHandlerMiddleware)

# Audit — log every request
app.add_middleware(AuditMiddleware)

# Timing — measure request duration
app.add_middleware(TimingMiddleware)

# Request ID — inject correlation ID
app.add_middleware(RequestIdMiddleware)

# Timeout — kill requests after 120 seconds
app.add_middleware(TimeoutMiddleware, timeout_seconds=120)

# Concurrency limit — max 50 concurrent requests
app.add_middleware(ConcurrencyLimitMiddleware, max_concurrent=50)

# CORS — allow Next.js frontend to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://*.vercel.app",
        os.getenv("FRONTEND_URL", "http://localhost:3000"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-Id", "X-Response-Time"],
)

# Request/Response models
class AnalysisRequest(BaseModel):
    session_id: str
    question: Optional[str] = None
    max_iterations: Optional[int] = 10

class ToolExecuteRequest(BaseModel):
    tool_name: str
    arguments: Dict[str, Any]

class VisualizationRequest(BaseModel):
    type: str = "histogram"
    column: Optional[str] = None
    x_column: Optional[str] = None
    y_column: Optional[str] = None
    bins: Optional[int] = None
    title: Optional[str] = None
    group_by: Optional[str] = None
    top_n: Optional[int] = None
    method: Optional[str] = None
    color_column: Optional[str] = None

class ModelTrainRequest(BaseModel):
    target_column: str
    test_size: float = 0.2
    random_state: int = 42

# ============================================
# ENDPOINTS
# ============================================

@app.get("/")
def root():
    return {
        "message": "DSAgent Backend Running",
        "status": "healthy",
        "version": "2.0.0",
        "tools": len(tool_registry.list_tools()),
    }

@app.get("/health")
def health():
    """Detailed health check endpoint."""
    import psutil

    try:
        memory = psutil.virtual_memory()
        cpu_percent = psutil.cpu_percent(interval=0.1)
        memory_info = {
            "total_gb": round(memory.total / (1024**3), 2),
            "used_gb": round(memory.used / (1024**3), 2),
            "percent": memory.percent,
        }
    except Exception:
        memory_info = {"error": "psutil not available"}
        cpu_percent = -1

    return {
        "status": "ok",
        "version": "2.0.0",
        "tools_registered": len(tool_registry.list_tools()),
        "active_sessions": len(_active_sessions),
        "system": {
            "memory": memory_info,
            "cpu_percent": cpu_percent,
        },
    }

@app.get("/tools")
def get_tools():
    """Get list of all available tools"""
    return {
        "tools": tool_registry.list_tools(),
        "tool_definitions": tool_registry.get_tool_definitions(),
        "total_count": len(tool_registry.list_tools())
    }

@app.post("/upload")
async def upload_dataset(file: UploadFile = File(...)):
    """
    Upload a CSV file and extract metadata
    """
    if not file.filename.endswith('.csv'):
        raise HTTPException(status_code=400, detail="Only CSV files supported")
    
    try:
        # Read file content
        content = await file.read()
        
        # Extract metadata
        metadata = extract_metadata(content, file.filename)
        
        # Store dataframe in session
        df = pd.read_csv(io.BytesIO(content))
        set_dataframe(metadata.session_id, df)
        
        # Track active session
        _active_sessions[metadata.session_id] = {
            "filename": file.filename,
            "rows": len(df),
            "columns": len(df.columns),
        }
        
        # Generate LLM prompt
        llm_prompt = metadata_to_llm_prompt(metadata)

        logger.info("Dataset uploaded", extra={
            "session_id": metadata.session_id,
            "filename": file.filename,
            "rows": len(df),
            "columns": len(df.columns),
        })
        
        return {
            "session_id": metadata.session_id,
            "filename": metadata.filename,
            "metadata": metadata.dict(),
            "llm_prompt": llm_prompt,
            "message": "Dataset uploaded and analyzed successfully"
        }
        
    except Exception as e:
        logger.error(f"Upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")

@app.post("/analyze")
async def analyze_dataset(request: AnalysisRequest):
    """
    Run AI agent analysis on uploaded dataset
    """
    try:
        result = tool_registry.execute("run_agent_analysis", {
            "session_id": request.session_id,
            "user_question": request.question,
            "max_iterations": request.max_iterations
        })
        
        if result.success:
            return {
                "success": True,
                "analysis": result.output,
                "execution_time_ms": result.execution_time_ms
            }
        else:
            return {
                "success": False,
                "error": result.error,
                "execution_time_ms": result.execution_time_ms
            }
            
    except Exception as e:
        logger.error(f"Analysis failed: {e}", exc_info=True, extra={"session_id": request.session_id})
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/execute-tool")
async def execute_tool(request: ToolExecuteRequest):
    """
    Execute a specific tool manually
    """
    # Preprocessing tools that should be recorded for transform.py
    _TRANSFORM_TOOLS = {
        "fill_missing_values", "remove_duplicates", "remove_outliers",
        "standard_scaler", "min_max_scaler", "robust_scaler",
        "log_transform", "one_hot_encode", "label_encode",
        "drop_columns", "pca_transform", "polynomial_features",
    }
    
    try:
        result = tool_registry.execute(request.tool_name, request.arguments)
        
        # Record preprocessing steps for manual pipeline runs
        if request.tool_name in _TRANSFORM_TOOLS and result.success:
            session_id = request.arguments.get("session_id", "")
            if session_id:
                try:
                    from tools.modeling import record_transform_step
                    output = result.output if isinstance(result.output, dict) else {}
                    record_transform_step(session_id, request.tool_name, request.arguments, output)
                except Exception:
                    pass  # Don't fail over recording

        logger.info(f"Tool executed: {request.tool_name}", extra={
            "tool_name": request.tool_name,
            "success": result.success,
            "duration_ms": result.execution_time_ms,
        })
        
        return {
            "success": result.success,
            "output": result.output,
            "error": result.error,
            "execution_time_ms": result.execution_time_ms,
            "tool_name": request.tool_name
        }
        
    except Exception as e:
        logger.error(f"Tool execution failed: {e}", exc_info=True, extra={"tool_name": request.tool_name})
        raise HTTPException(status_code=500, detail=f"Tool execution failed: {str(e)}")

@app.get("/session/{session_id}/overview")
async def get_session_overview(session_id: str):
    """
    Get overview of a session's dataset
    """
    try:
        result = tool_registry.execute("dataset_overview", {"session_id": session_id})
        
        if result.success:
            return result.output
        else:
            raise HTTPException(status_code=404, detail=f"Session not found: {result.error}")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting overview: {str(e)}")

@app.get("/session/{session_id}/metadata")
async def get_session_metadata(session_id: str):
    """
    Get metadata for a previously uploaded session.
    Used by the frontend to restore dataset context when reloading a chat.
    """
    try:
        from tools.cleaning import get_dataframe
        import io
        
        df = get_dataframe(session_id)  # will load from disk if needed
        
        # Reconstruct metadata
        numeric_columns = df.select_dtypes(include=['number']).columns.tolist()
        categorical_columns = df.select_dtypes(include=['object', 'category']).columns.tolist()
        
        meta_summary = (
            f"Filename: session_{session_id}.csv\n"
            f"Rows: {len(df):,}, Columns: {len(df.columns)}\n"
            f"Size: {round(df.memory_usage(deep=True).sum() / (1024*1024), 2)} MB\n"
            f"Numeric columns: {', '.join(numeric_columns) or 'none'}\n"
            f"Categorical columns: {', '.join(categorical_columns) or 'none'}"
        )
        
        return {
            "session_id": session_id,
            "found": True,
            "metadata": {
                "filename": f"session_{session_id}.csv",
                "row_count": len(df),
                "column_count": len(df.columns),
                "numeric_columns": numeric_columns,
                "categorical_columns": categorical_columns,
                "memory_usage_mb": round(df.memory_usage(deep=True).sum() / (1024*1024), 2),
                "columns": [{"name": c} for c in df.columns],
                "sample_rows": df.head(3).fillna("").to_dict("records"),
            },
            "meta_summary": meta_summary,
        }
    except ValueError as e:
        return {"session_id": session_id, "found": False, "error": str(e)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


from fastapi.responses import StreamingResponse
import io

@app.get("/session/{session_id}/download")
async def download_session_csv(session_id: str):
    """
    Download the current (modified) state of a session's dataset as CSV.
    This reflects all pipeline steps that have been applied (cleaning, encoding, etc.)
    """
    try:
        from tools.cleaning import get_dataframe
        
        df = get_dataframe(session_id)
        
        # Convert DataFrame to CSV string
        csv_buffer = io.StringIO()
        df.to_csv(csv_buffer, index=False)
        csv_buffer.seek(0)
        csv_content = csv_buffer.getvalue()
        
        return StreamingResponse(
            iter([csv_content]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f"attachment; filename=session_{session_id}_modified.csv",
                "Content-Length": str(len(csv_content.encode("utf-8"))),
            }
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")
        
@app.get("/session/{session_id}/quality")
async def get_data_quality(session_id: str):
    """
    Get data quality report for a session
    """
    try:
        result = tool_registry.execute("data_quality_report", {"session_id": session_id})
        
        if result.success:
            return result.output
        else:
            raise HTTPException(status_code=404, detail=f"Session not found: {result.error}")
            
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error getting quality report: {str(e)}")

@app.post("/session/{session_id}/visualize")
async def create_visualization(session_id: str, viz_request: VisualizationRequest):
    """
    Create visualization for a session
    """
    try:
        # Build arguments dict from the Pydantic model
        args = {k: v for k, v in viz_request.dict().items() if v is not None and k != "type"}
        args["session_id"] = session_id
        
        # Determine visualization type
        viz_type = viz_request.type
        
        tool_mapping = {
            "histogram": "create_histogram",
            "bar_chart": "create_bar_chart", 
            "scatter_plot": "create_scatter_plot",
            "correlation_heatmap": "create_correlation_heatmap",
            "box_plot": "create_box_plot"
        }
        
        tool_name = tool_mapping.get(viz_type)
        if not tool_name:
            raise HTTPException(status_code=400, detail=f"Unknown visualization type: {viz_type}")
        
        result = tool_registry.execute(tool_name, args)
        
        if result.success:
            return result.output
        else:
            raise HTTPException(status_code=400, detail=result.error)
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Visualization failed: {str(e)}")

@app.post("/session/{session_id}/model")
async def train_model(session_id: str, model_request: ModelTrainRequest):
    """
    Train ML model for a session
    """
    try:
        args = model_request.dict()
        args["session_id"] = session_id
        
        result = tool_registry.execute("auto_ml_pipeline", args)
        
        if result.success:
            return result.output
        else:
            raise HTTPException(status_code=400, detail=result.error)
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model training failed: {str(e)}")


# ============================================
# AUTONOMOUS PIPELINE
# ============================================

class AutonomousPipelineRequest(BaseModel):
    session_id: str
    dataset_name: str = "dataset"

@app.post("/autonomous-pipeline")
async def autonomous_pipeline(request: AutonomousPipelineRequest):
    """
    Run the full autonomous data science pipeline.
    Performs EDA, cleaning, visualization, feature engineering,
    model training, evaluation, and generates a PDF report.
    """
    try:
        from tools.autonomous import run_autonomous_pipeline

        logger.info("Autonomous pipeline started", extra={"session_id": request.session_id})

        result = run_autonomous_pipeline(
            session_id=request.session_id,
            dataset_name=request.dataset_name,
        )

        # Build a summary for the frontend
        phases_summary = {}
        for phase_name, phase_data in result.get("phases", {}).items():
            steps = phase_data.get("steps", [])
            phases_summary[phase_name] = {
                "step_count": len(steps),
                "success_count": sum(1 for s in steps if s.get("success")),
                "steps": [
                    {
                        "tool": s.get("tool", ""),
                        "label": s.get("label", ""),
                        "success": s.get("success", False),
                        "time_ms": s.get("time_ms", 0),
                        "image_base64": s.get("image_base64", ""),
                        "result_preview": {k: v for k, v in (s.get("result", {}) or {}).items()
                                           if not isinstance(v, (dict, list)) and k != "image_base64"}
                                           if isinstance(s.get("result"), dict) else {},
                    }
                    for s in steps
                ],
                "llm_explanation": phase_data.get("llm_explanation", ""),
            }

        logger.info("Autonomous pipeline completed", extra={
            "session_id": request.session_id,
            "total_time_ms": result.get("total_time_ms", 0),
        })

        return {
            "success": True,
            "report_id": result.get("report_id", ""),
            "report_path": result.get("report_path", ""),
            "total_time_ms": result.get("total_time_ms", 0),
            "conclusion": result.get("conclusion", ""),
            "phases": phases_summary,
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        logger.error(f"Autonomous pipeline failed: {e}", exc_info=True, extra={"session_id": request.session_id})
        raise HTTPException(status_code=500, detail=f"Autonomous pipeline failed: {str(e)}")


# ============================================
# REPORT DOWNLOAD
# ============================================

@app.get("/reports/{report_id}/download")
async def download_report(report_id: str):
    """Download a generated PDF report."""
    try:
        reports_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "reports")
        filepath = os.path.join(reports_dir, f"{report_id}.pdf")

        if not os.path.exists(filepath):
            raise HTTPException(status_code=404, detail="Report not found")

        def iter_file():
            with open(filepath, "rb") as f:
                while chunk := f.read(8192):
                    yield chunk

        return StreamingResponse(
            iter_file(),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="DSAgent_Report_{report_id}.pdf"',
                "Content-Length": str(os.path.getsize(filepath)),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")


# ============================================
# MODELS — List, Download, Delete
# ============================================

@app.get("/models")
async def list_models():
    """List all saved trained models with metadata."""
    try:
        from tools.model_export import list_saved_models
        models = list_saved_models()
        return {"models": models, "total": len(models)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to list models: {str(e)}")


@app.get("/models/{model_id}/download")
async def download_model_bundle(model_id: str):
    """Download a .zip bundle containing model.pkl, transform.py, and README.md."""
    try:
        from tools.model_export import create_model_bundle, get_model_meta

        meta = get_model_meta(model_id)
        if meta is None:
            raise HTTPException(status_code=404, detail="Model not found")

        zip_bytes = create_model_bundle(model_id)
        if zip_bytes is None:
            raise HTTPException(status_code=404, detail="Model files not found on disk")

        model_name = meta.get("model_name", "model").replace(" ", "_")
        filename = f"DSAgent_Model_{model_name}_{model_id}.zip"

        return StreamingResponse(
            iter([zip_bytes]),
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "Content-Length": str(len(zip_bytes)),
            },
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Download failed: {str(e)}")


@app.delete("/models/{model_id}")
async def delete_model_endpoint(model_id: str):
    """Delete a saved model and its metadata."""
    try:
        from tools.model_export import delete_model
        deleted = delete_model(model_id)
        if not deleted:
            raise HTTPException(status_code=404, detail="Model not found")
        return {"success": True, "model_id": model_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Delete failed: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        app,
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info",
        timeout_graceful_shutdown=10,  # 10 second graceful shutdown window
    )