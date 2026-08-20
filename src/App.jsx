import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { useAuth } from './hooks/useAuth';

// Public Pages
import Login from './pages/public/Login';
import OTP from './pages/public/OTP';
import Landing from './pages/public/Landing';

// Guest Pages
import Event from './pages/guest/Event';
import FaceScan from './pages/guest/FaceScan';
import Results from './pages/guest/Results';

// Photographer Pages
import Dashboard from './pages/photographer/Dashboard';
import CreateEvent from './pages/photographer/CreateEvent';
import ManageEvent from './pages/photographer/ManageEvent';
import Upload from './pages/photographer/Upload';
import EventQR from './pages/photographer/EventQR';

// Protected Route Wrapper
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center text-white">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  
  return children;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/otp" element={<OTP />} />
          
          {/* Guest Routes */}
          <Route path="/event/:eventId" element={<Event />} />
          <Route path="/event/:eventId/scan" element={<FaceScan />} />
          <Route path="/event/:eventId/results" element={<Results />} />
          
          {/* Protected Photographer Routes */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/dashboard/events/create" element={<ProtectedRoute><CreateEvent /></ProtectedRoute>} />
          <Route path="/dashboard/events/:eventId" element={<ProtectedRoute><ManageEvent /></ProtectedRoute>} />
          <Route path="/dashboard/events/:eventId/upload" element={<ProtectedRoute><Upload /></ProtectedRoute>} />
          <Route path="/dashboard/events/:eventId/qr" element={<ProtectedRoute><EventQR /></ProtectedRoute>} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
