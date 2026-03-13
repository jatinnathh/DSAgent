from typing import Callable, Dict, Any, List
from core.schema import ToolResult  # Not ..core.schema
import time
import traceback


class ToolRegistry:
    """
    Central registry for all tools the agent can use.
    Tools are Python functions that the LLM can call by name.
    """
    
    def __init__(self):
        self._tools: Dict[str, Callable] = {}
        self._tool_descriptions: Dict[str, Dict[str, Any]] = {}
    
    def register(
        self,
        name: str,
        description: str,
        parameters: Dict[str, Any],
        function: Callable
    ):
        """
        Register a new tool
        
        Args:
            name: Unique tool identifier (e.g., "detect_missing_values")
            description: What the tool does (for LLM to understand)
            parameters: JSON schema describing function arguments
            function: The actual Python function to execute
        """
        self._tools[name] = function
        self._tool_descriptions[name] = {
            "name": name,
            "description": description,
            "parameters": parameters
        }
    
    def execute(self, tool_name: str, arguments: Dict[str, Any]) -> ToolResult:
        """
        Execute a tool by name with given arguments
        
        Args:
            tool_name: Name of the tool to run
            arguments: Dictionary of arguments to pass
            
        Returns:
            ToolResult with output or error
        """
        start_time = time.time()
        
        if tool_name not in self._tools:
            return ToolResult(
                tool_name=tool_name,
                success=False,
                output=None,
                error=f"Tool '{tool_name}' not found in registry",
                execution_time_ms=0
            )
        
        try:
            # Execute the tool function
            result = self._tools[tool_name](**arguments)
            
            execution_time_ms = (time.time() - start_time) * 1000
            
            return ToolResult(
                tool_name=tool_name,
                success=True,
                output=result,
                error=None,
                execution_time_ms=round(execution_time_ms, 2)
            )
            
        except Exception as e:
            execution_time_ms = (time.time() - start_time) * 1000
            error_trace = traceback.format_exc()
            
            return ToolResult(
                tool_name=tool_name,
                success=False,
                output=None,
                error=f"{str(e)}\n\nTraceback:\n{error_trace}",
                execution_time_ms=round(execution_time_ms, 2)
            )
    
    def get_tool_definitions(self) -> List[Dict[str, Any]]:
        """
        Get all tool definitions in OpenAI function calling format
        This is what gets sent to the LLM
        
        Returns:
            List of tool definitions
        """
        return [
            {
                "type": "function",
                "function": desc
            }
            for desc in self._tool_descriptions.values()
        ]
    
    def list_tools(self) -> List[str]:
        """Get list of all registered tool names"""
        return list(self._tools.keys())


# Global registry instance
tool_registry = ToolRegistry()