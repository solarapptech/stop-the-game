import React, { createContext, useContext, useState } from 'react';
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const GameContext = createContext({});

import API_URL from '../config';
console.log('[GameContext] using API_URL from config =', API_URL);

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
      // Read token explicitly and include as header to avoid timing issues
      const token = await AsyncStorage.getItem('authToken');
      if (token) {
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      }

  const url = 'room/create';
  console.log('[GameContext] createRoom -> URL (relative):', url, ' base=', API_URL);
      console.log('[GameContext] createRoom -> token from storage:', token);
      console.log('[GameContext] createRoom -> Auth header (defaults):', axios.defaults.headers.common['Authorization']);

      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const response = await axios.post(url, roomData, { headers });
      setCurrentRoom(response.data.room);
      return { success: true, room: response.data.room };
    } catch (error) {
      // Detailed logging for debugging
      console.error('[GameContext] createRoom error (initial):', error);
      if (error.response) {
        console.error('[GameContext] createRoom response status (initial):', error.response.status);
        console.error('[GameContext] createRoom response data (initial):', error.response.data);
      } else if (error.request) {
        console.error('[GameContext] createRoom no response (initial), request:', error.request);
      } else {
        console.error('[GameContext] createRoom request setup error (initial):', error.message);
      }

      // If unauthorized, try to explicitly set Authorization header from AsyncStorage and retry once
      try {
        const status = error.response?.status;
        if (status === 401) {
          const token = await AsyncStorage.getItem('authToken');
          if (token) {
            console.log('[GameContext] createRoom retrying with token from storage');
            const headers = { Authorization: `Bearer ${token}` };
            const retryUrl = 'room/create';
            const retryResp = await axios.post(retryUrl, roomData, { headers });
            setCurrentRoom(retryResp.data.room);
            return { success: true, room: retryResp.data.room };
          }
        }
      } catch (retryError) {
        console.error('[GameContext] createRoom retry error:', retryError);
        if (retryError.response) {
          console.error('[GameContext] createRoom retry response status:', retryError.response.status);
          console.error('[GameContext] createRoom retry response data:', retryError.response.data);
        }
      }

      // Build helpful error message
      let message = 'Failed to create room';
      if (error.response?.data?.message) message = error.response.data.message;
      else if (!error.response && error.request) message = 'No response from server. Check backend URL and network.';
      else if (error.message) message = error.message;

      return { 
        success: false, 
        error: message,
        status: error.response?.status,
        data: error.response?.data
      };
    }
  };

  const joinRoom = async (roomId, password = null) => {
    try {
      const response = await axios.post(`room/join/${roomId}`, { password });
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
      const response = await axios.post('room/join-by-code', { 
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
        await axios.post(`room/leave/${currentRoom.id}`);
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
      const response = await axios.get('room/public');
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
      const response = await axios.post(`game/start/${roomId}`);
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
      const response = await axios.post(`game/${gameId}/category`, { category });
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
      const response = await axios.post(`game/${gameId}/confirm-categories`);
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
      const response = await axios.post(`game/${gameId}/letter`, { letter });
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
      const response = await axios.post(`game/${gameId}/submit`, {
        answers: answersData,
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
      const response = await axios.post(`game/${gameId}/validate`);
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
      const response = await axios.post(`game/${gameId}/next-round`);
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
      const response = await axios.get(`game/${gameId}`);
      setGameState(response.data.game);
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
