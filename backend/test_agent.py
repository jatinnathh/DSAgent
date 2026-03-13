import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Import tools to register everything
import tools

import pandas as pd
import numpy as np
from tools.cleaning import set_dataframe
from tools.registry import tool_registry
import asyncio

print("🧠 Testing DSAgent - LLM Orchestrator")
print("=" * 80)

# Create test dataset
np.random.seed(42)
test_data = pd.DataFrame({
    'age': np.random.randint(18, 65, 100),
    'income': np.random.normal(60000, 20000, 100),
    'experience': np.random.randint(0, 30, 100),
    'education': np.random.choice(['High School', 'Bachelor', 'Master', 'PhD'], 100),
    'satisfaction': np.random.uniform(1, 10, 100),
    'hours_per_week': np.random.normal(40, 8, 100)
})

# Create realistic target based on features
test_data['will_quit'] = (
    (test_data['satisfaction'] < 4) | 
    (test_data['hours_per_week'] > 50) |
    (test_data['income'] < 40000)
).astype(int)

session_id = "agent_test_session"
set_dataframe(session_id, test_data)

print(f"📊 Test Dataset: {test_data.shape}")
print(f"Columns: {list(test_data.columns)}")
print(f"Target distribution: {test_data['will_quit'].value_counts().to_dict()}")
print()

# Check if agent tools are registered
print("=" * 80)
print("🔍 Checking Agent Registration")
print("=" * 80)

all_tools = tool_registry.list_tools()
print(f"📋 Total tools registered: {len(all_tools)}")

if 'run_agent_analysis' in all_tools:
    print("✅ Agent tool registered successfully")
else:
    print("❌ Agent tool not found")
    print(f"Available tools: {all_tools}")
    exit()

print()

# ============================================
# Test 1: Basic Agent Analysis
# ============================================
print("=" * 80)
print("✅ Test 1: Basic Agent Analysis")
print("=" * 80)

print("🤖 Running agent analysis...")
print("⏳ This may take 30-60 seconds as the agent thinks and uses tools...")

result = tool_registry.execute("run_agent_analysis", {
    "session_id": session_id,
    "max_iterations": 5  # Limit for testing
})

if result.success:
    output = result.output
    print(f"✅ Agent analysis completed!")
    print(f"Session ID: {output['session_id']}")
    print(f"Iterations: {output['iterations']}")
    print(f"Conversation length: {output['conversation_length']}")
    print(f"Completed: {output['is_complete']}")
    
    print(f"\n🎯 Final Answer:")
    print("-" * 60)
    print(output['final_answer'])
    print("-" * 60)
else:
    print(f"❌ Agent analysis failed: {result.error}")
    print(f"Execution time: {result.execution_time_ms}ms")

print()

# ============================================
# Test 2: Agent with Specific Question
# ============================================
print("=" * 80)
print("✅ Test 2: Agent with Specific Question")
print("=" * 80)

print("🤖 Asking agent a specific question...")

result = tool_registry.execute("run_agent_analysis", {
    "session_id": session_id,
    "user_question": "What factors most influence employee turnover in this dataset?",
    "max_iterations": 6
})

if result.success:
    output = result.output
    print(f"✅ Agent answered the question!")
    print(f"Iterations: {output['iterations']}")
    
    print(f"\n🎯 Agent's Answer:")
    print("-" * 60)
    print(output['final_answer'])
    print("-" * 60)
else:
    print(f"❌ Agent failed to answer: {result.error}")

print()

# ============================================
# Test 3: Direct Agent API Test
# ============================================
print("=" * 80)
print("✅ Test 3: Direct Agent API Test")
print("=" * 80)

try:
    from core.agent import agent
    from core.metadata import metadata_to_llm_prompt
    
    # Create metadata prompt
    class MockMetadata:
        def __init__(self, df):
            self.filename = "test_dataset.csv"
            self.row_count = len(df)
            self.column_count = len(df.columns)
            self.columns = []
            
            for col in df.columns:
                self.columns.append(type('obj', (object,), {
                    'name': col,
                    'dtype': str(df[col].dtype),
                    'null_count': int(df[col].isnull().sum()),
                    'null_percentage': round((df[col].isnull().sum() / len(df)) * 100, 2),
                    'unique_count': int(df[col].nunique()),
                    'sample_values': df[col].dropna().head(3).tolist()
                })())
            
            self.numeric_columns = df.select_dtypes(include=['number']).columns.tolist()
            self.categorical_columns = df.select_dtypes(include=['object']).columns.tolist()
            self.datetime_columns = []
            self.memory_usage_mb = 0.1
            self.sample_rows = df.head(3).to_dict('records')
    
    metadata = MockMetadata(test_data)
    metadata_prompt = metadata_to_llm_prompt(metadata)
    
    print("🤖 Testing direct agent call...")
    print("📡 This will test the LLM API connection...")
    
    async def test_agent():
        try:
            response = await agent.analyze_dataset(
                session_id=session_id,
                metadata_prompt=metadata_prompt,
                user_question="Give me a quick summary of this dataset",
                max_iterations=2
            )
            return response
        except Exception as e:
            return f"Error: {str(e)}"
    
    # Run async test
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    response = loop.run_until_complete(test_agent())
    loop.close()
    
    if isinstance(response, str):
        print(f"❌ Direct agent test failed: {response}")
    else:
        print(f"✅ Direct agent test successful!")
        print(f"Final answer: {response.final_answer[:200]}...")
        
except Exception as e:
    print(f"❌ Direct agent test error: {str(e)}")

print()

# ============================================
# Test 4: LLM Endpoint Test
# ============================================
print("=" * 80)
print("✅ Test 4: LLM Endpoint Test")
print("=" * 80)

try:
    import httpx
    
    async def test_llm_endpoint():
        payload = {
            "model": "openai/gpt-4o",
            "messages": [
                {"role": "user", "content": "Hello, can you help me analyze data?"}
            ]
        }
        
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post("http://localhost:3000/api/llm/run", json=payload)
            return response.status_code, response.text[:200]
    
    print("📡 Testing LLM endpoint connection...")
    
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    status_code, response_text = loop.run_until_complete(test_llm_endpoint())
    loop.close()
    
    if status_code == 200:
        print(f"✅ LLM endpoint working! Status: {status_code}")
        print(f"Response preview: {response_text}...")
    else:
        print(f"❌ LLM endpoint error! Status: {status_code}")
        print(f"Error: {response_text}")
        
except Exception as e:
    print(f"❌ LLM endpoint test failed: {str(e)}")
    print("💡 Make sure your Next.js server is running on localhost:3000")

print()

# ============================================
# Summary
# ============================================
print("=" * 80)
print("🎉 AGENT TEST SUMMARY")
print("=" * 80)

all_tools = tool_registry.list_tools()
print(f"📋 Total tools registered: {len(all_tools)}")
print(f"🧠 Agent tool available: {'run_agent_analysis' in all_tools}")
print(f"🛠️  Tool categories:")
print(f"   - Cleaning: 5 tools")
print(f"   - EDA: 5 tools") 
print(f"   - Visualization: 5 tools")
print(f"   - Modeling: 6 tools")
print(f"   - Agent: 1 tool")

print(f"\n🚀 DSAgent is ready to autonomously analyze datasets!")
print(f"💡 The agent will use Bytez API → GPT-4o to orchestrate all {len(all_tools)} tools")