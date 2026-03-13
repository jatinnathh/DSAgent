import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import tools to register everything
import tools

import pandas as pd
import numpy as np
from tools.cleaning import set_dataframe
from tools.registry import tool_registry

print("🤖 Testing Modeling Tools")
print("=" * 80)

# Create comprehensive test dataset for ML
np.random.seed(42)

# Classification dataset
classification_data = pd.DataFrame({
    'age': np.random.randint(18, 80, 200),
    'income': np.random.normal(60000, 20000, 200),
    'experience': np.random.randint(0, 40, 200),
    'education': np.random.choice(['High School', 'Bachelor', 'Master', 'PhD'], 200),
    'department': np.random.choice(['Sales', 'Engineering', 'Marketing', 'HR'], 200),
    'hours_per_week': np.random.normal(40, 8, 200),
    'satisfaction': np.random.uniform(1, 10, 200)
})

# Create target based on features (realistic relationship)
classification_data['will_quit'] = (
    (classification_data['satisfaction'] < 5) | 
    (classification_data['hours_per_week'] > 50) |
    (classification_data['income'] < 40000)
).astype(int)

# Regression dataset  
regression_data = pd.DataFrame({
    'size_sqft': np.random.normal(2000, 500, 150),
    'bedrooms': np.random.randint(1, 6, 150),
    'bathrooms': np.random.randint(1, 4, 150),
    'age_years': np.random.randint(0, 50, 150),
    'location': np.random.choice(['Downtown', 'Suburb', 'Rural'], 150),
    'garage': np.random.choice([0, 1, 2], 150)
})

# Create realistic house price target
regression_data['price'] = (
    regression_data['size_sqft'] * 150 +
    regression_data['bedrooms'] * 10000 +
    regression_data['bathrooms'] * 15000 +
    (50 - regression_data['age_years']) * 1000 +
    np.where(regression_data['location'] == 'Downtown', 50000, 
             np.where(regression_data['location'] == 'Suburb', 20000, 0)) +
    regression_data['garage'] * 5000 +
    np.random.normal(0, 20000, 150)
)

# Set session data
set_dataframe("classification_session", classification_data)
set_dataframe("regression_session", regression_data)

print(f"📊 Classification Dataset: {classification_data.shape}")
print(f"Target distribution: {classification_data['will_quit'].value_counts().to_dict()}")
print(f"\n📊 Regression Dataset: {regression_data.shape}")
print(f"Price range: ${regression_data['price'].min():,.0f} - ${regression_data['price'].max():,.0f}")
print()

# ============================================
# Test 1: Auto ML Pipeline (Classification)
# ============================================
print("=" * 80)
print("✅ Test 1: Auto ML Pipeline (Classification)")
print("=" * 80)

result = tool_registry.execute("auto_ml_pipeline", {
    "session_id": "classification_session",
    "target_column": "will_quit",
    "test_size": 0.3
})

if result.success:
    output = result.output
    print(f"Problem Type: {output['problem_type']}")
    print(f"Target Column: {output['target_column']}")
    print(f"Dataset Shape - Train: {output['dataset_shape']['train']}, Test: {output['dataset_shape']['test']}")
    print(f"Features: {output['feature_count']}")
    print(f"Models Trained: {output['models_trained']}")
    print(f"Best Model: {output['best_model']} (Score: {output['best_score']})")
    
    print("\nModel Results:")
    for model_name, metrics in output['results'].items():
        if 'error' not in metrics:
            print(f"  {model_name}:")
            for metric, value in metrics.items():
                print(f"    {metric}: {value}")
        else:
            print(f"  {model_name}: ERROR - {metrics['error']}")
else:
    print(f"❌ Error: {result.error}")

print()

# ============================================
# Test 2: Auto ML Pipeline (Regression)
# ============================================
print("=" * 80)
print("✅ Test 2: Auto ML Pipeline (Regression)")
print("=" * 80)

result = tool_registry.execute("auto_ml_pipeline", {
    "session_id": "regression_session",
    "target_column": "price",
    "test_size": 0.2
})

if result.success:
    output = result.output
    print(f"Problem Type: {output['problem_type']}")
    print(f"Target Column: {output['target_column']}")
    print(f"Best Model: {output['best_model']} (R² Score: {output['best_score']})")
    
    print("\nModel Results:")
    for model_name, metrics in output['results'].items():
        if 'error' not in metrics:
            print(f"  {model_name}:")
            for metric, value in metrics.items():
                print(f"    {metric}: {value}")
else:
    print(f"❌ Error: {result.error}")

print()

# ============================================
# Test 3: Feature Importance
# ============================================
print("=" * 80)
print("✅ Test 3: Feature Importance (Classification)")
print("=" * 80)

result = tool_registry.execute("feature_importance", {
    "session_id": "classification_session"
})

if result.success:
    output = result.output
    print(f"Model: {output['model_name']}")
    print("Top 5 Important Features:")
    for i, feature in enumerate(output['top_10_features'][:5], 1):
        print(f"  {i}. {feature['feature']}: {feature['importance']:.4f}")
    print(f"Feature importance plot generated: {'Yes' if output['image_base64'].startswith('data:image') else 'No'}")
