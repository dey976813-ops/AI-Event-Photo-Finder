import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Link, Share2 } from 'lucide-react';

const EventQR = () => {
  const { eventId } = useParams();
  const navigate = useNavigate();

  // The actual guest URL they will scan
  const guestUrl = `https://momentai.demo/event/${eventId}`;

  return (
    <div className="min-h-screen bg-background p-6 md:p-12 flex flex-col items-center relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-accent/10 rounded-full blur-[120px] -z-10" />

      <div className="w-full max-w-4xl self-start mb-12">
        <button onClick={() => navigate(`/dashboard/events/${eventId}`)} className="flex items-center gap-2 text-secondary hover:text-white transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Event
        </button>
      </div>

      <h1 className="text-4xl md:text-5xl font-display font-bold text-white mb-4 text-center">SHARE YOUR EVENT</h1>
      <p className="text-secondary mb-12 text-center max-w-lg">
        Guests can scan this QR code to instantly find their photos from the event. Print this out and place it on tables or displays.
      </p>

      {/* QR Card - Designed to look like a physical printable card */}
      <div className="bg-white p-12 rounded-3xl shadow-2xl max-w-sm w-full text-center text-black mb-12">
        <h2 className="font-display font-bold text-2xl tracking-widest mb-2">MOMENTAI.</h2>
        <p className="text-gray-500 font-medium mb-8 uppercase tracking-wide text-sm">Find Your Photos</p>
        
        {/* Fake QR Code image */}
        <div className="aspect-square w-full bg-gray-100 rounded-xl mb-8 flex items-center justify-center border border-gray-200">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=https://momentai.demo" alt="QR Code" className="w-full h-full p-4 mix-blend-multiply" />
        </div>

        <p className="font-bold text-xl mb-1">Scan to find yourself.</p>
        <p className="text-gray-500 text-sm">No app required.</p>
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-4 justify-center">
        <button className="bg-white text-background px-8 py-4 rounded-full font-bold hover:bg-gray-200 transition-colors flex items-center gap-2">
          <Download className="w-5 h-5" /> Download PDF
        </button>
        <button className="bg-white/10 text-white border border-white/20 px-8 py-4 rounded-full font-bold hover:bg-white/20 transition-colors flex items-center gap-2">
          <Link className="w-5 h-5" /> Copy Link
        </button>
      </div>
    </div>
  );
};

export default EventQR;
