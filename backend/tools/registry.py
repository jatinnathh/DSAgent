from typing import Callable, Dict, Any, List, Optional
from core.schema import ToolResult  # Not ..core.schema
import time
import traceback


class ToolRegistry:
    """
    Central registry for all tools the agent can use.
    Tools are Python functions that the LLM can call by name.

    Resilience features:
    - Aliases: register_alias("remove_column", "drop_columns") so LLM
      hallucinations resolve silently.
    - Fuzzy matching: if a tool name is not found, try normalised forms
      and Levenshtein-closest match (max distance 3) before giving up.
    """
    
    def __init__(self):
        self._tools: Dict[str, Callable] = {}
        self._tool_descriptions: Dict[str, Dict[str, Any]] = {}
        self._aliases: Dict[str, str] = {}  # alias_name -> canonical_name
    
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
    
    def register_alias(self, alias: str, canonical: str):
        """
        Register an alias that maps to an existing tool.
        Useful for catching common LLM hallucinations
        (e.g. "remove_column" -> "drop_columns").
        """
        self._aliases[alias] = canonical
    
    def resolve_tool_name(self, tool_name: str) -> Optional[str]:
        """
        Resolve a tool name through aliases and fuzzy matching.
        Returns the canonical tool name, or None if no match found.
        """
        # 1. Exact match
        if tool_name in self._tools:
            return tool_name

        # 2. Alias match
        if tool_name in self._aliases:
            canonical = self._aliases[tool_name]
            if canonical in self._tools:
                return canonical

        # 3. Normalised match (lowercase, strip hyphens/spaces)
        normalised = tool_name.lower().replace("-", "_").replace(" ", "_").strip()
        if normalised in self._tools:
            return normalised
        if normalised in self._aliases:
            canonical = self._aliases[normalised]
            if canonical in self._tools:
                return canonical

        # 4. Fuzzy match — find closest tool name by Levenshtein distance
        best_match = None
        best_dist = 4  # max edit distance we'll tolerate
        for registered in self._tools:
            d = self._levenshtein(normalised, registered)
            if d < best_dist:
                best_dist = d
                best_match = registered
        if best_match:
            print(f"[registry] Fuzzy-matched '{tool_name}' -> '{best_match}' (edit distance {best_dist})")
            return best_match

        return None

    @staticmethod
    def _levenshtein(s1: str, s2: str) -> int:
        """Compute Levenshtein edit distance between two strings."""
        if len(s1) < len(s2):
            return ToolRegistry._levenshtein(s2, s1)
        if len(s2) == 0:
            return len(s1)
        prev_row = range(len(s2) + 1)
        for i, c1 in enumerate(s1):
            curr_row = [i + 1]
            for j, c2 in enumerate(s2):
                insertions = prev_row[j + 1] + 1
                deletions = curr_row[j] + 1
                substitutions = prev_row[j] + (c1 != c2)
                curr_row.append(min(insertions, deletions, substitutions))
            prev_row = curr_row
        return prev_row[-1]

    def execute(self, tool_name: str, arguments: Dict[str, Any]) -> ToolResult:
        """
        Execute a tool by name with given arguments.
        Resolves aliases and fuzzy matches before failing.
        
        Args:
            tool_name: Name of the tool to run
            arguments: Dictionary of arguments to pass
            
        Returns:
            ToolResult with output or error
        """
        start_time = time.time()
        
        # Resolve through aliases / fuzzy matching
        resolved = self.resolve_tool_name(tool_name)
        if resolved is None:
            return ToolResult(
                tool_name=tool_name,
                success=False,
                output=None,
                error=f"Tool '{tool_name}' not found in registry. Available: {', '.join(sorted(self._tools.keys()))}",
                execution_time_ms=0
            )

        if resolved != tool_name:
            print(f"[registry] Resolved '{tool_name}' -> '{resolved}'")
        
        try:
            # Execute the tool function
            result = self._tools[resolved](**arguments)
            
            execution_time_ms = (time.time() - start_time) * 1000
            
            return ToolResult(
                tool_name=resolved,
                success=True,
                output=result,
                error=None,
                execution_time_ms=round(execution_time_ms, 2)
            )
            
        except Exception as e:
            execution_time_ms = (time.time() - start_time) * 1000
            error_trace = traceback.format_exc()
            
            return ToolResult(
                tool_name=resolved,
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