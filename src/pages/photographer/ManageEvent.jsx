import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../../services/api';
import { ArrowLeft, UploadCloud, QrCode, Image as ImageIcon, Users, Settings, Search } from 'lucide-react';

const ManageEvent = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);

  useEffect(() => {
    const fetchEvent = async () => {
      const data = await api.events.getEventById(eventId);
      setEvent(data);
    };
    fetchEvent();
  }, [eventId]);

  if (!event) return <div className="p-12 text-white">Loading...</div>;

  return (
    <div className="min-h-screen bg-background p-6 md:p-12">
      <button onClick={() => navigate('/dashboard')} className="flex items-center gap-2 text-secondary hover:text-white transition-colors mb-8">
        <ArrowLeft className="w-4 h-4" /> Back to Dashboard
      </button>

      <div className="flex flex-col md:flex-row gap-8 items-start mb-12">
        <img src={event.coverImage} alt={event.name} className="w-full md:w-64 h-64 object-cover rounded-xl border border-white/10" />
        <div>
          <div className="inline-block px-3 py-1 bg-white/10 text-xs rounded-full border border-white/20 mb-4">{event.status}</div>
          <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-2">{event.name}</h1>
          <p className="text-secondary mb-6">{new Date(event.date).toLocaleDateString()} • {event.location}</p>
          
          <div className="flex gap-4">
            <button 
              onClick={() => navigate(`/dashboard/events/${eventId}/upload`)}
              className="bg-accent text-background px-6 py-3 rounded-md font-semibold hover:bg-accent/90 transition-colors flex items-center gap-2"
            >
              <UploadCloud className="w-5 h-5" />
              Upload Photos
            </button>
            <button 
              onClick={() => navigate(`/dashboard/events/${eventId}/qr`)}
              className="bg-white/10 text-white px-6 py-3 rounded-md font-semibold hover:bg-white/20 transition-colors flex items-center gap-2"
            >
              <QrCode className="w-5 h-5" />
              Generate QR
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-white/10 mb-8 flex gap-8">
        <button className="pb-4 border-b-2 border-accent text-white font-medium">Photos</button>
        <button className="pb-4 border-b-2 border-transparent text-secondary hover:text-white transition-colors">Analytics</button>
        <button className="pb-4 border-b-2 border-transparent text-secondary hover:text-white transition-colors">Settings</button>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="glass-panel p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center"><ImageIcon className="text-secondary w-6 h-6" /></div>
          <div><p className="text-sm text-secondary">Total Photos</p><p className="text-2xl font-bold text-white">{event.photoCount}</p></div>
        </div>
        <div className="glass-panel p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-ai/10 flex items-center justify-center"><Search className="text-ai w-6 h-6" /></div>
          <div><p className="text-sm text-secondary">Faces Indexed</p><p className="text-2xl font-bold text-white">{event.faceCount}</p></div>
        </div>
        <div className="glass-panel p-6 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-accent/10 flex items-center justify-center"><Users className="text-accent w-6 h-6" /></div>
          <div><p className="text-sm text-secondary">Guest Scans</p><p className="text-2xl font-bold text-white">{event.guestCount}</p></div>
        </div>
      </div>
    </div>
  );
};

export default ManageEvent;
