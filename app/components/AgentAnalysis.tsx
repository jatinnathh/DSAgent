"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';

interface AnalysisResult {
  success: boolean;
  analysis?: {
    session_id: string;
    iterations: number;
    final_answer: string;
    is_complete: boolean;
    conversation_length: number;
  };
  error?: string;
  execution_time_ms: number;
}

interface AgentAnalysisProps {
  sessionId: string;
  metadata: any;
}

export default function AgentAnalysis({ sessionId, metadata }: AgentAnalysisProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [question, setQuestion] = useState('');

  const runAnalysis = async (userQuestion?: string) => {
    setAnalyzing(true);
    setResult(null);

    try {
      const response = await fetch('/api/agent/analyze', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          session_id: sessionId,
          question: userQuestion || undefined,
          max_iterations: 8,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Analysis failed');
      }

      const analysisResult = await response.json();
      setResult(analysisResult);
    } catch (err: any) {
      setResult({
        success: false,
        error: err.message || 'Analysis failed',
        execution_time_ms: 0,
      });
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Dataset Info */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-800/50 rounded-xl p-6 border border-gray-700"
      >
        <h3 className="text-xl font-semibold text-white mb-4">Dataset Overview</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-gray-400">Filename</p>
            <p className="text-white font-medium">{metadata.filename}</p>
          </div>
          <div>
            <p className="text-gray-400">Rows</p>
            <p className="text-white font-medium">{metadata.row_count.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-gray-400">Columns</p>
            <p className="text-white font-medium">{metadata.column_count}</p>
          </div>
          <div>
            <p className="text-gray-400">Size</p>
            <p className="text-white font-medium">{metadata.memory_usage_mb} MB</p>
          </div>
        </div>
      </motion.div>

      {/* Analysis Controls */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-gray-800/50 rounded-xl p-6 border border-gray-700"
      >
        <h3 className="text-xl font-semibold text-white mb-4">AI Analysis</h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Ask a specific question (optional)
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g., What are the key insights from this data?"
              className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:border-cyan-400 focus:outline-none"
              disabled={analyzing}
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => runAnalysis()}
              disabled={analyzing}
              className="px-6 py-2 bg-cyan-500 hover:bg-cyan-600 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
            >
              {analyzing ? 'Analyzing...' : 'Run Full Analysis'}
            </button>
            
            {question && (
              <button
                onClick={() => runAnalysis(question)}
                disabled={analyzing}
                className="px-6 py-2 bg-purple-500 hover:bg-purple-600 disabled:bg-gray-600 text-white rounded-lg font-medium transition-colors"
              >
                {analyzing ? 'Analyzing...' : 'Ask Question'}
              </button>
            )}
          </div>
        </div>
      </motion.div>

      {/* Analysis Progress */}
      {analyzing && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-gray-800/50 rounded-xl p-6 border border-gray-700"
        >
          <div className="flex items-center space-x-4">
            <div className="animate-spin w-8 h-8 border-4 border-cyan-400 border-t-transparent rounded-full" />
            <div>
              <p className="text-white font-medium">DSAgent is analyzing your data...</p>
              <p className="text-gray-400 text-sm">This may take 30-60 seconds</p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Analysis Results */}
      {result && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800/50 rounded-xl p-6 border border-gray-700"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-white">Analysis Results</h3>
            <span className="text-sm text-gray-400">
              {result.execution_time_ms}ms
            </span>
          </div>

          {result.success ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-gray-400">Iterations</p>
                  <p className="text-white font-medium">{result.analysis?.iterations}</p>
                </div>
                <div>
                  <p className="text-gray-400">Status</p>
                  <p className="text-green-400 font-medium">
                    {result.analysis?.is_complete ? 'Complete' : 'Partial'}
                  </p>
                </div>
                <div>
                  <p className="text-gray-400">Steps</p>
                  <p className="text-white font-medium">{result.analysis?.conversation_length}</p>
                </div>
              </div>

              <div className="border-t border-gray-600 pt-4">
                <h4 className="text-lg font-medium text-white mb-3">AI Insights</h4>
                <div className="bg-gray-900/50 rounded-lg p-4">
                  <pre className="text-gray-300 whitespace-pre-wrap text-sm leading-relaxed">
                    {result.analysis?.final_answer}
                  </pre>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <p className="text-red-400">{result.error}</p>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}