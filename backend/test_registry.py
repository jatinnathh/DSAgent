import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Now we can import
from tools.registry import tool_registry

# Example: Register a simple test tool
def test_add(a: int, b: int) -> int:
    """Add two numbers"""
    return a + b

tool_registry.register(
    name="test_add",
    description="Adds two numbers together",
    parameters={
        "type": "object",
        "properties": {
            "a": {"type": "integer", "description": "First number"},
            "b": {"type": "integer", "description": "Second number"}
        },
        "required": ["a", "b"]
    },
    function=test_add
)

# Test 1: List tools
print("📋 Registered tools:", tool_registry.list_tools())

# Test 2: Execute successful tool call
result = tool_registry.execute("test_add", {"a": 5, "b": 3})
print(f"\n✅ Success test:")
print(f"   Output: {result.output}")
print(f"   Time: {result.execution_time_ms}ms")

# Test 3: Execute with error (missing argument)
result = tool_registry.execute("test_add", {"a": 5})
print(f"\n❌ Error test:")
print(f"   Success: {result.success}")
print(f"   Error: {result.error[:100]}...")

# Test 4: Get tool definitions for LLM
definitions = tool_registry.get_tool_definitions()
print(f"\n🤖 LLM Tool Definitions:")
import json
print(json.dumps(definitions, indent=2))