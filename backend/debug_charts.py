import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
from tools.cleaning import set_dataframe
from tools.registry import tool_registry

print("🔍 Debugging Chart Generation...")

# Create simple test data
test_data = pd.DataFrame({
    'age': [25, 30, 35, 40, 45],
    'income': [50000, 60000, 70000, 80000, 55000],
    'department': ['Sales', 'Engineering', 'Sales', 'Marketing', 'Engineering']
})

print(f"📊 Test data shape: {test_data.shape}")
print(f"Columns: {list(test_data.columns)}")
print(f"Data types:\n{test_data.dtypes}")

# Set session data
set_dataframe("debug_session", test_data)
print("✅ Session data set")

# Test histogram with detailed error info
print("\n" + "="*60)
print("🔍 Testing Histogram...")
print("="*60)

result = tool_registry.execute("create_histogram", {
    "session_id": "debug_session", 
    "column": "age"
})

print(f"Success: {result.success}")
print(f"Execution time: {result.execution_time_ms}ms")

if result.success:
    print(f"✅ Histogram generated successfully!")
    print(f"Output keys: {list(result.output.keys())}")
    if 'image_base64' in result.output:
        img_len = len(result.output['image_base64'])
        print(f"Image base64 length: {img_len}")
        print(f"Starts with data:image: {result.output['image_base64'].startswith('data:image')}")
else:
    print(f"❌ Error: {result.error}")
    print("\nFull error details:")
    print("-" * 40)
    print(result.error)
    print("-" * 40)

# Test if matplotlib is working at all
print("\n" + "="*60)
print("🔍 Testing Matplotlib Directly...")
print("="*60)

try:
    import matplotlib
    print(f"✅ Matplotlib version: {matplotlib.__version__}")
    
    import matplotlib.pyplot as plt
    print(f"✅ Pyplot imported")
    
    # Test basic plot
    plt.figure(figsize=(6, 4))
    plt.plot([1, 2, 3, 4], [1, 4, 2, 3])
    plt.title("Test Plot")
    
    # Try to save
    plt.savefig("test_direct.png")
    plt.close()
    print("✅ Direct matplotlib plot saved as test_direct.png")
    
except Exception as e:
    print(f"❌ Matplotlib error: {e}")

# Test seaborn
print("\n" + "="*60)
print("🔍 Testing Seaborn...")
print("="*60)

try:
    import seaborn as sns
    print(f"✅ Seaborn version: {sns.__version__}")
except Exception as e:
    print(f"❌ Seaborn error: {e}")

# Check if we can import our visualization module
print("\n" + "="*60)
print("🔍 Testing Visualization Module Import...")
print("="*60)

try:
    from tools import visualization
    print("✅ Visualization module imported successfully")
    
    # Check if functions exist
    funcs = ['create_histogram', 'create_bar_chart', 'create_scatter_plot']
    for func in funcs:
        if hasattr(visualization, func):
            print(f"✅ Function {func} exists")
        else:
            print(f"❌ Function {func} missing")
            
except Exception as e:
    print(f"❌ Import error: {e}")
    import traceback
    traceback.print_exc()

print("\n🔍 Debug complete!")