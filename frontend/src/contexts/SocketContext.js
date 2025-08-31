import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext({});

import Constants from 'expo-constants';

let SOCKET_URL = 'http://localhost:5000';
try {
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
  } else if (Constants.expoConfig?.extra?.socketUrl) {
    SOCKET_URL = Constants.expoConfig.extra.socketUrl;
  }
} catch (e) {
  // ignore
}

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
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
        newSocket.emit('authenticate', token);
      });

      newSocket.on('disconnect', () => {
        console.log('Socket disconnected');
        setConnected(false);
      });

      newSocket.on('authenticated', (data) => {
        if (data.success) {
          console.log('Socket authenticated');
        } else {
          console.error('Socket authentication failed');
        }
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    }
  }, [token]);

  const joinRoom = (roomId) => {
    if (socket && connected) {
      socket.emit('join-room', roomId);
    }
  };

  const leaveRoom = () => {
    if (socket && connected) {
      socket.emit('leave-room');
    }
  };

  const joinGame = (gameId) => {
    if (socket && connected) {
      socket.emit('join-game', gameId);
    }
  };

  const sendMessage = (roomId, message) => {
    if (socket && connected) {
      socket.emit('chat-message', { roomId, message });
    }
  };

  const setPlayerReady = (roomId, isReady) => {
    if (socket && connected) {
      socket.emit('player-ready', { roomId, isReady });
    }
  };

  const startGame = (roomId) => {
    if (socket && connected) {
      socket.emit('start-game', roomId);
    }
  };

  const selectCategory = (gameId, category) => {
    if (socket && connected) {
      socket.emit('category-selected', { gameId, category });
    }
  };

  const selectLetter = (gameId, letter) => {
    if (socket && connected) {
      socket.emit('letter-selected', { gameId, letter });
    }
  };

  const stopRound = (gameId) => {
    if (socket && connected) {
      socket.emit('player-stopped', { gameId });
    }
  };

  return (
    <SocketContext.Provider value={{
      socket,
      connected,
      joinRoom,
      leaveRoom,
      joinGame,
      sendMessage,
      setPlayerReady,
      startGame,
      selectCategory,
      selectLetter,
      stopRound
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
