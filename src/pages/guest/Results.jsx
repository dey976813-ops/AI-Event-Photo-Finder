import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { api } from '../../services/api';
import PhotoViewer from '../../components/specific/PhotoViewer';
import { Download, Share2, ScanFace } from 'lucide-react';

const Results = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewerIndex, setViewerIndex] = useState(null);

  useEffect(() => {
    const fetchMatches = async () => {
      // Pass null for blob since we mock it
      const matches = await api.photos.findMatchingPhotos(eventId, null);
      setPhotos(matches);
      setLoading(false);
    };
    fetchMatches();
  }, [eventId]);

  // CSS for Masonry Columns
  const masonryClass = "columns-1 sm:columns-2 md:columns-3 lg:columns-4 xl:columns-5 gap-6 space-y-6";

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-white">Loading matches...</div>;
  }

  return (
    <div className="min-h-screen bg-background text-primary p-6 md:p-12">
      
      {/* Header */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-7xl mx-auto mb-16 pt-12"
      >
        <button onClick={() => navigate(`/event/${eventId}`)} className="text-secondary hover:text-white mb-8 transition-colors text-sm font-medium">
          ← Back to Event
        </button>
        <h1 className="text-5xl md:text-7xl font-display font-bold mb-4">WE FOUND YOU.</h1>
        <p className="text-xl text-secondary flex items-center gap-2">
          <ScanFace className="w-5 h-5 text-ai" />
          <span className="text-white font-bold">{photos.length}</span> moments matched your face.
        </p>
      </motion.div>

      {/* Masonry Gallery */}
      <div className="max-w-7xl mx-auto">
        <div className={masonryClass}>
          {photos.map((photo, index) => (
            <motion.div
              key={photo.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
              className="break-inside-avoid relative group rounded-lg overflow-hidden cursor-pointer"
              onClick={() => setViewerIndex(index)}
            >
              <img 
                src={photo.url} 
                alt="Match" 
                className="w-full object-cover rounded-lg"
                loading="lazy"
              />
              
              {/* Hover Overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-between p-4">
                <div className="flex justify-end">
                  <div className="bg-ai/90 text-white text-xs px-2 py-1 rounded border border-ai/50 backdrop-blur-md">
                    {(photo.matchConfidence * 100).toFixed(0)}% Match
                  </div>
                </div>
                <div className="flex gap-2 justify-end transform translate-y-4 group-hover:translate-y-0 transition-transform duration-300">
                  <button className="p-2 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-white transition-colors" onClick={(e) => { e.stopPropagation(); /* Download logic */ }}>
                    <Download className="w-5 h-5" />
                  </button>
                  <button className="p-2 bg-white/20 hover:bg-white/40 backdrop-blur-md rounded-full text-white transition-colors" onClick={(e) => { e.stopPropagation(); /* Share logic */ }}>
                    <Share2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Lightbox */}
      <AnimatePresence>
        {viewerIndex !== null && (
          <PhotoViewer 
            photos={photos} 
            currentIndex={viewerIndex} 
            onClose={() => setViewerIndex(null)} 
            onNavigate={setViewerIndex}
          />
        )}
      </AnimatePresence>

    </div>
  );
};

export default Results;
