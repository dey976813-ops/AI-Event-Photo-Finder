import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { api } from '../../services/api';
import { ScanFace, Calendar, MapPin, Users, Image as ImageIcon } from 'lucide-react';

const Event = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvent = async () => {
      const data = await api.events.getEventById(eventId);
      setEvent(data);
      setLoading(false);
    };
    fetchEvent();
  }, [eventId]);

  if (loading) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-white">Loading event...</div>;
  }

  if (!event) {
    return <div className="min-h-screen bg-background flex items-center justify-center text-white">Event not found.</div>;
  }

  return (
    <div className="min-h-screen bg-background text-primary">
      {/* Hero Cover */}
      <div className="relative h-[60vh] w-full">
        <img 
          src={event.coverImage} 
          alt={event.name} 
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/50 to-transparent" />
        
        {/* Content overlaid on cover */}
        <div className="absolute bottom-0 left-0 w-full p-8 md:p-16 flex flex-col items-center text-center">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-4"
          >
            <h1 className="text-5xl md:text-7xl font-display font-bold">{event.name}</h1>
            <p className="text-xl text-secondary">Wedding Memories</p>
          </motion.div>
        </div>
      </div>

      {/* Details & Action */}
      <div className="max-w-4xl mx-auto px-6 py-12">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-panel p-8 md:p-12 text-center"
        >
          <div className="flex flex-wrap justify-center gap-8 mb-12">
            <div className="flex items-center gap-2 text-secondary">
              <Calendar className="w-5 h-5 text-accent" />
              <span>{new Date(event.date).toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-2 text-secondary">
              <MapPin className="w-5 h-5 text-accent" />
              <span>{event.location}</span>
            </div>
            <div className="flex items-center gap-2 text-secondary">
              <ImageIcon className="w-5 h-5 text-accent" />
              <span>{event.photoCount.toLocaleString()} photos</span>
            </div>
          </div>

          <h2 className="text-3xl font-display mb-6">Find Your Photos instantly.</h2>
          <p className="text-secondary mb-10 max-w-lg mx-auto">
            Scan your face securely and our AI will find every moment you were captured in, out of the {event.photoCount.toLocaleString()} photos.
          </p>

          <button 
            onClick={() => navigate(`/event/${eventId}/scan`)}
            className="px-10 py-5 bg-accent text-background rounded-full font-bold text-xl hover:bg-accent/90 transition-all flex items-center justify-center gap-3 mx-auto shadow-[0_0_30px_rgba(212,175,55,0.3)] hover:shadow-[0_0_50px_rgba(212,175,55,0.5)] transform hover:-translate-y-1"
          >
            <ScanFace className="w-6 h-6" />
            Find My Photos
          </button>
        </motion.div>
      </div>
    </div>
  );
};

export default Event;
