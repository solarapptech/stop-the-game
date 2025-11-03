import React, { createContext, useState, useContext, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

const AuthContext = createContext({});

// Compute API URL:
// - If running in Expo Go (debuggerHost available) use the host IP with backend port 5000
// - Otherwise allow overriding via Constants.expoConfig.extra.apiUrl (EAS) or fallback to localhost
let API_URL = 'http://localhost:5000/api';
try {
  // Prefer explicit config when provided (e.g., production or staging builds)
  if (Constants.expoConfig?.extra?.apiUrl) {
    API_URL = Constants.expoConfig.extra.apiUrl;
  } else {
    // Try several places for the packager/debugger host. This is important when
    // running Expo on a real device: the bundle is served from your machine IP
    // (e.g. 192.168.1.106), and that IP should be used to reach the backend.
    const dbg = Constants.manifest?.debuggerHost ||
                Constants.manifest2?.debuggerHost ||
                Constants.expoConfig?.extra?.debuggerHost ||
                // bundleUrl may exist and include the host (e.g. exp://192.168.1.106:19000)
                Constants.manifest?.bundleUrl ||
                Constants.manifest2?.bundleUrl ||
                Constants.expoConfig?.extra?.bundleUrl;

    if (typeof dbg === 'string' && dbg.length > 0) {
      // Try to extract an IP or hostname from the packager/debugger value.
      let host = null;
      // First, look for an IP address like 192.168.1.106
      const ipMatch = dbg.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
      if (ipMatch) {
        host = ipMatch[1];
      } else {
        // Try to parse as a URL (exp://..., http://...)
        try {
          const url = new URL(dbg.includes('://') ? dbg : `http://${dbg}`);
          host = url.hostname;
        } catch (e) {
          // Fallback: split on ':' and take first part (e.g. '192.168.1.106:8081')
          if (dbg.includes(':')) host = dbg.split(':')[0];
          else host = dbg;
        }
      }

      if (host) {
        // If host resolves to localhost/127.0.0.1 and we're on Android emulator,
        // map to emulator host; otherwise use the detected host.
        if ((host === 'localhost' || host === '127.0.0.1') && Platform.OS === 'android') {
          API_URL = 'http://10.0.2.2:5000/api';
        } else {
          API_URL = `http://${host}:5000/api`;
        }
      }
    } else if (Platform.OS === 'android') {
      // No packager host found. Don't assume emulator by default — keep localhost
      // and instruct developers to set `extra.apiUrl` in app.json for physical devices.
      // We only fall back to the emulator mapping when explicitly required.
      API_URL = 'http://localhost:5000/api';
    }
  }
} catch (e) {
  // ignore and keep default
}

// Configure axios base URL for convenience. Ensure trailing slash so relative paths
// like 'auth/register' become '<baseURL>auth/register' -> '<host>/api/auth/register'.
axios.defaults.baseURL = API_URL.endsWith('/') ? API_URL : `${API_URL}/`;

// Set a reasonable timeout so requests fail fast instead of hanging forever
// (React Native/fetch has no default network timeout). 10s is a good compromise.
axios.defaults.timeout = 10000;

// Debug: surface the computed API URL at startup
console.log('[AuthContext] API_URL =', API_URL);
console.log('[AuthContext] axios.baseURL =', axios.defaults.baseURL, 'timeout =', axios.defaults.timeout);

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
  const loginEndpoint = `${axios.defaults.baseURL || API_URL}auth/login`;
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
  const registerEndpoint = `${axios.defaults.baseURL || API_URL}auth/register`;
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

  const updateDisplayName = async (displayName) => {
    try {
      const response = await axios.put('auth/displayname', { displayName });
      
      const updatedUser = { ...user, displayName: response.data.user.displayName };
      setUser(updatedUser);
      await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
      
      return { success: true };
    } catch (error) {
      console.error('[AuthContext] updateDisplayName error:', error);
      return {
        success: false,
        error: error.response?.data?.message || error.message || 'Failed to update display name'
      };
    }
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
      updateDisplayName,
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
