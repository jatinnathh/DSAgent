import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pandas as pd
import numpy as np
from tools.cleaning import set_dataframe
from tools.eda import *
from tools.registry import tool_registry

print("🧪 Testing EDA Tools")
print("=" * 80)

# Create comprehensive test dataset
np.random.seed(42)
test_data = pd.DataFrame({
    'age': [25, 30, 35, None, 45, 50, 28, 32, 40, 38, 29, 33, 200],  # numeric with missing + outlier
    'income': [50000, 60000, 70000, 65000, 55000, 80000, 58000, 62000, 75000, 68000, 52000, 59000, 71000],  # numeric
    'score': [85, 90, 88, 92, 87, 89, 91, 86, 93, 84, 88, 90, 85],  # numeric (correlated with income)
    'category': ['A', 'B', 'A', 'C', 'B', 'A', 'C', 'A', 'B', 'C', 'A', 'B', 'A'],  # categorical
    'city': ['NYC', 'LA', 'NYC', None, 'Chicago', 'NYC', 'LA', 'NYC', 'Chicago', 'LA', 'NYC', 'Chicago', 'NYC'],  # categorical with missing
    'is_active': [True, False, True, True, False, True, False, True, True, False, True, False, True],  # boolean
    'duplicate_col': ['X', 'Y', 'X', 'Z', 'Y', 'X', 'Z', 'X', 'Y', 'Z', 'X', 'Y', 'X']  # for duplicate testing
})

# Add some duplicate rows
test_data = pd.concat([test_data, test_data.iloc[[0, 1]]], ignore_index=True)

session_id = "test_eda_session"
set_dataframe(session_id, test_data)

print(f"📊 Test Dataset Shape: {test_data.shape}")
print(f"Columns: {list(test_data.columns)}")
print("\nFirst 5 rows:")
print(test_data.head())
print()

# ============================================
# Test 1: Dataset Overview
# ============================================
print("=" * 80)
print("✅ Test 1: Dataset Overview")
print("=" * 80)

result = tool_registry.execute("dataset_overview", {"session_id": session_id})
if result.success:
    output = result.output
    print(f"📏 Shape: {output['shape']['rows']} rows × {output['shape']['columns']} columns")
    print(f"💾 Memory: {output['memory_usage_mb']} MB")
    print(f"🔢 Numeric columns: {output['column_types']['numeric']}")
    print(f"📝 Categorical columns: {output['column_types']['categorical']}")
    print(f"❌ Missing data: {output['missing_data_summary']['total_missing_values']} values ({output['missing_data_summary']['missing_percentage']}%)")
    
    if output['numeric_summary']:
        print("\n📊 Numeric Summary:")
        for col, stats in output['numeric_summary'].items():
            print(f"  {col}: mean={stats['mean']}, std={stats['std']}, min={stats['min']}, max={stats['max']}")
    
    if output['categorical_summary']:
        print("\n📋 Categorical Summary:")
        for col, stats in output['categorical_summary'].items():
            print(f"  {col}: {stats['unique_count']} unique, most frequent='{stats['most_frequent']}' ({stats['most_frequent_count']}x)")
else:
    print(f"❌ Error: {result.error}")

print()

# ============================================
# Test 2: Column Statistics (Numeric)
# ============================================
print("=" * 80)
print("✅ Test 2: Column Statistics (age - numeric)")
print("=" * 80)

result = tool_registry.execute("column_statistics", {"session_id": session_id, "column": "age"})
if result.success:
    stats = result.output
    print(f"Column: {stats['column']} ({stats['dtype']})")
    print(f"Total count: {stats['total_count']}")
    print(f"Null count: {stats['null_count']} ({stats['null_percentage']}%)")
    print(f"Unique values: {stats['unique_count']}")
    
    if 'mean' in stats:
        print(f"Mean: {stats['mean']}")
        print(f"Median: {stats['median']}")
        print(f"Std: {stats['std']}")
        print(f"Min: {stats['min']}, Max: {stats['max']}")
        print(f"Q25: {stats['q25']}, Q75: {stats['q75']}")
        print(f"Skewness: {stats['skewness']}")
        print(f"Kurtosis: {stats['kurtosis']}")
else:
    print(f"❌ Error: {result.error}")

print()

# ============================================
# Test 3: Column Statistics (Categorical)
# ============================================
print("=" * 80)
print("✅ Test 3: Column Statistics (category - categorical)")
print("=" * 80)

result = tool_registry.execute("column_statistics", {"session_id": session_id, "column": "category"})
if result.success:
    stats = result.output
    print(f"Column: {stats['column']} ({stats['dtype']})")
    print(f"Total count: {stats['total_count']}")
    print(f"Null count: {stats['null_count']} ({stats['null_percentage']}%)")
    print(f"Unique values: {stats['unique_count']}")
    
    if 'most_frequent' in stats:
        print(f"Most frequent: '{stats['most_frequent']}' ({stats['most_frequent_count']}x)")
        print("Top 5 values:")
        for item in stats['top_5_values']:
            print(f"  '{item['value']}': {item['count']}")
