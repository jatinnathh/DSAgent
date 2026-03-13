from typing import Dict, Any
from .registry import tool_registry
import sys
import os

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.agent import agent
from core.metadata import extract_metadata, metadata_to_llm_prompt
from .cleaning import get_dataframe
import asyncio

def run_agent_analysis(
    session_id: str,
    user_question: str = None,
    max_iterations: int = 10
) -> Dict[str, Any]:
    """
    Run the full agent analysis on a dataset
    
    Args:
        session_id: Session identifier
        user_question: Optional specific question
        max_iterations: Maximum tool calls
    """
    
    # Get dataset and generate metadata prompt
    df = get_dataframe(session_id)
    
    # Create a mock metadata object for the prompt
    class MockMetadata:
        def __init__(self, df):
            self.filename = f"session_{session_id}.csv"
            self.row_count = len(df)
            self.column_count = len(df.columns)
            self.columns = []
            
            for col in df.columns:
                self.columns.append(type('obj', (object,), {
                    'name': col,
                    'dtype': str(df[col].dtype),
                    'null_count': int(df[col].isnull().sum()),
                    'null_percentage': round((df[col].isnull().sum() / len(df)) * 100, 2),
                    'unique_count': int(df[col].nunique()),
                    'sample_values': df[col].dropna().head(3).tolist()
                })())
            
            self.numeric_columns = df.select_dtypes(include=['number']).columns.tolist()
            self.categorical_columns = df.select_dtypes(include=['object']).columns.tolist()
            self.datetime_columns = df.select_dtypes(include=['datetime']).columns.tolist()
            self.memory_usage_mb = round(df.memory_usage(deep=True).sum() / (1024 * 1024), 2)
            self.sample_rows = df.head(3).to_dict('records')
    
    metadata = MockMetadata(df)
    metadata_prompt = metadata_to_llm_prompt(metadata)
    
    # Run agent analysis
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        response = loop.run_until_complete(
            agent.analyze_dataset(session_id, metadata_prompt, user_question, max_iterations)
        )
        loop.close()
        
        return {
            "session_id": response.session_id,
            "iterations": response.iteration,
            "final_answer": response.final_answer,
            "is_complete": response.is_complete,
            "conversation_length": len(response.conversation_history)
        }
        
    except Exception as e:
        return {
            "error": f"Agent analysis failed: {str(e)}",
            "session_id": session_id
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