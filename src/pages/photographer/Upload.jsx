import React, { useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../services/api';
import { ArrowLeft, UploadCloud, CheckCircle2, Loader2 } from 'lucide-react';

const Upload = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [dragActive, setDragActive] = useState(false);
  const [uploadState, setUploadState] = useState('idle'); // idle, uploading, processing, complete
  const [progress, setProgress] = useState(0);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") setDragActive(true);
    else if (e.type === "dragleave") setDragActive(false);
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processFiles(e.dataTransfer.files);
    }
  };

  const processFiles = async (files) => {
    setUploadState('uploading');
    
    // Mock API call with progress callback
    await api.photos.uploadPhotos(eventId, files, (prog) => {
      setProgress(prog);
      if (prog === 100) {
        setTimeout(() => setUploadState('processing'), 500);
      }
    });

    // Simulate AI Processing delay
    setTimeout(() => {
      setUploadState('complete');
    }, 4000);
  };

  return (
    <div className="min-h-screen bg-background p-6 md:p-12 text-white">
      <button onClick={() => navigate(`/dashboard/events/${eventId}`)} className="flex items-center gap-2 text-secondary hover:text-white transition-colors mb-8">
        <ArrowLeft className="w-4 h-4" /> Back to Event
      </button>

      <div className="max-w-3xl mx-auto text-center">
        <h1 className="text-4xl font-display font-bold mb-4">Upload Photos</h1>
        <p className="text-secondary mb-12">Upload high-resolution event photos. Our AI will automatically detect and index faces.</p>

        <AnimatePresence mode="wait">
          {uploadState === 'idle' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`border-2 border-dashed rounded-3xl p-20 transition-all ${dragActive ? 'border-accent bg-accent/5' : 'border-white/20 hover:border-white/40 glass-panel'}`}
            >
              <UploadCloud className={`w-20 h-20 mx-auto mb-6 ${dragActive ? 'text-accent' : 'text-secondary'}`} />
              <h3 className="text-2xl font-bold mb-2">Drag & drop your photos here</h3>
              <p className="text-secondary mb-8">or click to select files (JPG, PNG, WebP)</p>
              
              <input type="file" multiple className="hidden" id="file-upload" onChange={(e) => processFiles(e.target.files)} />
              <label htmlFor="file-upload" className="bg-white text-background px-8 py-4 rounded-full font-bold cursor-pointer hover:bg-gray-200 transition-colors inline-block">
                Select Photos
              </label>
            </motion.div>
          )}

          {uploadState === 'uploading' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="glass-panel p-16 rounded-3xl flex flex-col items-center"
            >
              <UploadCloud className="w-16 h-16 text-white mb-6 animate-pulse" />
              <h3 className="text-2xl font-bold mb-8">Uploading 847 photos...</h3>
              <div className="w-full max-w-md h-3 bg-white/10 rounded-full overflow-hidden mb-4">
                <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
              <p className="text-secondary text-sm">{progress}% Complete</p>
            </motion.div>
          )}

          {uploadState === 'processing' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="glass-panel p-16 rounded-3xl flex flex-col items-center"
            >
              <Loader2 className="w-16 h-16 text-ai animate-spin mb-6" />
              <h3 className="text-2xl font-bold mb-4">AI Processing</h3>
              <div className="text-secondary space-y-2 text-left">
                <p className="flex items-center gap-2 text-white"><CheckCircle2 className="w-4 h-4 text-green-400" /> Upload complete</p>
                <p className="flex items-center gap-2 text-ai animate-pulse"><Loader2 className="w-4 h-4 animate-spin" /> Detecting faces & generating embeddings</p>
                <p className="flex items-center gap-2 opacity-50"><div className="w-4 h-4 border-2 border-current rounded-full" /> Indexing gallery</p>
              </div>
            </motion.div>
          )}

          {uploadState === 'complete' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="glass-panel p-16 rounded-3xl flex flex-col items-center border-green-500/30"
            >
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-6">
                <CheckCircle2 className="w-12 h-12 text-green-400" />
              </div>
              <h3 className="text-3xl font-bold mb-2">Upload Complete!</h3>
              <p className="text-secondary mb-8">847 photos successfully indexed and ready for discovery.</p>
              <button onClick={() => navigate(`/dashboard/events/${eventId}`)} className="bg-white text-background px-8 py-3 rounded-full font-bold hover:bg-gray-200 transition-colors">
                Back to Event
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default Upload;
