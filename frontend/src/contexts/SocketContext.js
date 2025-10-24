import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { Platform } from 'react-native';
import { useAuth } from './AuthContext';

const SocketContext = createContext({});

import Constants from 'expo-constants';

let SOCKET_URL = 'http://localhost:5000';
try {
  // Prefer explicit config from app.json extra
  if (Constants.expoConfig?.extra?.socketUrl) {
    SOCKET_URL = Constants.expoConfig.extra.socketUrl;
  } else {
    const dbg = Constants.manifest?.debuggerHost ||
                Constants.manifest2?.debuggerHost ||
                Constants.expoConfig?.extra?.debuggerHost ||
                Constants.manifest?.bundleUrl ||
                Constants.manifest2?.bundleUrl ||
                Constants.expoConfig?.extra?.bundleUrl;

    if (typeof dbg === 'string' && dbg.length > 0) {
      let host = null;
      const ipMatch = dbg.match(/(\d{1,3}(?:\.\d{1,3}){3})/);
      if (ipMatch) {
        host = ipMatch[1];
      } else {
        try {
          const url = new URL(dbg.includes('://') ? dbg : `http://${dbg}`);
          host = url.hostname;
        } catch (e) {
          if (dbg.includes(':')) host = dbg.split(':')[0];
          else host = dbg;
        }
      }

      if (host) {
        if ((host === 'localhost' || host === '127.0.0.1') && Platform.OS === 'android') {
          SOCKET_URL = 'http://10.0.2.2:5000';
        } else {
          SOCKET_URL = `http://${host}:5000`;
        }
      }
    }
  }
} catch (e) {
  // ignore
}

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { token } = useAuth();

  useEffect(() => {
    if (token) {
      const newSocket = io(SOCKET_URL, {
        transports: ['websocket'],
        reconnection: true,
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
      });

      newSocket.on('connect', () => {
        console.log('Socket connected');
        setConnected(true);
        setIsAuthenticated(false);
        newSocket.emit('authenticate', token);
      });

      newSocket.on('disconnect', () => {
        console.log('Socket disconnected');
        setConnected(false);
        setIsAuthenticated(false);
      });

      newSocket.on('authenticated', (data) => {
        if (data.success) {
          console.log('Socket authenticated');
          setIsAuthenticated(true);
        } else {
          console.error('Socket authentication failed');
          setIsAuthenticated(false);
        }
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    }
  }, [token]);

  const joinRoom = (roomId) => {
    if (socket && connected && isAuthenticated) {
      socket.emit('join-room', roomId);
    }
  };

  const leaveRoom = () => {
    if (socket && connected && isAuthenticated) {
      socket.emit('leave-room');
    }
  };

  const joinGame = (gameId) => {
    if (socket && connected && isAuthenticated) {
      socket.emit('join-game', gameId);
    }
  };

  const sendMessage = (roomId, message) => {
    if (socket && connected && isAuthenticated) {
      socket.emit('chat-message', { roomId, message });
    }
  };

  const setPlayerReady = (roomId, isReady) => {
    if (socket && connected && isAuthenticated) {
      socket.emit('player-ready', { roomId, isReady });
    }
  };

  const startGame = (roomId) => {
    if (socket && connected && isAuthenticated) {
      socket.emit('start-game', roomId);
    }
  };

  const selectCategory = (gameId, category) => {
    if (socket && connected && isAuthenticated) {
      socket.emit('category-selected', { gameId, category });
    }
  };

  const selectLetter = (gameId, letter) => {
    if (socket && connected && isAuthenticated) {
      socket.emit('letter-selected', { gameId, letter });
    }
  };

  const stopRound = (gameId) => {
    if (socket && connected && isAuthenticated) {
      socket.emit('player-stopped', { gameId });
    }
  };

  const confirmCategories = (gameId) => {
    if (socket && connected && isAuthenticated) {
      socket.emit('confirm-categories', gameId);
    }
  };

  const categoryPhaseReady = (gameId) => {
    if (socket && connected && isAuthenticated) {
      socket.emit('category-phase-ready', gameId);
    }
  };

  const deleteRoom = (roomId) => {
    if (socket && connected && isAuthenticated) {
      socket.emit('delete-room', roomId);
    }
  };

  return (
    <SocketContext.Provider value={{
      socket,
      connected,
      isAuthenticated,
      joinRoom,
      leaveRoom,
      joinGame,
      sendMessage,
      setPlayerReady,
      startGame,
      selectCategory,
      selectLetter,
      stopRound,
      confirmCategories,
      categoryPhaseReady,
      deleteRoom
    }}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within SocketProvider');
  }
  return context;
};