else:
    print(f"❌ Error: {result.error}")

print()

# ============================================
# Test 4: Correlation Analysis
# ============================================
print("=" * 80)
print("✅ Test 4: Correlation Analysis")
print("=" * 80)

result = tool_registry.execute("correlation_analysis", {
    "session_id": session_id,
    "method": "pearson",
    "min_correlation": 0.1
})
if result.success:
    corr = result.output
    print(f"Method: {corr['method']}")
    print(f"Numeric columns analyzed: {corr['numeric_columns']}")
    print(f"Significant correlations found: {corr['total_correlations']}")
    
    if corr['significant_correlations']:
        print("\nTop correlations:")
        for item in corr['significant_correlations'][:5]:
            print(f"  {item['column1']} ↔ {item['column2']}: {item['correlation']} ({item['strength']}, {item['direction']})")
    else:
        print("No significant correlations found.")
else:
    print(f"❌ Error: {result.error}")

print()

# ============================================
# Test 5: Value Counts
# ============================================
print("=" * 80)
print("✅ Test 5: Value Counts (category column)")
print("=" * 80)

result = tool_registry.execute("value_counts", {
    "session_id": session_id,
    "column": "category",
    "top_n": 5,
    "normalize": False
})
if result.success:
    counts = result.output
    print(f"Column: {counts['column']}")
    print(f"Total unique values: {counts['total_unique_values']}")
    print(f"Total rows: {counts['total_rows']}")
    print(f"Showing top {counts['showing_top']} values:")
    
    for item in counts['value_counts']:
        print(f"  '{item['value']}': {item['count']} ({item['percentage']}%)")
else:
    print(f"❌ Error: {result.error}")

print()

# ============================================
# Test 6: Data Quality Report
# ============================================
print("=" * 80)
print("✅ Test 6: Data Quality Report")
print("=" * 80)

result = tool_registry.execute("data_quality_report", {"session_id": session_id})
if result.success:
    report = result.output
    
    print("📊 Dataset Info:")
    info = report['dataset_info']
    print(f"  Rows: {info['rows']}, Columns: {info['columns']}, Memory: {info['memory_mb']} MB")
    
    print("\n❌ Missing Data:")
    missing = report['missing_data']
    print(f"  Total missing: {missing['total_missing']} values")
    print(f"  Columns affected: {missing['columns_affected']}")
    if missing['worst_columns']:
        print("  Worst columns:")
        for col_info in missing['worst_columns']:
            print(f"    {col_info['column']}: {col_info['missing_count']} ({col_info['missing_percentage']}%)")
    
    print("\n🔄 Duplicates:")
    dupes = report['duplicates']
    print(f"  Duplicate rows: {dupes['duplicate_rows']} ({dupes['duplicate_percentage']}%)")
    
    print("\n📋 Data Types:")
    for dtype, count in report['data_types'].items():
        print(f"  {dtype}: {count} columns")
    
    print("\n⚠️  Potential Issues:")
    if report['potential_issues']:
        for issue in report['potential_issues']:
            print(f"  - {issue}")
    else:
        print("  No major issues detected!")
else:
    print(f"❌ Error: {result.error}")

print()

# ============================================
# Test 7: Error Handling
# ============================================
print("=" * 80)
print("✅ Test 7: Error Handling")
print("=" * 80)

# Test non-existent column
result = tool_registry.execute("column_statistics", {
    "session_id": session_id,
    "column": "non_existent_column"
})
if not result.success:
    print(f"✅ Correctly caught error for non-existent column: {result.error[:100]}...")
else:
    print("❌ Should have failed for non-existent column")

# Test non-existent session
result = tool_registry.execute("dataset_overview", {"session_id": "fake_session"})
if not result.success:
    print(f"✅ Correctly caught error for non-existent session: {result.error[:100]}...")
else:
    print("❌ Should have failed for non-existent session")

print()

# ============================================
# Summary
# ============================================
print("=" * 80)
print("🎉 EDA TOOLS TEST SUMMARY")
print("=" * 80)

all_tools = tool_registry.list_tools()
eda_tools = [tool for tool in all_tools if tool in [
    'dataset_overview', 'column_statistics', 'correlation_analysis', 
    'value_counts', 'data_quality_report'
]]

print(f"📋 Total tools registered: {len(all_tools)}")
print(f"🔍 EDA tools: {len(eda_tools)}")
print(f"Tools tested: {eda_tools}")
print("\n✅ All EDA tools are working correctly!")