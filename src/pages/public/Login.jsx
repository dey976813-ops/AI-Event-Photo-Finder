import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { Camera } from 'lucide-react';

const Login = () => {
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleContinue = async (e) => {
    e.preventDefault();
    if (phone.length < 10) return;
    
    setLoading(true);
    try {
      await login(phone);
      navigate('/otp', { state: { phone } });
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md glass-panel p-8 md:p-12"
      >
        <div className="flex justify-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
            <Camera className="w-8 h-8 text-accent" />
          </div>
        </div>

        <h1 className="text-3xl font-display text-center mb-2">Welcome Back.</h1>
        <p className="text-secondary text-center mb-8">Enter your phone number to continue to your dashboard.</p>

        <form onSubmit={handleContinue} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-secondary">Phone Number</label>
            <div className="relative">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary">+91</span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                placeholder="00000 00000"
                className="w-full bg-white/5 border border-white/10 rounded-xl py-3 pl-12 pr-4 text-white focus:outline-none focus:border-accent/50 transition-colors"
                maxLength={10}
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={phone.length < 10 || loading}
            className="w-full bg-accent hover:bg-accent/90 text-background font-semibold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Sending...' : 'Continue'}
          </button>
        </form>
      </motion.div>
    </div>
  );
};

export default Login;
