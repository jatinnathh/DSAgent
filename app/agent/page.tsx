"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';
import DatasetUpload from '@/app/components/DatasetUpload';
import AgentAnalysis from '@/app/components/AgentAnalysis';

interface UploadResult {
  session_id: string;
  filename: string;
  metadata: any;
  message: string;
}

export default function AgentPage() {
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const handleUploadSuccess = (result: UploadResult) => {
    setUploadResult(result);
  };

  const handleReset = () => {
    setUploadResult(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
      {/* Header */}
      <div className="border-b border-gray-700 bg-gray-900/50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-8 h-8 bg-cyan-500 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl font-bold text-white">DSAgent</h1>
                <p className="text-sm text-gray-400">Autonomous Data Science Agent</p>
              </div>
            </div>
            
            {uploadResult && (
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
              >
                Upload New Dataset
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="py-8">
        {!uploadResult ? (
          <DatasetUpload onUploadSuccess={handleUploadSuccess} />
        ) : (
          <AgentAnalysis 
            sessionId={uploadResult.session_id} 
            metadata={uploadResult.metadata} 
          />
        )}
      </div>

      {/* Background Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
      </div>
    </div>
  );
}