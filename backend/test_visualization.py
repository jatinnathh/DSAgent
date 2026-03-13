import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
import base64
from tools.cleaning import set_dataframe
from tools.registry import tool_registry

# Create test data
test_data = pd.DataFrame({
    'age': [25, 30, 35, 40, 45, 50, 200],  # with outlier
    'income': [50000, 60000, 70000, 80000, 55000, 85000, 90000],
    'department': ['Sales', 'Engineering', 'Sales', 'Marketing', 'Engineering', 'Sales', 'Marketing']
})

set_dataframe("visual_test", test_data)

def save_and_open_chart(result, chart_name):
    if result.success and 'image_base64' in result.output:
        # Extract base64 data
        image_data = result.output['image_base64'].split(',')[1]
        
        # Save as PNG
        filename = f"{chart_name}.png"
        with open(filename, 'wb') as f:
            f.write(base64.b64decode(image_data))
        
        print(f"💾 Saved: {filename}")
        
        # Try to open (Windows)
        import subprocess
        try:
            subprocess.run(['start', filename], shell=True)
            print(f"🖼️  Opening {filename}")
        except:
            print(f"📁 File location: {os.path.abspath(filename)}")
    else:
        print(f"❌ Failed to generate {chart_name}")

print("🎨 Generating Visual Charts...")

# Test 1: Histogram
result = tool_registry.execute("create_histogram", {"session_id": "visual_test", "column": "age"})
save_and_open_chart(result, "histogram_age")

# Test 2: Bar Chart  
result = tool_registry.execute("create_bar_chart", {"session_id": "visual_test", "column": "department"})
save_and_open_chart(result, "barchart_department")

# Test 3: Scatter Plot
result = tool_registry.execute("create_scatter_plot", {"session_id": "visual_test", "x_column": "age", "y_column": "income"})
save_and_open_chart(result, "scatter_age_income")

print("\n✅ Charts generated! Check the PNG files in your backend folder.")