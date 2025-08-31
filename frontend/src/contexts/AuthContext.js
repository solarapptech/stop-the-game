import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const AuthContext = createContext({});

import API_URL from '../config';

// Debug: surface the computed API URL at startup
console.log('[AuthContext] API_URL (from config) =', API_URL, ' axios.baseURL =', axios.defaults.baseURL);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadStoredAuth();
  }, []);

  const loadStoredAuth = async () => {
    try {
      const storedToken = await AsyncStorage.getItem('authToken');
      const storedUser = await AsyncStorage.getItem('user');
      
      if (storedToken && storedUser) {
        setToken(storedToken);
        setUser(JSON.parse(storedUser));
        axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
      }
    } catch (error) {
      console.error('Error loading stored auth:', error);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
  console.log('[AuthContext] login called for', username);
  // Log the exact endpoint we will call to help diagnose network problems
  const base = API_URL.endsWith('/') ? API_URL : `${API_URL}/`;
  const loginEndpoint = `${base}auth/login`;
  console.log('[AuthContext] API_URL =', API_URL, ' axios.defaults.baseURL =', axios.defaults.baseURL);
  console.log('[AuthContext] login endpoint =', loginEndpoint);

  // use baseURL + relative path to avoid accidental double-prefixing
  const response = await axios.post('auth/login', {
        username,
        password
      });

      const { token, user } = response.data;
      
      await AsyncStorage.setItem('authToken', token);
      await AsyncStorage.setItem('user', JSON.stringify(user));
      
      setToken(token);
      setUser(user);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      return { success: true, user };
    } catch (error) {
      console.error('[AuthContext] login error:', error);
      // Better messages for common network issues
      let message = 'Login failed';
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        message = 'Request timed out. Please check your network and try again.';
      } else if (!error.response) {
        message = 'Network error. Please check your connection and backend URL.';
      } else {
        message = error.response?.data?.message || error.message || 'Login failed';
      }

      return { success: false, error: message };
    }
  };

  const register = async (email, username, password) => {
    try {
  console.log('[AuthContext] register called for', email, username);
  // Log the exact endpoint we will call to help diagnose network problems
  const baseReg = API_URL.endsWith('/') ? API_URL : `${API_URL}/`;
  const registerEndpoint = `${baseReg}auth/register`;
  console.log('[AuthContext] API_URL =', API_URL, ' axios.defaults.baseURL =', axios.defaults.baseURL);
  console.log('[AuthContext] register endpoint =', registerEndpoint);

  // use relative path so axios.baseURL is respected and easier to swap during runtime
  const response = await axios.post('auth/register', {
        email,
        username,
        password
      });

      const { token, user } = response.data;
      
      await AsyncStorage.setItem('authToken', token);
      await AsyncStorage.setItem('user', JSON.stringify(user));
      
      setToken(token);
      setUser(user);
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      
      return { success: true, user };
    } catch (error) {
      console.error('[AuthContext] register error:', error);
      let message = 'Registration failed';
      if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
        message = 'Request timed out. Please check your network and try again.';
      } else if (!error.response) {
        message = 'Network error. Please check your connection and backend URL.';
      } else {
        message = error.response?.data?.message || error.message || 'Registration failed';
      }

      return { success: false, error: message };
    }
  };

  const verifyEmail = async (code) => {
    try {
  const response = await axios.post('auth/verify', { code });
      
      const updatedUser = { ...user, verified: true };
      setUser(updatedUser);
      await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
      
      return { success: true };
    } catch (error) {
      console.error('[AuthContext] verifyEmail error:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Verification failed'
      };
    }
  };

  const resendVerificationCode = async () => {
    try {
  await axios.post('auth/resend-verification');
      return { success: true };
    } catch (error) {
      console.error('[AuthContext] resendVerificationCode error:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to resend code'
      };
    }
  };

  const logout = async () => {
    try {
      await AsyncStorage.removeItem('authToken');
      await AsyncStorage.removeItem('user');
      setToken(null);
      setUser(null);
      delete axios.defaults.headers.common['Authorization'];
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const updateUser = async (updates) => {
    const updatedUser = { ...user, ...updates };
    setUser(updatedUser);
    await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      login,
      register,
      logout,
      verifyEmail,
      resendVerificationCode,
      updateUser,
      isAuthenticated: !!token
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
