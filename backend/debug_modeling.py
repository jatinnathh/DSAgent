import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

print("🔍 Debugging Modeling Module...")

# Test importing modeling module directly
try:
    from tools import modeling
    print("✅ Modeling module imported successfully")
except Exception as e:
    print(f"❌ Error importing modeling module: {e}")
    import traceback
    traceback.print_exc()
    exit()

# Check if tools are registered
from tools.registry import tool_registry

print(f"\n📋 Total tools: {len(tool_registry.list_tools())}")
print(f"🛠️  All tools: {tool_registry.list_tools()}")

# Check for modeling tools specifically
modeling_tools = ['auto_ml_pipeline', 'feature_importance', 'model_evaluation', 'make_predictions', 'model_comparison', 'train_specific_model']

print(f"\n🤖 Checking modeling tools:")
for tool in modeling_tools:
    if tool in tool_registry.list_tools():
        print(f"✅ {tool} - registered")
    else:
        print(f"❌ {tool} - missing")

print("\n🔍 Debug complete!")