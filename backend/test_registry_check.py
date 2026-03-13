import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import tools to register everything
import tools

from tools.registry import tool_registry

print("🔍 Checking Tool Registry...")
print(f"📋 Total tools registered: {len(tool_registry.list_tools())}")
print(f"🛠️  All tools: {tool_registry.list_tools()}")

# Check for visualization tools specifically
viz_tools = ['create_histogram', 'create_bar_chart', 'create_scatter_plot', 'create_correlation_heatmap', 'create_box_plot']
missing_tools = []

for tool in viz_tools:
    if tool in tool_registry.list_tools():
        print(f"✅ {tool} - registered")
    else:
        print(f"❌ {tool} - missing")
        missing_tools.append(tool)

if missing_tools:
    print(f"\n⚠️  Missing tools: {missing_tools}")
else:
    print(f"\n🎉 All visualization tools are registered!")