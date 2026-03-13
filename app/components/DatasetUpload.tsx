"use client";

import { useState } from 'react';
import { motion } from 'framer-motion';

interface UploadResult {
  session_id: string;
  filename: string;
  metadata: any;
  message: string;
}

interface DatasetUploadProps {
  onUploadSuccess: (result: UploadResult) => void;
}

export default function DatasetUpload({ onUploadSuccess }: DatasetUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      setError('Please upload a CSV file');
      return;
    }

    setUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/agent/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Upload failed');
      }

      const result = await response.json();
      onUploadSuccess(result);
    } catch (err: any) {
      setError(err.message || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFileUpload(files[0]);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center mb-8"
      >
        <h2 className="text-3xl font-bold text-white mb-4">
          Upload Your Dataset
        </h2>
        <p className="text-gray-400">
          Upload a CSV file and let DSAgent analyze it automatically
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`
          relative border-2 border-dashed rounded-xl p-12 text-center transition-all duration-300
          ${dragOver 
            ? 'border-cyan-400 bg-cyan-400/5' 
            : 'border-gray-600 hover:border-gray-500'
          }
          ${uploading ? 'pointer-events-none opacity-50' : ''}
        `}
        onDrop={handleDrop}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
      >
        {uploading ? (
          <div className="space-y-4">
            <div className="animate-spin w-12 h-12 border-4 border-cyan-400 border-t-transparent rounded-full mx-auto" />
            <p className="text-gray-300">Analyzing your dataset...</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="w-16 h-16 mx-auto bg-gray-800 rounded-full flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            
            <div>
              <p className="text-lg text-gray-300 mb-2">
                Drop your CSV file here, or{' '}
                <label className="text-cyan-400 hover:text-cyan-300 cursor-pointer underline">
                  browse
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileSelect}
                    className="hidden"
                  />
                </label>
              </p>
              <p className="text-sm text-gray-500">
                Supports CSV files up to 100MB
              </p>
            </div>
          </div>
        )}
      </motion.div>

      {error && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg"
        >
          <p className="text-red-400 text-sm">{error}</p>
        </motion.div>
      )}
    </div>
  );
}