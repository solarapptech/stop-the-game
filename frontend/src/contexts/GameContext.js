import React, { createContext, useContext, useState } from 'react';
import axios from 'axios';

const GameContext = createContext({});

import Constants from 'expo-constants';
import { Platform } from 'react-native';

let API_URL = 'http://localhost:5000/api';
try {
  // Prefer explicit config (production/staging)
  if (Constants.expoConfig?.extra?.apiUrl) {
    API_URL = Constants.expoConfig.extra.apiUrl;
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
          API_URL = 'http://10.0.2.2:5000/api';
        } else {
          API_URL = `http://${host}:5000/api`;
        }
      }
    }
  }
} catch (e) {
  // ignore
}

export const GameProvider = ({ children }) => {
  const [currentRoom, setCurrentRoom] = useState(null);
  const [currentGame, setCurrentGame] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [currentLetter, setCurrentLetter] = useState(null);
  const [roundTime, setRoundTime] = useState(60);
  const [answers, setAnswers] = useState({});

  const createRoom = async (roomData) => {
    try {
      const response = await axios.post(`${API_URL}/room/create`, roomData);
      setCurrentRoom(response.data.room);
      return { success: true, room: response.data.room };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to create room' 
      };
    }
  };

  const joinRoom = async (roomId, password = null) => {
    try {
      const response = await axios.post(`${API_URL}/room/join/${roomId}`, { password });
      setCurrentRoom(response.data.room);
      return { success: true, room: response.data.room };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to join room',
        needsPassword: error.response?.status === 401
      };
    }
  };

  const joinRoomByCode = async (inviteCode, password = null) => {
    try {
      const response = await axios.post(`${API_URL}/room/join-by-code`, { 
        inviteCode, 
        password 
      });
      setCurrentRoom(response.data.room);
      return { success: true, room: response.data.room };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to join room',
        needsPassword: error.response?.data?.needsPassword,
        roomName: error.response?.data?.roomName
      };
    }
  };

  const leaveRoom = async () => {
    if (currentRoom) {
      try {
        await axios.post(`${API_URL}/room/leave/${currentRoom.id}`);
        setCurrentRoom(null);
        return { success: true };
      } catch (error) {
        return { 
          success: false, 
          error: error.response?.data?.message || 'Failed to leave room' 
        };
      }
    }
  };

  const getPublicRooms = async () => {
    try {
      const response = await axios.get(`${API_URL}/room/public`);
      return { success: true, rooms: response.data.rooms };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to fetch rooms' 
      };
    }
  };

  const startGame = async (roomId) => {
    try {
      const response = await axios.post(`${API_URL}/game/start/${roomId}`);
      setCurrentGame(response.data.gameId);
      return { success: true, gameId: response.data.gameId };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to start game' 
      };
    }
  };

  const selectCategory = async (gameId, category) => {
    try {
      const response = await axios.post(`${API_URL}/game/${gameId}/category`, { category });
      setSelectedCategories(response.data.categories);
      return { success: true, categories: response.data.categories };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to select category' 
      };
    }
  };

  const confirmCategories = async (gameId) => {
    try {
      const response = await axios.post(`${API_URL}/game/${gameId}/confirm-categories`);
      setCategories(response.data.categories);
      return { success: true, categories: response.data.categories };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to confirm categories' 
      };
    }
  };

  const selectLetter = async (gameId, letter = null) => {
    try {
      const response = await axios.post(`${API_URL}/game/${gameId}/letter`, { letter });
      setCurrentLetter(response.data.letter);
      return { success: true, letter: response.data.letter };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to select letter' 
      };
    }
  };

  const submitAnswers = async (gameId, answersData, stoppedFirst = false) => {
    try {
      // Transform answersData: accept either array of {category, answer} or object map { [category]: answer }
      const payloadAnswers = Array.isArray(answersData)
        ? answersData
        : Object.entries(answersData || {}).map(([category, answer]) => ({ category, answer }));

      const response = await axios.post(`${API_URL}/game/${gameId}/submit`, {
        answers: payloadAnswers,
        stoppedFirst
      });
      return { success: true, status: response.data.status };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to submit answers' 
      };
    }
  };

  const validateAnswers = async (gameId) => {
    try {
      const response = await axios.post(`${API_URL}/game/${gameId}/validate`);
      return { 
        success: true, 
        standings: response.data.standings,
        roundResults: response.data.roundResults
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to validate answers' 
      };
    }
  };

  const nextRound = async (gameId) => {
    try {
      const response = await axios.post(`${API_URL}/game/${gameId}/next-round`);
      if (response.data.status === 'finished') {
        setCurrentGame(null);
        return { 
          success: true, 
          finished: true,
          winner: response.data.winner,
          finalStandings: response.data.finalStandings
        };
      }
      return { 
        success: true, 
        currentRound: response.data.currentRound,
        status: response.data.status
      };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to advance round' 
      };
    }
  };

  const getGameState = async (gameId) => {
    try {
      const response = await axios.get(`${API_URL}/game/${gameId}`);
      setGameState(response.data.game);
      if (Array.isArray(response.data.game?.categories)) {
        setCategories(response.data.game.categories);
      }
      if (typeof response.data.game?.currentLetter === 'string') {
        setCurrentLetter(response.data.game.currentLetter);
      }
      return { success: true, game: response.data.game };
    } catch (error) {
      return { 
        success: false, 
        error: error.response?.data?.message || 'Failed to fetch game state' 
      };
    }
  };

  const resetGame = () => {
    setCurrentGame(null);
    setGameState(null);
    setCategories([]);
    setSelectedCategories([]);
    setCurrentLetter(null);
    setAnswers({});
  };

  return (
    <GameContext.Provider value={{
      currentRoom,
      currentGame,
      gameState,
      categories,
      selectedCategories,
      currentLetter,
      roundTime,
      answers,
      setAnswers,
      createRoom,
      joinRoom,
      joinRoomByCode,
      leaveRoom,
      getPublicRooms,
      startGame,
      selectCategory,
      confirmCategories,
      selectLetter,
      submitAnswers,
      validateAnswers,
      nextRound,
      getGameState,
      setCurrentLetter,
      resetGame
    }}>
      {children}
    </GameContext.Provider>
  );
};

export const useGame = () => {
  const context = useContext(GameContext);
  if (!context) {
    throw new Error('useGame must be used within GameProvider');
  }
  return context;
};
