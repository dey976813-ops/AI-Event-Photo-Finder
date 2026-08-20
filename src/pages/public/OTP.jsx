import React, { useState, useRef, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAuth } from '../../hooks/useAuth';
import { ArrowLeft } from 'lucide-react';

const OTP = () => {
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { verifyOTP } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const inputRefs = useRef([]);

  const phone = location.state?.phone || '';

  useEffect(() => {
    if (!phone) navigate('/login');
  }, [phone, navigate]);

  const handleChange = (index, value) => {
    if (isNaN(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);

    // Auto-focus next input
    if (value !== '' && index < 5) {
      inputRefs.current[index + 1].focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && index > 0 && otp[index] === '') {
      inputRefs.current[index - 1].focus();
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    const otpString = otp.join('');
    if (otpString.length < 6) return;

    setLoading(true);
    setError('');
    
    try {
      await verifyOTP(phone, otpString);
      navigate('/dashboard');
    } catch (err) {
      setError('Invalid code. Try 123456');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md glass-panel p-8 md:p-12 relative"
      >
        <button 
          onClick={() => navigate('/login')}
          className="absolute top-6 left-6 text-secondary hover:text-white transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        <div className="mt-6 mb-8 text-center">
          <h1 className="text-3xl font-display mb-2">Verify Number.</h1>
          <p className="text-secondary">Enter the 6-digit code sent to +91 {phone}</p>
        </div>

        <form onSubmit={handleVerify} className="space-y-8">
          <div className="flex justify-between gap-2">
            {otp.map((digit, index) => (
              <input
                key={index}
                ref={(el) => (inputRefs.current[index] = el)}
                type="text"
                maxLength={1}
                value={digit}
                onChange={(e) => handleChange(index, e.target.value)}
                onKeyDown={(e) => handleKeyDown(index, e)}
                className="w-12 h-14 bg-white/5 border border-white/10 rounded-xl text-center text-xl text-white focus:outline-none focus:border-accent/50 transition-colors"
              />
            ))}
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <button
            type="submit"
            disabled={otp.join('').length < 6 || loading}
            className="w-full bg-accent hover:bg-accent/90 text-background font-semibold py-3 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Verifying...' : 'Verify'}
          </button>
        </form>

        <p className="text-center text-secondary text-sm mt-6">
          Didn't receive the code? <button className="text-accent hover:underline">Resend OTP</button>
        </p>
      </motion.div>
    </div>
  );
};

export default OTP;