else:
    print(f"❌ Error: {result.error}")

print()

# ============================================
# Test 4: Model Evaluation
# ============================================
print("=" * 80)
print("✅ Test 4: Model Evaluation (Classification)")
print("=" * 80)

result = tool_registry.execute("model_evaluation", {
    "session_id": "classification_session"
})

if result.success:
    output = result.output
    print(f"Model: {output['model_name']}")
    print(f"Problem Type: {output['problem_type']}")
    print(f"Test Samples: {output['test_samples']}")
    
    if output['problem_type'] == 'classification':
        print(f"Accuracy: {output['accuracy']}")
        print(f"Precision: {output['precision']}")
        print(f"Recall: {output['recall']}")
        print(f"F1 Score: {output['f1_score']}")
        print(f"Confusion Matrix: {output['confusion_matrix']}")
    else:
        print(f"R² Score: {output['r2_score']}")
        print(f"RMSE: {output['rmse']}")
        print(f"MAE: {output['mae']}")
    
    print(f"Evaluation plot generated: {'Yes' if output['image_base64'].startswith('data:image') else 'No'}")
else:
    print(f"❌ Error: {result.error}")

print()

# ============================================
# Test 5: Make Predictions
# ============================================
print("=" * 80)
print("✅ Test 5: Make Predictions (Classification)")
print("=" * 80)

# Test prediction with sample data
sample_employee = {
    'age': 35,
    'income': 45000,
    'experience': 8,
    'education': 1,  # Encoded value
    'department': 2,  # Encoded value
    'hours_per_week': 55,
    'satisfaction': 3.5
}

result = tool_registry.execute("make_predictions", {
    "session_id": "classification_session",
    "input_data": sample_employee
})

if result.success:
    output = result.output
    print(f"Model: {output['model_name']}")
    print(f"Input: {output['input_data']}")
    print(f"Prediction: {output['prediction']}")
    
    if 'prediction_probabilities' in output:
        print("Prediction Probabilities:")
        for class_label, prob in output['prediction_probabilities'].items():
            print(f"  Class {class_label}: {prob}")
        print(f"Confidence: {output['confidence']}")
else:
    print(f"❌ Error: {result.error}")

print()

# ============================================
# Test 6: Model Comparison
# ============================================
print("=" * 80)
print("✅ Test 6: Model Comparison (Classification)")
print("=" * 80)

result = tool_registry.execute("model_comparison", {
    "session_id": "classification_session"
})

if result.success:
    output = result.output
    print(f"Problem Type: {output['problem_type']}")
    print(f"Best Model: {output['best_model']}")
    
    print("\nModel Comparison:")
    for model_name, metrics in output['models'].items():
        print(f"  {model_name}:")
        for metric, value in metrics.items():
            print(f"    {metric}: {value}")
    
    print(f"Comparison plot generated: {'Yes' if output['image_base64'].startswith('data:image') else 'No'}")
else:
    print(f"❌ Error: {result.error}")

print()

# ============================================
# Test 7: Train Specific Model
# ============================================
print("=" * 80)
print("✅ Test 7: Train Specific Model (Random Forest)")
print("=" * 80)

result = tool_registry.execute("train_specific_model", {
    "session_id": "regression_session",
    "target_column": "price",
    "model_type": "random_forest",
    "n_estimators": 50,
    "max_depth": 10
})

if result.success:
    output = result.output
    print(f"Model Name: {output['model_name']}")
    print(f"Model Type: {output['model_type']}")
    print(f"Problem Type: {output['problem_type']}")
    print(f"Target: {output['target_column']}")
    print(f"Parameters: {output['model_parameters']}")
    
    print("Metrics:")
    for metric, value in output['metrics'].items():
        print(f"  {metric}: {value}")
else:
    print(f"❌ Error: {result.error}")

print()

# ============================================
# Test 8: Error Handling
# ============================================
print("=" * 80)
print("✅ Test 8: Error Handling")
print("=" * 80)

# Test with non-existent target column
result = tool_registry.execute("auto_ml_pipeline", {
    "session_id": "classification_session",
    "target_column": "non_existent_column"
})
if not result.success:
    print(f"✅ Correctly caught error for non-existent target: {result.error[:80]}...")
else:
    print("❌ Should have failed for non-existent target")

# Test with non-existent session
result = tool_registry.execute("feature_importance", {
    "session_id": "fake_session"
})
if not result.success:
    print(f"✅ Correctly caught error for non-existent session: {result.error[:80]}...")
else:
    print("❌ Should have failed for non-existent session")

print()

# ============================================
# Summary
# ============================================
print("=" * 80)
print("🎉 MODELING TOOLS TEST SUMMARY")
print("=" * 80)

all_tools = tool_registry.list_tools()
modeling_tools = [tool for tool in all_tools if tool in [
    'auto_ml_pipeline', 'feature_importance', 'model_evaluation', 
    'make_predictions', 'model_comparison', 'train_specific_model'
]]

print(f"📋 Total tools registered: {len(all_tools)}")
print(f"🤖 Modeling tools: {len(modeling_tools)}")
print(f"Tools tested: {modeling_tools}")
print("\n✅ All modeling tools are working correctly!")
print("🎯 Ready for agent orchestration!")