import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Download, Share2, X, ChevronLeft, ChevronRight } from 'lucide-react';

const PhotoViewer = ({ photos, currentIndex, onClose, onNavigate }) => {
  const [direction, setDirection] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handlePrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentIndex, photos.length]);

  const handleNext = () => {
    setDirection(1);
    onNavigate((currentIndex + 1) % photos.length);
  };

  const handlePrev = () => {
    setDirection(-1);
    onNavigate((currentIndex - 1 + photos.length) % photos.length);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/95 backdrop-blur-xl flex items-center justify-center"
    >
      {/* Top Bar */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-10 bg-gradient-to-b from-black/50 to-transparent">
        <div className="text-secondary text-sm">
          {currentIndex + 1} / {photos.length}
        </div>
        <div className="flex gap-4">
          <button className="p-2 text-white hover:text-accent transition-colors">
            <Download className="w-6 h-6" />
          </button>
          <button className="p-2 text-white hover:text-accent transition-colors">
            <Share2 className="w-6 h-6" />
          </button>
          <button onClick={onClose} className="p-2 text-white hover:text-red-400 transition-colors ml-4">
            <X className="w-8 h-8" />
          </button>
        </div>
      </div>

      {/* Navigation Buttons */}
      <button 
        onClick={handlePrev}
        className="absolute left-6 p-4 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors z-10 hidden md:block"
      >
        <ChevronLeft className="w-8 h-8" />
      </button>

      <button 
        onClick={handleNext}
        className="absolute right-6 p-4 rounded-full bg-white/5 hover:bg-white/10 text-white transition-colors z-10 hidden md:block"
      >
        <ChevronRight className="w-8 h-8" />
      </button>

      {/* Image Container */}
      <div className="relative w-full h-full flex items-center justify-center p-4 md:p-20">
        <AnimatePresence initial={false} custom={direction}>
          <motion.img
            key={currentIndex}
            src={photos[currentIndex].url}
            custom={direction}
            initial={{ opacity: 0, x: direction * 100 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: direction * -100 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="max-w-full max-h-full object-contain drop-shadow-2xl rounded-sm"
          />
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default PhotoViewer;
