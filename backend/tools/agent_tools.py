from typing import Dict, Any
from .registry import tool_registry
import sys
import os

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.agent import agent
from core.metadata import metadata_to_llm_prompt
from core.schema import DatasetMetadata, ColumnInfo
from .cleaning import get_dataframe
import asyncio
import nest_asyncio
import pandas as pd

# Allow nested event loops (needed when called from within FastAPI's async context)
nest_asyncio.apply()


def _build_metadata(session_id: str, df: pd.DataFrame) -> DatasetMetadata:
    """Build a proper DatasetMetadata object from a DataFrame."""
    columns_info = []
    numeric_columns = []
    categorical_columns = []
    datetime_columns = []

    for col in df.columns:
        dtype_str = str(df[col].dtype)
        null_count = int(df[col].isnull().sum())
        null_pct = round((null_count / len(df)) * 100, 2) if len(df) > 0 else 0
        unique_count = int(df[col].nunique())
        sample_values = df[col].dropna().head(3).tolist()

        # Convert numpy types
        sample_values = [
            float(v) if pd.api.types.is_float(v) else
            int(v) if pd.api.types.is_integer(v) else
            str(v)
            for v in sample_values
        ]

        columns_info.append(ColumnInfo(
            name=col,
            dtype=dtype_str,
            null_count=null_count,
            null_percentage=null_pct,
            unique_count=unique_count,
            sample_values=sample_values,
        ))

        if pd.api.types.is_numeric_dtype(df[col]):
            numeric_columns.append(col)
        elif pd.api.types.is_datetime64_any_dtype(df[col]):
            datetime_columns.append(col)
        else:
            categorical_columns.append(col)

    sample_rows = df.head(3).to_dict("records")
    for row in sample_rows:
        for key, value in row.items():
            if pd.isna(value):
                row[key] = None
            elif pd.api.types.is_float(value):
                row[key] = float(value)
            elif pd.api.types.is_integer(value):
                row[key] = int(value)
            else:
                row[key] = str(value)

    return DatasetMetadata(
        session_id=session_id,
        filename=f"session_{session_id}.csv",
        row_count=len(df),
        column_count=len(df.columns),
        columns=columns_info,
        numeric_columns=numeric_columns,
        categorical_columns=categorical_columns,
        datetime_columns=datetime_columns,
        memory_usage_mb=round(df.memory_usage(deep=True).sum() / (1024 * 1024), 2),
        sample_rows=sample_rows,
    )


def run_agent_analysis(
    session_id: str,
    user_question: str = None,
    max_iterations: int = 10,
) -> Dict[str, Any]:
    """
    Run the full agent analysis on a dataset.

    Args:
        session_id: Session identifier
        user_question: Optional specific question
        max_iterations: Maximum tool calls
    """
    # Get dataset and generate metadata prompt
    df = get_dataframe(session_id)
    metadata = _build_metadata(session_id, df)
    metadata_prompt = metadata_to_llm_prompt(metadata)

    # Run agent analysis — nest_asyncio allows this to work even inside
    # FastAPI's already-running event loop.
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        response = loop.run_until_complete(
            agent.analyze_dataset(
                session_id, metadata_prompt, user_question, max_iterations
            )
        )

        return {
            "session_id": response.session_id,
            "iterations": response.iteration,
            "final_answer": response.final_answer,
            "is_complete": response.is_complete,
            "conversation_length": len(response.conversation_history),
        }

    except Exception as e:
        return {
            "error": f"Agent analysis failed: {str(e)}",
            "session_id": session_id,
        }

tool_registry.register(
    name="run_agent_analysis",
    description="Run comprehensive AI agent analysis on the dataset using multiple tools automatically",
    parameters={
        "type": "object",
        "properties": {
            "session_id": {"type": "string", "description": "Session ID"},
            "user_question": {"type": "string", "description": "Optional specific question to answer"},
            "max_iterations": {"type": "integer", "description": "Maximum number of tool calls (default: 10)"}
        },
        "required": ["session_id"]
    },
    function=run_agent_analysis
)