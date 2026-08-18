import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ScanFace, ArrowLeft, Loader2 } from 'lucide-react';

const FaceScan = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [progress, setProgress] = useState(0);

  const startScan = () => {
    setScanning(true);
    
    // Simulate scan delay
    setTimeout(() => {
      setScanning(false);
      setProcessing(true);
    }, 3000);
  };

  useEffect(() => {
    if (processing) {
      // Simulate AI processing progress
      const interval = setInterval(() => {
        setProgress(p => {
          if (p >= 100) {
            clearInterval(interval);
            setTimeout(() => navigate(`/event/${eventId}/results`), 500);
            return 100;
          }
          return p + 2;
        });
      }, 50);
      return () => clearInterval(interval);
    }
  }, [processing, eventId, navigate]);

  return (
    <div className="min-h-screen bg-black text-white flex flex-col relative overflow-hidden">
      {/* Background Particles (Simulated with simple divs for MVP) */}
      <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-ai/40 via-background to-background" />

      {/* Header */}
      <div className="relative z-10 p-6 flex justify-between items-center">
        <button onClick={() => navigate(`/event/${eventId}`)} className="p-3 bg-white/5 rounded-full hover:bg-white/10 transition-colors">
          <ArrowLeft className="w-6 h-6" />
        </button>
        <div className="font-display font-bold tracking-widest text-sm text-secondary">MOMENTAI SCANNERS</div>
        <div className="w-12" /> {/* Spacer */}
      </div>

      {/* Main Scanner Area */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 relative z-10">
        
        <AnimatePresence mode="wait">
          {!processing ? (
            <motion.div 
              key="scanner"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
              className="flex flex-col items-center"
            >
              {/* Scanner Frame */}
              <div className="relative w-72 h-96 md:w-96 md:h-[30rem] mb-12">
                {/* Camera Viewport (Simulated with dark glass) */}
                <div className="absolute inset-4 bg-white/5 rounded-3xl backdrop-blur-sm border border-white/10 overflow-hidden flex items-center justify-center">
                  <ScanFace className="w-32 h-32 text-white/20" />
                  
                  {/* Scanning Animation */}
                  {scanning && (
                    <motion.div 
                      animate={{ top: ['0%', '100%'] }}
                      transition={{ duration: 1.5, repeat: Infinity, ease: 'linear' }}
                      className="absolute left-0 right-0 h-1 bg-ai shadow-[0_0_20px_rgba(99,102,241,0.8)]"
                    />
                  )}
                </div>

                {/* Corner Markers */}
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-ai rounded-tl-xl" />
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-ai rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-ai rounded-bl-xl" />
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-ai rounded-br-xl" />
              </div>

              <h2 className="text-2xl font-display mb-2 text-center">
                {scanning ? 'SCANNING...' : 'POSITION YOUR FACE INSIDE THE FRAME'}
              </h2>
              
              {!scanning && (
                <button 
                  onClick={startScan}
                  className="mt-8 px-8 py-4 bg-white text-black rounded-full font-bold text-lg hover:bg-gray-200 transition-colors"
                >
                  Start Scanning
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div 
              key="processing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center w-full max-w-md"
            >
              <Loader2 className="w-16 h-16 text-ai animate-spin mb-8" />
              <h2 className="text-3xl font-display mb-8 text-center">ANALYZING 1,284 PHOTOS</h2>
              
              {/* Progress Bar */}
              <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden mb-4">
                <motion.div 
                  className="h-full bg-ai"
                  style={{ width: `${progress}%` }}
                />
              </div>
              
              {/* Stages text */}
              <div className="text-secondary text-sm font-mono uppercase tracking-wider h-6">
                {progress < 30 && "Detecting faces..."}
                {progress >= 30 && progress < 60 && "Generating embeddings..."}
                {progress >= 60 && progress < 90 && "Searching memories..."}
                {progress >= 90 && "Finding matches..."}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>
    </div>
  );
};

export default FaceScan;
