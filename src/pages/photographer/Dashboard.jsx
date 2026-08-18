import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { api } from '../../services/api';
import { Calendar, Image as ImageIcon, Users, Plus, LogOut, Settings, LayoutDashboard } from 'lucide-react';

const Dashboard = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);

  useEffect(() => {
    const fetchEvents = async () => {
      const data = await api.events.getEvents();
      setEvents(data);
    };
    fetchEvents();
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <div className="w-64 border-r border-white/10 p-6 flex flex-col justify-between hidden md:flex">
        <div>
          <h2 className="text-xl font-display font-bold tracking-widest mb-12">MOMENTAI.</h2>
          <nav className="space-y-4">
            <button className="flex items-center gap-3 text-white font-medium w-full p-3 rounded-lg bg-white/5">
              <LayoutDashboard className="w-5 h-5 text-accent" />
              Dashboard
            </button>
            <button className="flex items-center gap-3 text-secondary hover:text-white transition-colors w-full p-3">
              <Calendar className="w-5 h-5" />
              Events
            </button>
            <button className="flex items-center gap-3 text-secondary hover:text-white transition-colors w-full p-3">
              <Settings className="w-5 h-5" />
              Settings
            </button>
          </nav>
        </div>
        <button onClick={handleLogout} className="flex items-center gap-3 text-red-400 hover:text-red-300 transition-colors w-full p-3">
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </div>

      {/* Main Content */}
      <div className="flex-1 p-8 md:p-12 overflow-y-auto">
        <header className="flex justify-between items-center mb-12">
          <div>
            <h1 className="text-3xl font-display mb-2">Good evening, {user?.name || 'Photographer'}.</h1>
            <p className="text-secondary">Here is an overview of your events.</p>
          </div>
          <button 
            onClick={() => navigate('/dashboard/events/create')}
            className="bg-accent text-background px-6 py-3 rounded-full font-semibold hover:bg-accent/90 transition-colors flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Create Event
          </button>
        </header>

        <h2 className="text-xl font-display mb-6 tracking-wide text-secondary">YOUR EVENTS</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map(event => (
            <div key={event.id} className="glass-panel p-6 hover:border-accent/30 transition-colors group">
              <div className="h-40 w-full rounded-lg overflow-hidden mb-4 relative">
                <img src={event.coverImage} alt={event.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
                <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-md px-2 py-1 rounded text-xs text-white border border-white/10">
                  {event.status}
                </div>
              </div>
              
              <h3 className="text-lg font-bold mb-1 truncate">{event.name}</h3>
              <p className="text-sm text-secondary mb-4 flex items-center gap-2">
                <Calendar className="w-4 h-4" /> {new Date(event.date).toLocaleDateString()}
              </p>
              
              <div className="flex justify-between text-sm text-secondary mb-6 border-t border-white/10 pt-4">
                <div className="flex items-center gap-1"><ImageIcon className="w-4 h-4" /> {event.photoCount}</div>
                <div className="flex items-center gap-1"><Users className="w-4 h-4" /> {event.faceCount}</div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button 
                  onClick={() => navigate(`/dashboard/events/${event.id}`)}
                  className="bg-white/10 hover:bg-white/20 text-white py-2 rounded-md transition-colors text-sm font-medium"
                >
                  Manage
                </button>
                <button 
                  onClick={() => navigate(`/dashboard/events/${event.id}/qr`)}
                  className="border border-white/20 hover:border-white/40 text-white py-2 rounded-md transition-colors text-sm font-medium"
                >
                  QR Code
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
