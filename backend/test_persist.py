# Quick test to verify model persistence works
import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from tools.modeling import _persist_best_model, MODELS_DIR

# Create a simple mock model (just a dict for testing)
class MockModel:
    def predict(self, X):
        return [0] * len(X)

print(f"MODELS_DIR: {os.path.abspath(MODELS_DIR)}")
print(f"Exists: {os.path.isdir(MODELS_DIR)}")

try:
    model_id = _persist_best_model(
        session_id="test-session-123",
        best_model_name="TestModel",
        model_obj=MockModel(),
        problem_type="classification",
        target_column="target",
        feature_names=["feat1", "feat2", "feat3"],
        best_score=0.95,
        metrics={"accuracy": 0.95, "f1_score": 0.93},
    )
    print(f"\nSUCCESS: Model saved with id={model_id}")
    
    # Verify files exist
    pkl_path = os.path.join(MODELS_DIR, f"{model_id}.pkl")
    meta_path = os.path.join(MODELS_DIR, f"{model_id}_meta.json")
    print(f"  PKL exists: {os.path.exists(pkl_path)} ({pkl_path})")
    print(f"  META exists: {os.path.exists(meta_path)} ({meta_path})")
    
    # Clean up test files
    if os.path.exists(pkl_path):
        os.remove(pkl_path)
    if os.path.exists(meta_path):
        os.remove(meta_path)
    print("  Test files cleaned up.")
    
except Exception as e:
    import traceback
    print(f"\nFAILED: {e}")
    traceback.print_exc()
