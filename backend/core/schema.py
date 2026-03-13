from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional, Literal

# ============================================
# Dataset Metadata Models
# ============================================

class ColumnInfo(BaseModel):
    """Information about a single column"""
    name: str
    dtype: str
    null_count: int
    null_percentage: float
    unique_count: int
    sample_values: List[Any]

class DatasetMetadata(BaseModel):
    """Complete metadata about an uploaded dataset"""
    session_id: str
    filename: str
    row_count: int
    column_count: int
    columns: List[ColumnInfo]
    numeric_columns: List[str]
    categorical_columns: List[str]
    datetime_columns: List[str]
    memory_usage_mb: float
    sample_rows: List[Dict[str, Any]]  # first 5 rows as dicts

# ============================================
# Tool Calling Models
# ============================================

class ToolCall(BaseModel):
    """LLM's request to execute a tool"""
    tool_name: str
    arguments: Dict[str, Any] = Field(default_factory=dict)

class ToolResult(BaseModel):
    """Result from executing a tool"""
    tool_name: str
    success: bool
    output: Any
    error: Optional[str] = None
    execution_time_ms: float

# ============================================
# Agent Request/Response Models
# ============================================

class AgentMessage(BaseModel):
    """A single message in the conversation"""
    role: Literal["user", "assistant", "system", "tool"]
    content: str
    tool_calls: Optional[List[ToolCall]] = None
    tool_call_id: Optional[str] = None

class AgentRequest(BaseModel):
    """Request to the agent to process next step"""
    session_id: str
    user_message: Optional[str] = None  # optional user query
    max_iterations: int = Field(default=10, ge=1, le=50)

class AgentResponse(BaseModel):
    """Agent's response after thinking/acting"""
    session_id: str
    iteration: int
    thought: str  # what the agent is thinking
    action: Optional[ToolCall] = None  # what tool it wants to run
    observation: Optional[ToolResult] = None  # result of the tool
    final_answer: Optional[str] = None  # if analysis is complete
    is_complete: bool
    conversation_history: List[AgentMessage]

# ============================================
# Session State
# ============================================

class SessionState(BaseModel):
    """Complete state of a user's analysis session"""
    session_id: str
    filename: str
    metadata: DatasetMetadata
    conversation_history: List[AgentMessage] = Field(default_factory=list)
    tool_results: List[ToolResult] = Field(default_factory=list)
    current_step: str = "initialized"
    is_complete: bool = False
    final_report: Optional[str] = None