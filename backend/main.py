from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, Dict, Any, List
import pandas as pd
import io
import os
from dotenv import load_dotenv

# Import our modules
from core.metadata import extract_metadata, metadata_to_llm_prompt
from tools.cleaning import set_dataframe
from tools.registry import tool_registry
from tools.agent_tools import run_agent_analysis

load_dotenv()

app = FastAPI(title="DSAgent Backend", version="1.0.0")

# CORS - allow Next.js frontend to call this API
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
    return {"message": "DSAgent Backend Running", "status": "healthy", "tools": len(tool_registry.list_tools())}

@app.get("/health")
def health():
    return {"status": "ok", "tools_registered": len(tool_registry.list_tools())}

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
        
        # Generate LLM prompt
        llm_prompt = metadata_to_llm_prompt(metadata)
        
        return {
            "session_id": metadata.session_id,
            "filename": metadata.filename,
            "metadata": metadata.dict(),
            "llm_prompt": llm_prompt,
            "message": "Dataset uploaded and analyzed successfully"
        }
        
    except Exception as e:
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
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")

@app.post("/execute-tool")
async def execute_tool(request: ToolExecuteRequest):
    """
    Execute a specific tool manually
    """
    try:
        result = tool_registry.execute(request.tool_name, request.arguments)
        
        return {
            "success": result.success,
            "output": result.output,
            "error": result.error,
            "execution_time_ms": result.execution_time_ms,
            "tool_name": request.tool_name
        }
        
    except Exception as e:
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
"""
ADD this endpoint to backend/main.py, after the existing /session/{session_id}/overview endpoint.
"""

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


# Add this endpoint to backend/main.py
# Place it after the existing /session/{session_id}/metadata endpoint

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)