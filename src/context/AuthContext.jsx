import React, { createContext, useState, useEffect } from 'react';
import { api } from '../services/api';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Check local storage for mocked session
    const storedUser = localStorage.getItem('momentai_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = async (phone) => {
    return await api.auth.loginWithPhone(phone);
  };

  const verifyOTP = async (phone, otp) => {
    const response = await api.auth.verifyOTP(phone, otp);
    if (response.success) {
      setUser(response.user);
      localStorage.setItem('momentai_user', JSON.stringify(response.user));
    }
    return response;
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('momentai_user');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, verifyOTP, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
