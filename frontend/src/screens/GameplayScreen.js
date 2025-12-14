import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, ScrollView, TextInput, Alert, Animated, KeyboardAvoidingView, Platform, FlatList, BackHandler, ActivityIndicator, TouchableOpacity, Dimensions, AppState } from 'react-native';
import { Text, Button, Card, IconButton, Chip, ProgressBar, DataTable, Portal, Modal } from 'react-native-paper';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useFocusEffect } from '@react-navigation/native';
import { useSocket } from '../contexts/SocketContext';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import theme from '../theme';
import SettingsScreen from './SettingsScreen';

// Helper function to get icon for category
const getCategoryIcon = (category) => {
  const categoryLower = category.toLowerCase();
  
  // Exact matches
  const iconMap = {
    'fruit': 'fruit-cherries',
    'fruits': 'fruit-cherries',
    'name': 'account',
    'names': 'account',
    'animal': 'paw',
    'animals': 'paw',
    'country': 'earth',
    'countries': 'earth',
    'city': 'city',
    'cities': 'city',
    'color': 'palette',
    'colors': 'palette',
    'food': 'food',
    'drink': 'cup',
    'drinks': 'cup',
    'sport': 'basketball',
    'sports': 'basketball',
    'car': 'car',
    'cars': 'car',
    'brand': 'tag',
    'brands': 'tag',
    'movie': 'movie',
    'movies': 'movie',
    'book': 'book',
    'books': 'book',
    'game': 'gamepad-variant',
    'games': 'gamepad-variant',
    'profession': 'briefcase',
    'professions': 'briefcase',
    'job': 'briefcase',
    'jobs': 'briefcase',
    'celebrity': 'star',
    'celebrities': 'star',
    'clothing': 'tshirt-crew',
    'clothes': 'tshirt-crew',
    'vegetable': 'carrot',
    'vegetables': 'carrot',
    'flower': 'flower',
    'flowers': 'flower',
    'tree': 'tree',
    'trees': 'tree',
    'instrument': 'guitar-acoustic',
    'instruments': 'guitar-acoustic',
    'music': 'music',
    'band': 'music-box-multiple',
    'bands': 'music-box-multiple',
    'language': 'translate',
    'languages': 'translate',
    'company': 'office-building',
    'companies': 'office-building',
    'app': 'cellphone',
    'apps': 'cellphone',
    'website': 'web',
    'websites': 'web',
    'superhero': 'shield-star',
    'superheroes': 'shield-star',
    'cartoon': 'animation',
    'cartoons': 'animation',
    'toy': 'toy-brick',
    'toys': 'toy-brick',
    'dessert': 'cake',
    'desserts': 'cake',
    'candy': 'candy',
    'candies': 'candy',
    'restaurant': 'silverware-fork-knife',
    'restaurants': 'silverware-fork-knife',
    'hobby': 'puzzle',
    'hobbies': 'puzzle',
    'subject': 'school',
    'subjects': 'school',
    'planet': 'earth',
    'planets': 'earth',
    'ocean': 'waves',
    'oceans': 'waves',
    'river': 'waves',
    'rivers': 'waves',
    'mountain': 'image-filter-hdr',
    'mountains': 'image-filter-hdr',
    'bird': 'bird',
    'birds': 'bird',
    'fish': 'fish',
    'fishes': 'fish',
    'insect': 'bug',
    'insects': 'bug',
  };
  
  // Check for exact match
  if (iconMap[categoryLower]) {
    return iconMap[categoryLower];
  }
  
  // Check for partial matches
  if (categoryLower.includes('fruit')) return 'fruit-cherries';
  if (categoryLower.includes('animal')) return 'paw';
  if (categoryLower.includes('country') || categoryLower.includes('nation')) return 'earth';
  if (categoryLower.includes('city') || categoryLower.includes('town')) return 'city';
  if (categoryLower.includes('color') || categoryLower.includes('colour')) return 'palette';
  if (categoryLower.includes('food')) return 'food';
  if (categoryLower.includes('drink') || categoryLower.includes('beverage')) return 'cup';
  if (categoryLower.includes('sport')) return 'basketball';
  if (categoryLower.includes('car') || categoryLower.includes('vehicle')) return 'car';
  if (categoryLower.includes('brand')) return 'tag';
  if (categoryLower.includes('movie') || categoryLower.includes('film')) return 'movie';
  if (categoryLower.includes('book')) return 'book';
  if (categoryLower.includes('game')) return 'gamepad-variant';
  if (categoryLower.includes('job') || categoryLower.includes('profession')) return 'briefcase';
  if (categoryLower.includes('celebrity') || categoryLower.includes('famous')) return 'star';
  if (categoryLower.includes('cloth') || categoryLower.includes('wear')) return 'tshirt-crew';
  if (categoryLower.includes('vegetable') || categoryLower.includes('veggie')) return 'carrot';
  if (categoryLower.includes('flower')) return 'flower';
  if (categoryLower.includes('tree')) return 'tree';
  if (categoryLower.includes('instrument') || categoryLower.includes('music')) return 'guitar-acoustic';
  if (categoryLower.includes('language')) return 'translate';
  if (categoryLower.includes('company') || categoryLower.includes('business')) return 'office-building';
  if (categoryLower.includes('app') || categoryLower.includes('application')) return 'cellphone';
  if (categoryLower.includes('website') || categoryLower.includes('web')) return 'web';
  if (categoryLower.includes('hero')) return 'shield-star';
  if (categoryLower.includes('cartoon')) return 'animation';
  if (categoryLower.includes('toy')) return 'toy-brick';
  if (categoryLower.includes('dessert') || categoryLower.includes('sweet')) return 'cake';
  if (categoryLower.includes('candy')) return 'candy';
  if (categoryLower.includes('restaurant')) return 'silverware-fork-knife';
  if (categoryLower.includes('hobby')) return 'puzzle';
  if (categoryLower.includes('subject') || categoryLower.includes('school')) return 'school';
  if (categoryLower.includes('planet') || categoryLower.includes('space')) return 'earth';
  if (categoryLower.includes('ocean') || categoryLower.includes('sea')) return 'waves';
  if (categoryLower.includes('river')) return 'waves';
  if (categoryLower.includes('mountain')) return 'image-filter-hdr';
  if (categoryLower.includes('bird')) return 'bird';
  if (categoryLower.includes('fish')) return 'fish';
  if (categoryLower.includes('insect') || categoryLower.includes('bug')) return 'bug';
  if (categoryLower.includes('name')) return 'account';
  
  // Default icon
  return 'help-circle-outline';
};

const GameplayScreen = ({ navigation, route }) => {
  const { gameId } = route.params;
  const { user, refreshUser, updateUser, markStatsDirty } = useAuth();
  const { t } = useLanguage();
  const { socket, connected, isAuthenticated, joinGame, selectCategory, selectLetter, stopRound, confirmCategories, categoryPhaseReady, readyNextRound, playAgainReady, leaveRoom: socketLeaveRoom } = useSocket();
  const userId = (user && (user.id || user._id)) || null;
  const { 
    gameState, 
    categories, 
    currentLetter, 
    submitAnswers, 
    validateAnswers,
    nextRound,
    getGameState,
    setCurrentLetter
  } = useGame();
  
  const [phase, setPhase] = useState('category-selection'); // category-selection, letter-selection, playing, validation, round-end
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(60);
  const [selectTimeLeft, setSelectTimeLeft] = useState(60);
  const [selectionDeadline, setSelectionDeadline] = useState(null);
  const [roundResults, setRoundResults] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [playerScores, setPlayerScores] = useState([]);
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(3);
  const [isPlayerTurn, setIsPlayerTurn] = useState(false);
  const [hasStoppedFirst, setHasStoppedFirst] = useState(false);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [letterInput, setLetterInput] = useState('');
  const [letterDeadline, setLetterDeadline] = useState(null);
  const [letterTimeLeft, setLetterTimeLeft] = useState(12);
  const [letterSelectorName, setLetterSelectorName] = useState('');
  const [letterSelectorId, setLetterSelectorId] = useState(null);
  const [showReveal, setShowReveal] = useState(false);
  const [revealTimeLeft, setRevealTimeLeft] = useState(3);
  const [isFrozen, setIsFrozen] = useState(false);
  const [showStopOverlay, setShowStopOverlay] = useState(false);
  const [readyCount, setReadyCount] = useState(0);
  const [readyTotal, setReadyTotal] = useState(0);
  const [nextCountdown, setNextCountdown] = useState(null);
  const [isFinished, setIsFinished] = useState(false);
  const [finalConfirmed, setFinalConfirmed] = useState(false);
  const [rematchReady, setRematchReady] = useState(0);
  const [rematchTotal, setRematchTotal] = useState(0);
  const [hasVotedRematch, setHasVotedRematch] = useState(false);
  const [rematchAborted, setRematchAborted] = useState(false);
  const [rematchCountdown, setRematchCountdown] = useState(null);
  const [viewingPlayerId, setViewingPlayerId] = useState(null);
  const [hiddenInputs, setHiddenInputs] = useState({});
  const [hideAllInputs, setHideAllInputs] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState(null);
  const [isRefreshingGameplay, setIsRefreshingGameplay] = useState(false);
  const [gameplayRefreshError, setGameplayRefreshError] = useState(null);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [categoryStuckTimer, setCategoryStuckTimer] = useState(0);
  const [showManualReload, setShowManualReload] = useState(false);
  const [isReloadingCategories, setIsReloadingCategories] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [roundGainMap, setRoundGainMap] = useState({});
  const [disconnectedPlayers, setDisconnectedPlayers] = useState(new Set());
  
  const timerRef = useRef(null);
  const inputRefs = useRef({});
  const scrollViewRef = useRef(null);
  const cardRefs = useRef({});
  const selectTimerRef = useRef(null);
  const autoRetryTimerRef = useRef(null);
  const announcedReadyRef = useRef(false);
  const categoryStuckTimerRef = useRef(null);
  const categoryStuckCountRef = useRef(0);
  const autoManualReloadTriggeredRef = useRef(false);
  const letterTimerRef = useRef(null);
  const revealTimerRef = useRef(null);
  const confettiRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const answersRef = useRef(answers);
  const stopShownRef = useRef(false);
  const phaseRef = useRef(phase);
  const userIdRef = useRef(userId);
  const isLeavingRef = useRef(false);
  const backgroundLeaveTriggeredRef = useRef(false);
  const roundGainAnimMapRef = useRef({});
  const roundGainTimeoutRef = useRef(null);
  const { height: winH, width: winW } = Dimensions.get('window');
  const HEADER_HEIGHT = Math.max(56, Math.round(winH * 0.07));
  const CIRCLE_SIZE = Math.max(28, Math.min(64, Math.round(HEADER_HEIGHT * 0.70)));

  useFocusEffect(
    useCallback(() => {
      isLeavingRef.current = false;
    }, [gameId])
  );

  useEffect(() => {
    loadGameState();
    if (joinGame && gameId) joinGame(gameId);
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (selectTimerRef.current) clearInterval(selectTimerRef.current);
      if (letterTimerRef.current) clearInterval(letterTimerRef.current);
      if (revealTimerRef.current) clearInterval(revealTimerRef.current);
      if (autoRetryTimerRef.current) clearInterval(autoRetryTimerRef.current);
      if (categoryStuckTimerRef.current) clearInterval(categoryStuckTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      handleLeaveGame();
      return true;
    });
    return () => backHandler.remove();
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (isLeavingRef.current) return;
      // Allow internal Gameplay replace (e.g., rematch or gameId change)
      const targetRoute = e?.data?.action?.payload?.name;
      if (targetRoute === 'Gameplay') {
        return;
      }
      e.preventDefault();
      handleLeaveGame();
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  // Ensure we join the game room once socket is connected and authenticated
  useEffect(() => {
    if (joinGame && gameId && socket && connected && isAuthenticated) {
      joinGame(gameId);
    }
  }, [socket, connected, isAuthenticated, joinGame, gameId]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'background' || nextState === 'inactive') {
        if (backgroundLeaveTriggeredRef.current) return;
        if (isLeavingRef.current) return;

        if (socket && connected && isAuthenticated) {
          backgroundLeaveTriggeredRef.current = true;
          try { socket.emit('app-background', { gameId }); } catch (e) {}
        }
      }

      if (nextState === 'active') {
        if (backgroundLeaveTriggeredRef.current) {
          backgroundLeaveTriggeredRef.current = false;
        }
        if (socket && connected && isAuthenticated) {
          try { socket.emit('app-foreground', { gameId }); } catch (e) {}
        }
      }
    });

    return () => {
      try { sub.remove(); } catch (e) {}
    };
  }, [socket, connected, isAuthenticated, gameId]);

  // Attach socket listeners when socket becomes ready; clean up on change/unmount
  useEffect(() => {
    if (!socket) return;

    const onCategorySelectionStarted = (data) => {
      setPhase('category-selection');
      if (Array.isArray(data.categories)) setSelectedCategories(data.categories);
      if (typeof data.confirmed === 'number') setConfirmedCount(data.confirmed);
      if (typeof data.total === 'number') setTotalPlayers(data.total);
      if (data.deadline) startSelectionTimer(new Date(data.deadline));
    };
    const onCategorySelected = (data) => {
      if (Array.isArray(data.categories)) setSelectedCategories(data.categories);
    };
    const onConfirmUpdate = (data) => {
      if (typeof data.confirmed === 'number') setConfirmedCount(data.confirmed);
      if (typeof data.total === 'number') setTotalPlayers(data.total);
    };
    const onCategoriesConfirmed = (data) => {
      if (selectTimerRef.current) clearInterval(selectTimerRef.current);
      setSelectionDeadline(null);
      if (Array.isArray(data.categories)) setSelectedCategories(data.categories);
      setPhase('letter-selection');
      setIsPlayerTurn(data.currentPlayer === userIdRef.current);
      setConfirmedCount(0);
      setTotalPlayers(0);
      setHasConfirmed(false);
      setLetterInput('');
    };
    const onLetterSelectionStarted = async (data) => {
      setPhase('letter-selection');
      if (timerRef.current) clearInterval(timerRef.current);
      if (data.gameId && String(data.gameId) !== String(gameId)) {
        setIsFinished(false);
        setFinalConfirmed(false);
        try { if (joinGame) joinGame(data.gameId); } catch (e) {}
        navigation.replace('Gameplay', { gameId: data.gameId });
        return;
      }
      if (data.deadline) startLetterTimer(new Date(data.deadline));
      if (data.selectorId) {
        const selId = String(data.selectorId);
        setLetterSelectorId(selId);
        setIsPlayerTurn(selId === String(userIdRef.current || ''));
      }
      if (data.selectorName) setLetterSelectorName(data.selectorName);
      if (typeof data.currentRound === 'number') setCurrentRound(data.currentRound);
      setAnswers({});
      setIsFrozen(false);
      setHasStoppedFirst(false);
      setShowStopOverlay(false);
      setReadyCount(0);
      setReadyTotal(0);
      setNextCountdown(null);
      stopShownRef.current = false;
      // Reset hidden inputs for new round
      setHiddenInputs({});
      setHideAllInputs(false);
      if (!data.selectorId && data.selectorName && user?.username && data.selectorName === user.username) {
        setIsPlayerTurn(true);
        setLetterSelectorId(String(userIdRef.current || ''));
      }
      try {
        const result = await getGameState(gameId);
        if (result?.success) {
          const g = result.game;
          const ls = g?.letterSelector;
          const lsId = ls && (ls._id || ls);
          if (lsId) {
            const sid = String(lsId);
            setLetterSelectorId(sid);
            setIsPlayerTurn(sid === String(userIdRef.current || ''));
            if (!data.selectorName && Array.isArray(g.players)) {
              const p = g.players.find(pp => String((pp.user && (pp.user._id || pp.user)) || '') === sid);
              if (p && p.user && p.user.username) setLetterSelectorName(p.user.username);
            }
          }
          if (typeof g?.currentRound === 'number') setCurrentRound(g.currentRound);
        }
      } catch (e) {}
    };
    const onLetterAccepted = (data) => {
      if (data.revealDeadline) startRevealTimer(new Date(data.revealDeadline));
      setShowReveal(true);
    };
    const onLetterSelected = (data) => {
      if (data.letter) setCurrentLetter(data.letter);
      setPhase('playing');
      setIsFrozen(false);
      startTimer();
      setShowReveal(false);
      if (revealTimerRef.current) clearInterval(revealTimerRef.current);
      // entering playing phase: allow Stop! popup once
      stopShownRef.current = false;
      // Reset gameplay refresh states
      setIsRefreshingGameplay(false);
      setGameplayRefreshError(null);
    };
    const onPlayerStopped = async (data) => {
      if (phaseRef.current === 'playing' && data.playerId !== userIdRef.current && !stopShownRef.current) {
        if (timerRef.current) clearInterval(timerRef.current);
        stopShownRef.current = true;
        setIsFrozen(true);
        setTimeLeft(0);
        setShowStopOverlay(true);
        try {
          await submitAnswers(gameId, answersRef.current, false);
        } catch (e) {}
        setTimeout(() => setShowStopOverlay(false), 1500);
      }
    };
    const onRoundEnded = async (data) => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (phaseRef.current === 'playing' && data && data.reason === 'stopped' && !stopShownRef.current) {
        stopShownRef.current = true;
        setIsFrozen(true);
        setTimeLeft(0);
        setShowStopOverlay(true);
        setTimeout(() => setShowStopOverlay(false), 1500);
      }
      if (phaseRef.current === 'playing' && data && data.reason === 'timeout') {
        try {
          await submitAnswers(gameId, answersRef.current, false);
        } catch (e) {}
      }
      setPhase('validation');
      setIsRefreshing(false);
      setRefreshError(null);
      setRetryAttempt(0);
      // Trigger validation; server will broadcast results. Duplicate calls are safely rejected server-side.
      await handleValidation();
    };
    const onRoundResults = (data) => {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeLeft(0);
      setRoundResults(data.results);
      setPlayerScores(data.standings);
      setPhase('round-end');
      // Initialize total from standings length if available
      if (Array.isArray(data.standings)) setReadyTotal(data.standings.length);
      // Set viewing player to current user by default
      setViewingPlayerId(userIdRef.current);
    };
    const onReadyUpdate = (data) => {
      if (typeof data.ready === 'number') setReadyCount(data.ready);
      if (typeof data.total === 'number') setReadyTotal(data.total);
    };
    const onNextRoundCountdown = (data) => {
      if (typeof data.seconds === 'number') setNextCountdown(data.seconds);
    };
    const onGameFinished = async (data) => {
      console.log('[GameplayScreen] onGameFinished called with data:', data);
      setShowConfetti(true);
      setIsFinished(true);
      // derive totals if provided
      if (Array.isArray(data?.standings)) {
        setPlayerScores(data.standings);
        setRematchTotal(data.standings.length);
      }
      // Optimistically update local stats to avoid immediate API calls
      try {
        const myId = String((user && (user.id || user._id)) || '');
        const myStanding = Array.isArray(data?.standings)
          ? data.standings.find(s => String((s.user && (s.user._id || s.user)) || '') === myId)
          : null;
        const hasWinner = !!data?.winner;
        const winnerId = hasWinner ? String((data.winner && (data.winner._id || data.winner)) || '') : null;
        const iWon = hasWinner && winnerId === myId;
        const currentWinPoints = Number(user?.winPoints) || 0;
        const currentMatches = Number(user?.matchesPlayed) || 0;
        const addPoints = iWon && myStanding && Number.isFinite(Number(myStanding.score)) ? Number(myStanding.score) : 0;
        const optimistic = {
          winPoints: currentWinPoints + addPoints,
          matchesPlayed: currentMatches + 1,
        };
        await updateUser(optimistic);
        if (typeof markStatsDirty === 'function') markStatsDirty();
      } catch (e) {
        // swallow optimistic update errors
      }
      // Refresh user stats after game finishes
      try {
        console.log('[GameplayScreen] Calling refreshUser...');
        await refreshUser({ force: true });
        console.log('[GameplayScreen] User stats refreshed after game finish');
      } catch (error) {
        console.error('[GameplayScreen] Failed to refresh user stats:', error);
      }
    };
    const onRematchUpdate = (data) => {
      if (typeof data.ready === 'number') setRematchReady(data.ready);
      if (typeof data.total === 'number') setRematchTotal(data.total);
    };
    const onRematchAborted = (data) => {
      setRematchAborted(true);
    };
    const onGameStarting = (data) => {
      setIsFinished(false);
      setFinalConfirmed(false);
      setShowConfetti(false);
      setRematchReady(0);
      setRematchTotal(0);
      setRematchAborted(false);
      setRematchCountdown(null);
      // Critical: Reset category selection states to prevent disabled categories bug
      setHasConfirmed(false);
      setHasVotedRematch(false);
      announcedReadyRef.current = false;
      stopShownRef.current = false;
      setSelectedCategories([]);
      setAnswers({});
      setConfirmedCount(0);
      setTotalPlayers(0);
      // Reset round and game state
      setCurrentRound(1);
      setRoundResults(null);
      setHasStoppedFirst(false);
      setIsFrozen(false);
      setShowStopOverlay(false);
      setShowReveal(false);
      setReadyCount(0);
      setReadyTotal(0);
      setNextCountdown(null);
      setLetterInput('');
      // Reset hidden inputs state
      setHiddenInputs({});
      setHideAllInputs(false);
      // Reset disconnected players for new game
      setDisconnectedPlayers(new Set());
      // Clear any lingering timers
      if (timerRef.current) clearInterval(timerRef.current);
      if (selectTimerRef.current) clearInterval(selectTimerRef.current);
      if (letterTimerRef.current) clearInterval(letterTimerRef.current);
      if (revealTimerRef.current) clearInterval(revealTimerRef.current);
      try { if (joinGame && data?.gameId) joinGame(data.gameId); } catch (e) {}
      navigation.replace('Gameplay', { gameId: data.gameId });
    };
    const onRematchCountdown = (data) => {
      if (typeof data.seconds === 'number') setRematchCountdown(data.seconds);
    };

    // Player disconnect/reconnect handlers
    const onPlayerDisconnected = (data) => {
      console.log('[GameplayScreen] Player disconnected:', data);
      if (data.odisconnectedPlayerId) {
        setDisconnectedPlayers(prev => new Set([...prev, data.odisconnectedPlayerId]));
      }
      // Update player scores to show 0 for disconnected players
      if (Array.isArray(data.players)) {
        setPlayerScores(data.players.map(p => ({
          user: { _id: p.odisconnectedPlayerId, displayName: p.odisconnectedPlayerName },
          score: p.disconnected ? 0 : p.score
        })));
      }
    };

    const onPlayerReconnected = (data) => {
      console.log('[GameplayScreen] Player reconnected:', data);
      if (data.odisconnectedPlayerId) {
        setDisconnectedPlayers(prev => {
          const next = new Set(prev);
          next.delete(data.odisconnectedPlayerId);
          return next;
        });
      }
      // Update player scores with restored score
      if (Array.isArray(data.players)) {
        setPlayerScores(data.players.map(p => ({
          user: { _id: p.odisconnectedPlayerId, displayName: p.odisconnectedPlayerName },
          score: p.score
        })));
      }
    };

    const onGameSync = (data) => {
      console.log('[GameplayScreen] Game sync received:', data);
      
      // Update disconnected players list
      if (Array.isArray(data.disconnectedPlayerIds)) {
        setDisconnectedPlayers(new Set(data.disconnectedPlayerIds));
      }

      // Sync phase
      if (data.phase) {
        setPhase(data.phase);
      }

      // Sync round
      if (typeof data.currentRound === 'number') {
        setCurrentRound(data.currentRound);
      }

      // Sync letter
      if (data.currentLetter) {
        setCurrentLetter(data.currentLetter);
      }

      // Sync categories
      if (Array.isArray(data.categories)) {
        setSelectedCategories(data.categories);
      }

      // Sync remaining time for playing phase
      if (data.phase === 'playing' && typeof data.remainingTime === 'number') {
        setTimeLeft(data.remainingTime);
        // Start timer from remaining time
        if (timerRef.current) clearInterval(timerRef.current);
        let remaining = data.remainingTime;
        timerRef.current = setInterval(() => {
          remaining -= 1;
          setTimeLeft(remaining);
          if (remaining <= 0) {
            clearInterval(timerRef.current);
          }
        }, 1000);
      }

      // Sync standings
      if (Array.isArray(data.standings)) {
        setPlayerScores(data.standings.map(s => ({
          user: s.user,
          score: s.disconnected ? 0 : s.score
        })));
      }

      // Sync rematch state
      if (typeof data.rematchReady === 'number') {
        setRematchReady(data.rematchReady);
      }
      if (typeof data.rematchTotal === 'number') {
        setRematchTotal(data.rematchTotal);
      }

      // Handle finished state
      if (data.phase === 'finished') {
        setIsFinished(true);
      }
    };

    socket.on('player-disconnected', onPlayerDisconnected);
    socket.on('player-reconnected', onPlayerReconnected);
    socket.on('game-sync', onGameSync);
    socket.on('category-selection-started', onCategorySelectionStarted);
    socket.on('category-selected', onCategorySelected);
    socket.on('confirm-update', onConfirmUpdate);
    socket.on('categories-confirmed', onCategoriesConfirmed);
    socket.on('letter-selection-started', onLetterSelectionStarted);
    socket.on('letter-accepted', onLetterAccepted);
    socket.on('letter-selected', onLetterSelected);
    socket.on('player-stopped', onPlayerStopped);
    socket.on('round-ended', onRoundEnded);
    socket.on('round-results', onRoundResults);
    socket.on('ready-update', onReadyUpdate);
    socket.on('next-round-countdown', onNextRoundCountdown);
    socket.on('game-finished', onGameFinished);
    socket.on('rematch-update', onRematchUpdate);
    socket.on('rematch-aborted', onRematchAborted);
    socket.on('game-starting', onGameStarting);
    socket.on('rematch-countdown', onRematchCountdown);

    return () => {
      socket.off('player-disconnected', onPlayerDisconnected);
      socket.off('player-reconnected', onPlayerReconnected);
      socket.off('game-sync', onGameSync);
      socket.off('category-selection-started', onCategorySelectionStarted);
      socket.off('category-selected', onCategorySelected);
      socket.off('confirm-update', onConfirmUpdate);
      socket.off('categories-confirmed', onCategoriesConfirmed);
      socket.off('letter-selection-started', onLetterSelectionStarted);
      socket.off('letter-accepted', onLetterAccepted);
      socket.off('letter-selected', onLetterSelected);
      socket.off('player-stopped', onPlayerStopped);
      socket.off('round-ended', onRoundEnded);
      socket.off('round-results', onRoundResults);
      socket.off('ready-update', onReadyUpdate);
      socket.off('next-round-countdown', onNextRoundCountdown);
      socket.off('game-finished', onGameFinished);
      socket.off('rematch-update', onRematchUpdate);
      socket.off('rematch-aborted', onRematchAborted);
      socket.off('game-starting', onGameStarting);
      socket.off('rematch-countdown', onRematchCountdown);
    };
  }, [socket, userId, gameId]);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);

  useEffect(() => {
    if (phase !== 'round-end') return;
    if (!Array.isArray(roundResults) || roundResults.length === 0) return;

    if (roundGainTimeoutRef.current) {
      clearTimeout(roundGainTimeoutRef.current);
      roundGainTimeoutRef.current = null;
    }

    const gains = {};
    roundResults.forEach((res) => {
      const playerUser = res.user;
      const pid = (playerUser && (playerUser._id || playerUser)) || null;
      const pidStr = pid != null ? String(pid) : null;
      if (!pidStr) return;

      const answersObj = res.answers;
      const categoryAnswers = answersObj && Array.isArray(answersObj.categoryAnswers)
        ? answersObj.categoryAnswers
        : [];
      const basePoints = categoryAnswers.reduce((sum, ca) => sum + (ca.points || 0), 0);
      const stopBonus = answersObj && answersObj.stoppedFirst ? 5 : 0;
      const total = basePoints + stopBonus;

      if (total > 0) {
        gains[pidStr] = total;
      }
    });

    if (Object.keys(gains).length === 0) {
      setRoundGainMap({});
      return;
    }

    setRoundGainMap(gains);

    Object.keys(gains).forEach((pid) => {
      let anims = roundGainAnimMapRef.current[pid];
      if (!anims) {
        anims = {
          scale: new Animated.Value(0.01),
          opacity: new Animated.Value(1),
        };
        roundGainAnimMapRef.current[pid] = anims;
      } else {
        anims.scale.setValue(0.01);
        anims.opacity.setValue(1);
      }

      Animated.parallel([
        Animated.timing(anims.opacity, {
          toValue: 0,
          duration: 3000,
          useNativeDriver: true,
        }),
        Animated.timing(anims.scale, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: true,
        }),
      ]).start();
    });

    roundGainTimeoutRef.current = setTimeout(() => {
      setRoundGainMap({});
      roundGainTimeoutRef.current = null;
    }, 3200);
  }, [phase, roundResults]);

  // When entering category-selection phase, signal readiness exactly once
  useEffect(() => {
    if (phase === 'category-selection' && categoryPhaseReady && !announcedReadyRef.current) {
      categoryPhaseReady(gameId);
      announcedReadyRef.current = true;
    }
  }, [phase, categoryPhaseReady, gameId]);

  // Smart detection for stuck category selection
  useEffect(() => {
    if (phase === 'category-selection') {
      // Start monitoring for stuck state
      if (categoryStuckTimerRef.current) clearInterval(categoryStuckTimerRef.current);
      categoryStuckCountRef.current = 0;
      autoManualReloadTriggeredRef.current = false;
      setCategoryStuckTimer(0);
      setShowManualReload(false);
      
      categoryStuckTimerRef.current = setInterval(() => {
        categoryStuckCountRef.current += 1;
        setCategoryStuckTimer(categoryStuckCountRef.current);
        
        // If no deadline after 8 seconds, user is likely stuck
        if (categoryStuckCountRef.current >= 8 && !selectionDeadline) {
          console.log('[STUCK DETECTION] No deadline after 8s, showing manual reload');
          setShowManualReload(true);
        }
        
        // Auto-reload after 15 seconds if still no deadline
        if (categoryStuckCountRef.current >= 15 && !selectionDeadline) {
          console.log('[STUCK DETECTION] Auto-reloading after 15s without deadline');
          clearInterval(categoryStuckTimerRef.current);
          handleCategoryReload(true);
        }
      }, 1000);
    } else {
      // Clear timer when leaving category selection
      if (categoryStuckTimerRef.current) {
        clearInterval(categoryStuckTimerRef.current);
        categoryStuckTimerRef.current = null;
      }
      categoryStuckCountRef.current = 0;
      autoManualReloadTriggeredRef.current = false;
      setCategoryStuckTimer(0);
      setShowManualReload(false);
    }
    
    return () => {
      if (categoryStuckTimerRef.current) {
        clearInterval(categoryStuckTimerRef.current);
      }
    };
  }, [phase, selectionDeadline]);

  useEffect(() => {
    if (
      phase === 'category-selection' &&
      showManualReload &&
      !selectionDeadline &&
      !isReloadingCategories &&
      !autoManualReloadTriggeredRef.current
    ) {
      autoManualReloadTriggeredRef.current = true;
      handleCategoryReload(true);
    }
  }, [phase, showManualReload, selectionDeadline, isReloadingCategories]);

  const playersForHeader = React.useMemo(() => {
    const fromGame = Array.isArray(gameState?.players) ? gameState.players : [];
    if (fromGame.length > 0) {
      return fromGame.map((p, idx) => {
        const u = p.user || {};
        const id = (u && (u._id || u)) || idx.toString();
        const name = (u && (u.displayName || u.username)) || p.displayName || p.username || t('gameplay.player');
        return { id: String(id), name: String(name) };
      });
    }
    if (Array.isArray(playerScores) && playerScores.length > 0) {
      return playerScores.map((s, idx) => {
        const u = s.user || {};
        const id = (u && (u._id || u)) || idx.toString();
        const name = (u && (u.displayName || u.username)) || s.displayName || s.username || t('gameplay.player');
        return { id: String(id), name: String(name) };
      });
    }
    const meName = user?.displayName || user?.username || t('leaderboard.you');
    const meId = String(user?.id || user?._id || 'me');
    return [{ id: meId, name: meName }];
  }, [gameState, playerScores, user, t]);

  const pointsById = React.useMemo(() => {
    const map = {};
    const src = Array.isArray(playerScores) && playerScores.length > 0
      ? playerScores
      : (Array.isArray(gameState?.standings) ? gameState.standings : []);
    src.forEach((s, idx) => {
      const u = s.user || {};
      const id = (u && (u._id || u)) || idx.toString();
      const pid = String(id);
      const score = Number(s.score) || 0;
      map[pid] = score;
    });
    return map;
  }, [playerScores, gameState]);

  // Determine the player with the highest score (only if not tied)
  const leaderPlayerId = React.useMemo(() => {
    const scores = Object.entries(pointsById);
    if (scores.length === 0) return null;
    
    // Find max score
    const maxScore = Math.max(...scores.map(([_, score]) => score));
    
    // If max score is 0, no leader yet
    if (maxScore === 0) return null;
    
    // Count how many players have the max score
    const playersWithMaxScore = scores.filter(([_, score]) => score === maxScore);
    
    // Only return leader if there's exactly one player with max score (no tie)
    if (playersWithMaxScore.length === 1) {
      return playersWithMaxScore[0][0];
    }
    
    return null; // Tie or no clear leader
  }, [pointsById]);

  const handleLeaveGame = () => {
    if (isLeavingRef.current) return;
    const totalPlayersCount = playersForHeader.length;
    const disconnectedCount = disconnectedPlayers instanceof Set ? disconnectedPlayers.size : 0;
    const isLastConnectedPlayer = totalPlayersCount > 0 && disconnectedCount >= (totalPlayersCount - 1);
    Alert.alert(
      t('gameplay.leaveGame'),
      isLastConnectedPlayer ? t('gameplay.leaveGameLastPlayerMessage') : t('gameplay.leaveGameMessage'),
      [
        { text: t('common.no'), style: 'cancel' },
        {
          text: t('common.yes'),
          style: 'destructive',
          onPress: () => {
            isLeavingRef.current = true;
            try { if (socket && connected && isAuthenticated && typeof socketLeaveRoom === 'function') socketLeaveRoom(); } catch (e) {}
            setTimeout(() => {
              navigation.navigate('Menu');
            }, 400);
          }
        }
      ]
    );
  };

  const handleCategoryReload = async (isAuto = false) => {
    console.log(`[CATEGORY RELOAD] ${isAuto ? 'Auto' : 'Manual'} reload triggered`);
    setIsReloadingCategories(true);
    
    try {
      // Re-announce ready to trigger deadline
      if (categoryPhaseReady) {
        announcedReadyRef.current = false;
        categoryPhaseReady(gameId);
        announcedReadyRef.current = true;
      }
      
      // Reload game state
      await loadGameState();
      
      // Reset stuck detection
      if (categoryStuckTimerRef.current) {
        clearInterval(categoryStuckTimerRef.current);
      }
      categoryStuckCountRef.current = 0;
      setCategoryStuckTimer(0);
      setShowManualReload(false);
      
      console.log('[CATEGORY RELOAD] Reload successful');
    } catch (error) {
      console.error('[CATEGORY RELOAD] Error:', error);
    } finally {
      setIsReloadingCategories(false);
    }
  };

  const loadGameState = async () => {
    const result = await getGameState(gameId);
    if (result.success) {
      const g = result.game;
      setCurrentRound(g.currentRound);
      setTotalRounds(g.rounds);
      setPlayerScores(g.standings);
      if (Array.isArray(g.categories)) setSelectedCategories(g.categories);
      if (g.currentLetter) setCurrentLetter(g.currentLetter);
      const mapStatus = (s) => {
        switch (s) {
          case 'selecting_categories': return 'category-selection';
          case 'selecting_letter': return 'letter-selection';
          case 'playing': return 'playing';
          case 'validating': return 'validation';
          case 'round_ended': return 'round-end';
          default: return 'category-selection';
        }
      };
      setPhase(mapStatus(g.status));
    }
  };

  const startSelectionTimer = (deadline) => {
    if (selectTimerRef.current) clearInterval(selectTimerRef.current);
    const tick = () => {
      const ms = deadline instanceof Date ? (deadline.getTime() - Date.now()) : 0;
      const secs = Math.max(0, Math.ceil(ms / 1000));
      setSelectTimeLeft(secs);
      if (secs === 0) {
        clearInterval(selectTimerRef.current);
      }
    };
    tick();
    selectTimerRef.current = setInterval(tick, 500);
    setSelectionDeadline(deadline);
  };

  const startLetterTimer = (deadline) => {
    if (letterTimerRef.current) clearInterval(letterTimerRef.current);
    const tick = () => {
      const ms = deadline instanceof Date ? (deadline.getTime() - Date.now()) : 0;
      const secs = Math.max(0, Math.ceil(ms / 1000));
      setLetterTimeLeft(secs);
      if (secs === 0) {
        clearInterval(letterTimerRef.current);
        setLetterDeadline(null);
      }
    };
    tick();
    letterTimerRef.current = setInterval(tick, 500);
    setLetterDeadline(deadline);
  };

  const startRevealTimer = (deadline) => {
    if (revealTimerRef.current) clearInterval(revealTimerRef.current);
    const tick = () => {
      const ms = deadline instanceof Date ? (deadline.getTime() - Date.now()) : 0;
      const secs = Math.max(0, Math.ceil(ms / 1000));
      setRevealTimeLeft(secs);
      if (secs === 0) {
        clearInterval(revealTimerRef.current);
      }
    };
    tick();
    revealTimerRef.current = setInterval(tick, 250);
  };

  // Fallback: if reveal hits 0 but 'letter-selected' wasn't received, fetch state and start
  useEffect(() => {
    const fallback = async () => {
      if (showReveal && revealTimeLeft === 0 && phase !== 'playing') {
        const result = await getGameState(gameId);
        if (result?.success && result.game?.currentLetter) {
          setCurrentLetter(result.game.currentLetter);
          setPhase('playing');
          startTimer();
          setShowReveal(false);
        }
      }
    };
    fallback();
  }, [showReveal, revealTimeLeft, phase, gameId]);

  const setupSocketListeners = () => {
    if (socket) {
      socket.on('category-selection-started', (data) => {
        setPhase('category-selection');
        if (Array.isArray(data.categories)) setSelectedCategories(data.categories);
        if (typeof data.confirmed === 'number') setConfirmedCount(data.confirmed);
        if (typeof data.total === 'number') setTotalPlayers(data.total);
        if (data.deadline) startSelectionTimer(new Date(data.deadline));
      });

      socket.on('category-selected', (data) => {
        if (Array.isArray(data.categories)) setSelectedCategories(data.categories);
      });

      socket.on('confirm-update', (data) => {
        if (typeof data.confirmed === 'number') setConfirmedCount(data.confirmed);
        if (typeof data.total === 'number') setTotalPlayers(data.total);
      });

      socket.on('categories-confirmed', (data) => {
        if (selectTimerRef.current) clearInterval(selectTimerRef.current);
        setSelectionDeadline(null);
        if (Array.isArray(data.categories)) setSelectedCategories(data.categories);
        setPhase('letter-selection');
        setIsPlayerTurn(data.currentPlayer === userId);
        // Reset counters for next phase
        setConfirmedCount(0);
        setTotalPlayers(0);
        setHasConfirmed(false);
        setLetterInput('');
      });

      socket.on('letter-selection-started', (data) => {
        setPhase('letter-selection');
        if (data.selectorId) {
          setLetterSelectorId(data.selectorId);
          setIsPlayerTurn(data.selectorId === userId);
        }
        if (data.selectorName) setLetterSelectorName(data.selectorName);
        if (data.deadline) startLetterTimer(new Date(data.deadline));
        if (typeof data.currentRound === 'number') setCurrentRound(data.currentRound);
        setLetterInput('');
      });

      socket.on('letter-accepted', (data) => {
        // Show 3-second reveal overlay for all players
        if (data.revealDeadline) startRevealTimer(new Date(data.revealDeadline));
        setShowReveal(true);
      });

      socket.on('letter-selected', (data) => {
        if (data.letter) setCurrentLetter(data.letter);
        setPhase('playing');
        startTimer();
        setShowReveal(false);
        if (revealTimerRef.current) clearInterval(revealTimerRef.current);
      });

      socket.on('player-stopped', async (data) => {
        if (data.playerId !== userId) {
          setIsFrozen(true);
          setTimeLeft(0);
          setShowStopOverlay(true);
          try {
            await submitAnswers(gameId, answersRef.current, false);
          } catch (e) {}
          setTimeout(() => setShowStopOverlay(false), 1500);
        }
      });

      socket.on('round-ended', async (data) => {
        if (timerRef.current) clearInterval(timerRef.current);
        if (data && data.reason === 'stopped' && !stopShownRef.current) {
          stopShownRef.current = true;
          setIsFrozen(true);
          setTimeLeft(0);
          setShowStopOverlay(true);
          setTimeout(() => setShowStopOverlay(false), 1500);
        }
        setPhase('validation');
        await handleValidation();
      });

      socket.on('round-results', (data) => {
        if (timerRef.current) clearInterval(timerRef.current);
        setTimeLeft(0);
        setRoundResults(data.results);
        setPlayerScores(data.standings);
        setPhase('round-end');
      });

      socket.on('game-finished', (data) => {
        setShowConfetti(true);
        setTimeout(() => {
          Alert.alert(
            t('gameplay.gameOver'),
            `${t('gameplay.winner')}: ${data.winner.username}\n${t('gameplay.score')}: ${data.winner.score}`,
            [
              { text: t('leaderboard.title'), onPress: () => navigation.replace('Leaderboard') },
              { text: t('gameplay.backToMenu'), onPress: () => navigation.replace('Menu') }
            ]
          );
        }, 3000);
      });
    }
  };

  const startTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setTimeLeft(60);
    timerRef.current = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          handleTimeUp();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleCategorySelect = (category) => {
    if (selectTimeLeft <= 0) return;
    if (selectedCategories.includes(category)) return;
    if (selectedCategories.length >= 8) return;
    if (hasConfirmed) return;
    selectCategory(gameId, category);
  };

  const handleConfirmCategories = () => {
    if (!selectionDeadline) return;
    if (selectedCategories.length < 6) return;
    if (hasConfirmed) return;
    setHasConfirmed(true);
    confirmCategories(gameId);
  };

  const handleLetterSelect = () => {
    if (!isPlayerTurn) return;
    selectLetter(gameId);
  };

  const handleAnswerChange = (category, answer) => {
    setAnswers(prev => ({
      ...prev,
      [category]: answer
    }));
  };

  const isAnswerValid = (value) => {
    const v = (value || '').trim();
    if (!currentLetter) return false;
    if (v.length < 2) return false;
    return v.charAt(0).toUpperCase() === (currentLetter || '').toUpperCase();
  };
  const canFinish = Array.isArray(selectedCategories) && selectedCategories.length > 0 && selectedCategories.every(c => isAnswerValid(answers[c] || ''));

  const getAnswerError = (value) => {
    const v = (value || '').trim();
    if (v.length === 0) return '';
    if (currentLetter && v.charAt(0).toUpperCase() !== (currentLetter || '').toUpperCase()) {
      return `${t('common.error')}: ${currentLetter}`;
    }
    return '';
  };

  const handleStop = async () => {
    const canFinishNow = Array.isArray(selectedCategories) && selectedCategories.length > 0 && selectedCategories.every(c => isAnswerValid(answers[c] || ''));
    if (!canFinishNow) return;
    if (timerRef.current) clearInterval(timerRef.current);
    if (stopShownRef.current) return; // already processed
    stopShownRef.current = true;
    setHasStoppedFirst(true);
    setIsFrozen(true);
    setTimeLeft(0);
    setShowStopOverlay(true);
    stopRound(gameId);
    await submitAnswers(gameId, answers, true);
    setTimeout(() => setShowStopOverlay(false), 1500);
    await handleValidation();
  };

  const handleTimeUp = async () => {
    if (stopShownRef.current) return;
    stopShownRef.current = true;
    setIsFrozen(true);
    setTimeLeft(0);
    setShowStopOverlay(true);
    try {
      await submitAnswers(gameId, answers, false);
    } catch (e) {}
    setTimeout(() => setShowStopOverlay(false), 1500);
    // Wait for server 'round-ended' then validation will run
  };

  const handleValidation = async () => {
    const result = await validateAnswers(gameId);
    if (result.success) {
      if (timerRef.current) clearInterval(timerRef.current);
      setTimeLeft(0);
      setRoundResults(result.roundResults);
      setPlayerScores(result.standings);
      setPhase('round-end');
    }
  };

  const handleRefreshGameplay = async () => {
    setIsRefreshingGameplay(true);
    setGameplayRefreshError(null);
    
    try {
      // Fetch current game state to resync
      const gameState = await getGameState(gameId);
      if (gameState?.success) {
        const game = gameState.game;
        
        // Update categories if available
        if (game?.categories && Array.isArray(game.categories)) {
          setSelectedCategories(game.categories);
        }
        
        // Update current letter if available
        if (game?.currentLetter) {
          setCurrentLetter(game.currentLetter);
        }
        
        // Update current round
        if (typeof game?.currentRound === 'number') {
          setCurrentRound(game.currentRound);
        }
        
        // Sync to correct phase based on game status
        if (game?.status === 'playing') {
          setPhase('playing');
          setIsFrozen(false);
          
          // Only start timer if it hasn't started yet (timeLeft is still at initial value)
          if (timeLeft === 60 || timeLeft === 0) {
            startTimer();
          }
          
          setIsRefreshingGameplay(false);
          return;
        }
        
        if (game?.status === 'selecting_letter') {
          setPhase('letter-selection');
          if (game?.letterSelector) {
            const lsId = game.letterSelector._id || game.letterSelector;
            setLetterSelectorId(String(lsId));
            setIsPlayerTurn(String(lsId) === String(userId));
          }
          setIsRefreshingGameplay(false);
          return;
        }
        
        if (game?.status === 'selecting_categories') {
          setPhase('category-selection');
          setIsRefreshingGameplay(false);
          return;
        }
        
        if (game?.status === 'validating' || game?.status === 'round_ended') {
          setPhase(game.status === 'round_ended' ? 'round-end' : 'validation');
          setIsRefreshingGameplay(false);
          return;
        }
        
        // If we got here, state was updated but phase unclear
        setIsRefreshingGameplay(false);
        return;
      }
      
      // If fetch failed, show error
      setGameplayRefreshError(t('gameplay.couldNotSyncState'));
      setIsRefreshingGameplay(false);
    } catch (error) {
      console.error('Error refreshing gameplay:', error);
      setGameplayRefreshError(t('gameplay.refreshErrorGeneric'));
      setIsRefreshingGameplay(false);
    }
  };

  const handleRefreshValidation = async (isAutoRetry = false) => {
    setIsRefreshing(true);
    setRefreshError(null);
    
    if (!isAutoRetry) {
      // Manual refresh: stop auto-retry timer and reset it
      if (autoRetryTimerRef.current) {
        clearInterval(autoRetryTimerRef.current);
        autoRetryTimerRef.current = null;
      }
      setRetryAttempt(0); // Reset retry count on manual refresh
    }
    
    try {
      // First attempt: Try to validate answers
      const result = await validateAnswers(gameId);
      if (result?.success && result?.roundResults) {
        if (timerRef.current) clearInterval(timerRef.current);
        setTimeLeft(0);
        setRoundResults(result.roundResults);
        setPlayerScores(result.standings);
        setPhase('round-end');
        setIsRefreshing(false);
        return;
      }

      // Second attempt: Fetch game state to check current status
      const gameState = await getGameState(gameId);
      if (gameState?.success) {
        const game = gameState.game;
        
        // If game is in round_ended status, try to get results again
        if (game?.status === 'round_ended') {
          const retryResult = await validateAnswers(gameId);
          if (retryResult?.success && retryResult?.roundResults) {
            if (timerRef.current) clearInterval(timerRef.current);
            setTimeLeft(0);
            setRoundResults(retryResult.roundResults);
            setPlayerScores(retryResult.standings);
            setPhase('round-end');
            setIsRefreshing(false);
            return;
          }
          
          // If still no results but game has standings, use those
          if (game?.standings && Array.isArray(game.standings)) {
            if (timerRef.current) clearInterval(timerRef.current);
            setTimeLeft(0);
            setPlayerScores(game.standings);
            // Try to construct basic round results from game data
            if (game?.players && Array.isArray(game.players)) {
              const basicResults = game.players.map(p => ({
                user: p.user,
                answers: p.answers?.[game.currentRound - 1] || {}
              }));
              setRoundResults(basicResults);
            }
            setPhase('round-end');
            setIsRefreshing(false);
            return;
          }
        }
        
        // If game moved to a different phase, sync to that phase
        if (game?.status === 'playing') {
          setPhase('playing');
          if (game?.currentLetter) setCurrentLetter(game.currentLetter);
          setIsFrozen(false);
          startTimer();
          setIsRefreshing(false);
          return;
        }
        
        if (game?.status === 'selecting_letter') {
          setPhase('letter-selection');
          setIsRefreshing(false);
          return;
        }
      }
      
      // If all else fails, set error message and increment retry
      setRefreshError(t('gameplay.couldNotFetchResults'));
      setRetryAttempt(prev => prev + 1);
      setIsRefreshing(false);
    } catch (error) {
      console.error('Error refreshing validation:', error);
      setRefreshError(t('gameplay.refreshErrorGeneric'));
      setRetryAttempt(prev => prev + 1);
      setIsRefreshing(false);
    }
  };

  // Auto-retry logic for validation phase
  useEffect(() => {
    if (phase === 'validation' && !isRefreshing) {
      // Start auto-retry after initial load
      const startAutoRetry = () => {
        if (autoRetryTimerRef.current) {
          clearInterval(autoRetryTimerRef.current);
        }
        
        // Retry every 2 seconds
        autoRetryTimerRef.current = setInterval(() => {
          if (phaseRef.current === 'validation' && !isRefreshing) {
            handleRefreshValidation(true);
          }
        }, 2000);
      };
      
      // Start auto-retry after a short delay (1.5 seconds)
      const initialDelay = setTimeout(() => {
        startAutoRetry();
      }, 1500);
      
      return () => {
        clearTimeout(initialDelay);
        if (autoRetryTimerRef.current) {
          clearInterval(autoRetryTimerRef.current);
        }
      };
    } else {
      // Clear auto-retry when leaving validation phase
      if (autoRetryTimerRef.current) {
        clearInterval(autoRetryTimerRef.current);
      }
    }
  }, [phase, isRefreshing]);

  useEffect(() => {
    let validationPollTimer = null;
    let cleanupTimer = null;

    const trySync = async () => {
      // Letter selection: if countdown reached 0 but no transition happened, resync from server
      if (phase === 'letter-selection' && letterTimeLeft === 0) {
        const result = await getGameState(gameId);
        if (result?.success) {
          const g = result.game;
          if (g?.currentLetter) setCurrentLetter(g.currentLetter);
          if (g?.status === 'playing') {
            setShowReveal(false);
            setPhase('playing');
            setIsFrozen(false);
            startTimer();
          } else if (g?.status === 'validating' || g?.status === 'round_ended') {
            if (timerRef.current) clearInterval(timerRef.current);
            setTimeLeft(0);
            setShowReveal(false);
            setPhase(g.status === 'round_ended' ? 'round-end' : 'validation');
          }
        }
      }

      // Validation watchdog: periodically retry validation and hard-resync state
      if (phase === 'validation') {
        const attempt = async () => {
          // First, try to fetch results (idempotent on server)
          const res = await validateAnswers(gameId);
          if (res?.success) {
            if (timerRef.current) clearInterval(timerRef.current);
            setTimeLeft(0);
            setRoundResults(res.roundResults);
            setPlayerScores(res.standings);
            setPhase('round-end');
            return; // exit attempt
          }
          // If results not yet available, resync game state to see if we moved on
          const gs = await getGameState(gameId);
          if (gs?.success) {
            const g = gs.game;
            if (g?.status === 'playing') {
              // A new round started; resume gameplay safely
              setShowReveal(false);
              setPhase('playing');
              setIsFrozen(false);
              startTimer();
              return;
            }
            if (g?.status === 'round_ended') {
              const vr = await validateAnswers(gameId);
              if (vr?.success) {
                if (timerRef.current) clearInterval(timerRef.current);
                setTimeLeft(0);
                setRoundResults(vr.roundResults);
                setPlayerScores(vr.standings);
                setPhase('round-end');
                return;
              }
            }
          }
        };

        // Kick off immediate attempt, then poll every 4s while in validation
        attempt();
        validationPollTimer = setInterval(() => {
          if (phaseRef.current !== 'validation') return; // stop if phase changed
          attempt();
        }, 4000);
      }
    };

    trySync();

    // Cleanup on phase change/unmount
    cleanupTimer = setTimeout(() => {}, 0); // no-op placeholder to ensure handle
    return () => {
      if (validationPollTimer) clearInterval(validationPollTimer);
      if (cleanupTimer) clearTimeout(cleanupTimer);
    };
  }, [letterTimeLeft, phase, gameId]);

  // Handle hardware back button press
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Show confirmation dialog
      Alert.alert(
        t('gameplay.leaveGame'),
        t('gameplay.leaveGameMessage'),
        [
          { text: t('common.no'), style: 'cancel' },
          {
            text: t('common.yes'),
            onPress: () => {
              // Clean up timers
              if (timerRef.current) clearInterval(timerRef.current);
              if (selectTimerRef.current) clearInterval(selectTimerRef.current);
              if (letterTimerRef.current) clearInterval(letterTimerRef.current);
              if (revealTimerRef.current) clearInterval(revealTimerRef.current);
              // Navigate to menu
              navigation.replace('Menu');
            },
            style: 'destructive'
          }
        ]
      );
      // Return true to prevent default back behavior
      return true;
    });

    return () => backHandler.remove();
  }, [navigation]);

  // Recompute turn when either the selector or current user id changes
  useEffect(() => {
    if (letterSelectorId != null && userId != null) {
      setIsPlayerTurn(String(letterSelectorId) === String(userId));
    }
  }, [letterSelectorId, userId]);

  const handleNextRound = async () => {
    const result = await nextRound(gameId);
    if (result.finished) {
      setShowConfetti(true);
    } else {
      setAnswers({});
      setSelectedCategories([]);
      setCurrentRound(result.currentRound);
      setPhase('letter-selection');
      setHasStoppedFirst(false);
      announcedReadyRef.current = false;
      setIsFrozen(false);
      setShowStopOverlay(false);
    }
  };

  const getCategoryLabel = (category) => {
    switch (category) {
      case 'Name':
        return t('gameplay.categoryNames.name');
      case 'Last Name':
        return t('gameplay.categoryNames.lastName');
      case 'City/Country':
        return t('gameplay.categoryNames.cityCountry');
      case 'Animal':
        return t('gameplay.categoryNames.animal');
      case 'Fruit/Food':
        return t('gameplay.categoryNames.fruitFood');
      case 'Color':
        return t('gameplay.categoryNames.color');
      case 'Object':
        return t('gameplay.categoryNames.object');
      case 'Brand':
        return t('gameplay.categoryNames.brand');
      case 'Profession':
        return t('gameplay.categoryNames.profession');
      case 'Sports':
        return t('gameplay.categoryNames.sports');
      default:
        return category;
    }
  };

  const renderCategorySelection = () => (
    <View style={styles.categorySelectionContainer}>
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.phaseTitle}>{t('gameplay.selectCategories')}</Text>
          {selectionDeadline ? (
            <Text style={styles.instruction}>{t('gameplay.selectExactly')} 6-8 {t('gameplay.categories')}. {t('gameplay.timeLeft')}: {selectTimeLeft}s</Text>
          ) : (
            <Text style={styles.instruction}>{t('gameplay.waitingForPlayers')}</Text>
          )}
          {(totalPlayers > 0) && (
            <Text style={styles.instruction}>{confirmedCount}/{totalPlayers} {t('gameplay.confirmed')}</Text>
          )}
          {showManualReload && !selectionDeadline && (
            <View style={styles.stuckWarningContainer}>
              <Text style={styles.stuckWarningText}>⚠️ {t('common.loading')}</Text>
              <Button
                mode="outlined"
                onPress={() => handleCategoryReload(false)}
                disabled={isReloadingCategories}
                style={styles.manualReloadButton}
                compact
              >
                {isReloadingCategories ? t('common.loading') : t('common.refresh')}
              </Button>
            </View>
          )}
        </Card.Content>
      </Card>
      
      <ScrollView 
        style={styles.categoriesScrollView}
        contentContainerStyle={styles.categoriesScrollContent}
        showsVerticalScrollIndicator={true}
      >
        <View style={styles.categoriesGridNew}>
          {AVAILABLE_CATEGORIES.map(category => {
            const isSelected = selectedCategories.includes(category);
            const isDisabled = !selectionDeadline || hasConfirmed || selectedCategories.includes(category) || selectedCategories.length >= 8 || selectTimeLeft <= 0;
            const iconName = CATEGORY_ICONS[category] || 'help-circle';
            
            return (
              <TouchableOpacity
                key={category}
                style={styles.categoryBoxWrapper}
                onPress={() => handleCategorySelect(category)}
                disabled={isDisabled}
                activeOpacity={0.7}
              >
                <View style={[
                  styles.categoryBox,
                  isSelected && styles.categoryBoxSelected,
                  isDisabled && !isSelected && styles.categoryBoxDisabled
                ]}>
                  <MaterialCommunityIcons
                    name={iconName}
                    size={44}
                    color={isSelected ? '#9E9E9E' : theme.colors.primary}
                    style={styles.categoryIcon}
                  />
                  {isSelected && (
                    <View style={styles.checkmarkContainer}>
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={22}
                        color="#4CAF50"
                      />
                    </View>
                  )}
                </View>
                <Text style={[
                  styles.categoryTitle,
                  isSelected && styles.categoryTitleSelected
                ]}>
                  {getCategoryLabel(category)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      
      <View style={styles.fixedBottomSection}>
        <Button
          mode="contained"
          onPress={handleConfirmCategories}
          disabled={!selectionDeadline || hasConfirmed || selectedCategories.length < 6}
          style={styles.confirmButton}
        >
          {hasConfirmed ? t('gameplay.confirmed') : `${t('gameplay.confirmSelection')} (${selectedCategories.length}/6-8)`}
        </Button>
        
        <View style={styles.selectedCategoriesContainer}>
          <Text style={styles.selectedCategoriesLabel}>
            {t('gameplay.selectCategories')}: 
            <Text style={styles.selectedCategoriesText}>
              {selectedCategories.length > 0 ? selectedCategories.map(c => getCategoryLabel(c)).join(', ') : t('common.no')}
            </Text>
          </Text>
        </View>
        
        {selectionDeadline && selectTimeLeft <= 0 && (
          <Text style={styles.waitingText}>{t('common.loading')}</Text>
        )}
      </View>
    </View>
  );

  const renderLetterSelection = () => (
    <Card style={styles.card}>
      <Card.Content>
        <Text style={styles.phaseTitle}>{t('gameplay.letterSelection')}</Text>
        {isPlayerTurn ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Text style={styles.instruction}>{t('gameplay.yourTurn')} {letterTimeLeft}s</Text>
            <TextInput
              value={letterInput}
              onChangeText={(t) => setLetterInput((t || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0,1))}
              placeholder={t('gameplay.enterLetter')}
              style={styles.letterInput}
              autoCapitalize="characters"
              maxLength={1}
              autoFocus
            />
            <Button
              mode="contained"
              onPress={() => selectLetter(gameId, letterInput)}
              style={styles.acceptButton}
              disabled={!letterInput || letterTimeLeft <= 0}
            >
              {t('gameplay.chooseLetter')}
            </Button>
            <Button
              mode="outlined"
              onPress={() => selectLetter(gameId)}
              style={styles.letterButton}
              icon="dice-3"
            >
              {t('common.random')}
            </Button>
            <View style={styles.quickLettersContainer}>
              {ALPHABET.map((L) => (
                <Button
                  key={L}
                  mode="text"
                  compact
                  onPress={() => setLetterInput(L)}
                  style={styles.quickLetter}
                  labelStyle={styles.quickLetterLabel}
                  disabled={letterTimeLeft <= 0}
                >
                  {L}
                </Button>
              ))}
            </View>
          </KeyboardAvoidingView>
        ) : (
          <Text style={styles.waitingText}>{t('common.waiting')} {letterSelectorName || t('gameplay.player')} {t('gameplay.isSelecting')} {letterDeadline ? `${letterTimeLeft}s` : ''}</Text>
        )}
      </Card.Content>
    </Card>
  );

  const toggleInputVisibility = (category) => {
    setHiddenInputs(prev => ({
      ...prev,
      [category]: !prev[category]
    }));
  };

  const toggleHideAll = () => {
    setHideAllInputs(prev => !prev);
  };

  const focusNextInput = (currentIndex) => {
    if (currentIndex < selectedCategories.length - 1) {
      const nextCategory = selectedCategories[currentIndex + 1];
      // Use setTimeout to prevent keyboard from closing
      setTimeout(() => {
        if (inputRefs.current[nextCategory]) {
          inputRefs.current[nextCategory].focus();
          
          // Scroll to show the down arrow button of the next input
          if (cardRefs.current[nextCategory] && scrollViewRef.current) {
            cardRefs.current[nextCategory].measureLayout(
              scrollViewRef.current,
              (x, y, width, height) => {
                // Scroll with extra offset to show the down arrow button below the input
                // Adding 80px extra to ensure the down arrow is visible
                scrollViewRef.current.scrollTo({ y: y - 100, animated: true });
              },
              () => {}
            );
          }
        }
      }, 50);
    }
  };

  const renderGameplay = () => (
    <View style={styles.gameplayContainer}>
      <View style={styles.header}>
        <View style={styles.roundInfo}>
          <Text style={styles.roundText}>{t('gameplay.round')} {currentRound}/{totalRounds}</Text>
          <Text style={styles.letterText}>{t('gameplay.letterIs')}: {currentLetter}</Text>
        </View>
        <View style={styles.timerContainer}>
          <Text style={styles.timerText}>{timeLeft}s</Text>
          <ProgressBar 
            progress={timeLeft / 60} 
            color={timeLeft > 10 ? theme.colors.primary : '#F44336'}
            style={styles.timerBar}
          />
        </View>
      </View>
      {(!selectedCategories || selectedCategories.length === 0) ? (
        <View style={styles.stuckContainer}>
          <Text style={styles.stuckText}>{t('common.loading')}</Text>
          <Text style={styles.stuckSubtext}>{t('common.error')}</Text>
          {isRefreshingGameplay && (
            <ActivityIndicator 
              size="large" 
              color={theme.colors.primary} 
              style={{ marginTop: 20 }}
            />
          )}
          {gameplayRefreshError && (
            <Text style={styles.refreshErrorText}>{gameplayRefreshError}</Text>
          )}
          <Button 
            mode="contained" 
            onPress={handleRefreshGameplay} 
            disabled={isRefreshingGameplay}
            loading={isRefreshingGameplay}
            style={[styles.refreshButton, isRefreshingGameplay && styles.refreshButtonDisabled]}
          >
            {isRefreshingGameplay ? t('common.loading') : t('common.refresh')}
          </Button>
        </View>
      ) : (
        <ScrollView 
          ref={scrollViewRef}
          style={styles.answersContainer} 
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.hideAllContainer}>
            <Text
              style={styles.hideAllLabel}
              onPress={toggleHideAll}
            >
              {hideAllInputs ? t('common.showAll') : t('common.hideAll')}
            </Text>
          </View>
          {selectedCategories.map((category, index) => {
            const isHidden = hideAllInputs || hiddenInputs[category];
            const isLastInput = index === selectedCategories.length - 1;
            const actualValue = answers[category] || '';
            const displayValue = isHidden ? '*'.repeat(actualValue.length) : actualValue;
            
            return (
              <View 
                key={category}
                ref={(ref) => { cardRefs.current[category] = ref; }}
                collapsable={false}
              >
                <Card style={styles.answerCard}>
                <Card.Content>
                  <View style={styles.categoryLabelContainer}>
                    <MaterialCommunityIcons 
                      name={getCategoryIcon(category)} 
                      size={20} 
                      color={theme.colors.primary}
                      style={styles.categoryIcon}
                    />
                    <Text style={styles.categoryTitle}>
                      {getCategoryLabel(category)}
                    </Text>
                  </View>
                  <View style={styles.inputRow}>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        ref={(ref) => { inputRefs.current[category] = ref; }}
                        value={actualValue}
                        onChangeText={(text) => handleAnswerChange(category, text)}
                        placeholder={`${getCategoryLabel(category)} - ${currentLetter}`}
                        style={[styles.answerInput, isHidden && styles.hiddenInput]}
                        autoCapitalize="words"
                        editable={timeLeft > 0 && !isFrozen}
                      />
                      {isHidden && (
                        <View style={styles.maskOverlay} pointerEvents="none">
                          <Text style={styles.maskText}>{displayValue || ''}</Text>
                        </View>
                      )}
                    </View>
                    <IconButton
                      icon={isHidden ? 'eye-off' : 'eye'}
                      size={20}
                      onPress={() => toggleInputVisibility(category)}
                      style={styles.eyeIcon}
                      iconColor={theme.colors.primary}
                    />
                  </View>
                  {(() => { const err = getAnswerError(answers[category] || ''); return err ? (<Text style={styles.errorText}>{err}</Text>) : null; })()}
                  {!isLastInput && (
                    <IconButton
                      icon="arrow-down"
                      size={24}
                      onPress={() => focusNextInput(index)}
                      style={styles.downArrowButton}
                      iconColor={theme.colors.primary}
                    />
                  )}
                </Card.Content>
              </Card>
              </View>
            );
          })}
        </ScrollView>
      )}

      <Button
        mode="contained"
        onPress={handleStop}
        style={[styles.stopButton, { backgroundColor: canFinish ? '#4CAF50' : '#9E9E9E' }]}
        disabled={timeLeft === 0 || hasStoppedFirst || !canFinish || isFrozen}
      >
        {t('gameplay.stop')}
      </Button>
    </View>
  );

  const renderRoundEnd = () => {
    // Find the player result we're viewing
    const viewingResult = Array.isArray(roundResults) 
      ? roundResults.find(r => {
          const pid = (r.user && r.user._id) ? r.user._id : r.user;
          const pidStr = typeof pid === 'string' ? pid : String(pid || '');
          return pidStr === String(viewingPlayerId || '');
        })
      : null;

    const viewingPlayer = viewingResult ? viewingResult.user : null;
    const viewingAnswers = viewingResult?.answers;
    const isCurrentUser = String(viewingPlayerId || '') === String(userId || '');
    
    // Get player name
    const getPlayerName = (playerUser) => {
      if (!playerUser) return t('gameplay.player');
      const pid = (playerUser._id) ? playerUser._id : playerUser;
      const pidStr = typeof pid === 'string' ? pid : String(pid || '');
      if (pidStr === String(userId || '')) return t('leaderboard.you');
      return playerUser.displayName || playerUser.username || `${t('gameplay.player')} ${pidStr.substring(0, 5)}`;
    };

    // Calculate total points for this round
    const roundPoints = viewingAnswers?.categoryAnswers?.reduce((sum, ca) => sum + (ca.points || 0), 0) || 0;
    const stopBonus = viewingAnswers?.stoppedFirst ? 5 : 0;
    const totalRoundPoints = roundPoints + stopBonus;

    return (
      <ScrollView style={styles.container}>
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.phaseTitle}>{t('gameplay.round')} {currentRound} {t('gameplay.roundResults')}</Text>
            
            {/* Player Navigation */}
            <View style={styles.playerNavigationContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.playerTabsScroll}>
                {Array.isArray(roundResults) && roundResults.map((result, idx) => {
                  const pid = (result.user && result.user._id) ? result.user._id : result.user;
                  const pidStr = typeof pid === 'string' ? pid : String(pid || '');
                  const isSelected = pidStr === String(viewingPlayerId || '');
                  const isCurrentUserTab = pidStr === String(userId || '');
                  const playerName = getPlayerName(result.user);
                  
                  return (
                    <Button
                      key={pidStr || String(idx)}
                      mode={isSelected ? 'contained' : 'outlined'}
                      onPress={() => setViewingPlayerId(pidStr)}
                      style={[styles.playerTab, isSelected && styles.playerTabSelected]}
                      labelStyle={isSelected ? styles.playerTabLabelSelected : styles.playerTabLabel}
                      compact
                    >
                      {playerName}
                    </Button>
                  );
                })}
              </ScrollView>
            </View>

            {/* Answer Details Table */}
            {viewingAnswers && viewingAnswers.categoryAnswers && viewingAnswers.categoryAnswers.length > 0 ? (
              <View style={styles.answerDetailsContainer}>
                <Text style={styles.answerDetailsTitle}>{getPlayerName(viewingPlayer)}</Text>
                
                <DataTable style={styles.dataTable}>
                  <DataTable.Header>
                    <DataTable.Title style={styles.tableHeaderCategory}>{t('gameplay.category')}</DataTable.Title>
                    <DataTable.Title style={styles.tableHeaderAnswer}>{t('gameplay.answer')}</DataTable.Title>
                    <DataTable.Title style={styles.tableHeaderPoints} numeric>{t('leaderboard.pts')}</DataTable.Title>
                    <DataTable.Title style={styles.tableHeaderStatus}></DataTable.Title>
                  </DataTable.Header>

                  {viewingAnswers.categoryAnswers.map((ca, idx) => (
                    <DataTable.Row key={idx} style={styles.tableRow}>
                      <DataTable.Cell style={styles.tableCellCategory}>
                        <Text style={styles.categoryText}>{ca.category}</Text>
                      </DataTable.Cell>
                      <DataTable.Cell style={styles.tableCellAnswer}>
                        <Text style={styles.answerText} numberOfLines={1}>{ca.answer || '-'}</Text>
                      </DataTable.Cell>
                      <DataTable.Cell style={styles.tableCellPoints} numeric>
                        <Text style={[styles.pointsText, ca.isValid && styles.pointsTextValid]}>
                          {ca.points || 0}
                        </Text>
                      </DataTable.Cell>
                      <DataTable.Cell style={styles.tableCellStatus}>
                        <IconButton
                          icon={ca.isValid ? 'check-circle' : 'close-circle'}
                          iconColor={ca.isValid ? '#4CAF50' : '#F44336'}
                          size={20}
                          style={styles.validationIcon}
                        />
                      </DataTable.Cell>
                    </DataTable.Row>
                  ))}
                </DataTable>

                {/* Round Summary */}
                <View style={styles.roundSummary}>
                  {viewingAnswers.stoppedFirst && (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{t('gameplay.stopBonus')}:</Text>
                      <Text style={styles.summaryValue}>+5 {t('leaderboard.pts')}</Text>
                    </View>
                  )}
                  <View style={[styles.summaryRow, styles.summaryTotal]}>
                    <Text style={styles.summaryTotalLabel}>{t('gameplay.roundTotal')}:</Text>
                    <Text style={styles.summaryTotalValue}>{totalRoundPoints} {t('leaderboard.pts')}</Text>
                  </View>
                </View>
              </View>
            ) : (
              <Text style={styles.noAnswersText}>{getPlayerName(viewingPlayer)}</Text>
            )}

            {/* Continue Button */}
            {currentRound < totalRounds && (
              <>
                <Text style={styles.instruction}>{`(${readyCount}/${readyTotal}) ${t('common.ready')}`}</Text>
                {typeof nextCountdown === 'number' && nextCountdown >= 0 && (
                  <Text style={styles.instruction}>{t('gameplay.nextRound')} {nextCountdown}s</Text>
                )}
                <Button
                  mode="contained"
                  onPress={() => readyNextRound(gameId)}
                  style={styles.nextButton}
                >
                  {t('common.next')}
                </Button>
              </>
            )}
            {currentRound >= totalRounds && !isFinished && (
              <>
                <Button
                  mode="contained"
                  onPress={() => { readyNextRound(gameId); setFinalConfirmed(true); setIsFinished(true); }}
                  style={styles.nextButton}
                >
                  {t('gameplay.confirmSelection')}
                </Button>
              </>
            )}

            {/* Overall Standings */}
            <View style={styles.standingsContainer}>
              <Text style={styles.standingsTitle}>{t('gameplay.overallStandings')}</Text>
              <View style={styles.scoresContainer}>
                {Array.isArray(playerScores) && playerScores.map((s, idx) => {
                  const pid = (s.user && s.user._id) ? s.user._id : s.user;
                  const pidStr = typeof pid === 'string' ? pid : String(pid || '');
                  const name = getPlayerName(s.user);
                  return (
                    <View key={pidStr || String(idx)} style={styles.scoreItem}>
                      <Text style={styles.playerName}>{name}</Text>
                      <Text style={styles.playerScore}>{s.score} {t('leaderboard.pts')}</Text>
                    </View>
                  );
                })}
              </View>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    );
  };

  const renderFinalResults = () => {
    const scores = Array.isArray(playerScores) ? playerScores : [];
    const max = scores.reduce((m, s) => Math.max(m, s.score || 0), 0);
    const winners = scores.filter(s => (s.score || 0) === max);
    const isDraw = winners.length > 1;
    const winnerNames = winners.map((s) => {
      const pid = (s.user && s.user._id) ? s.user._id : s.user;
      const pidStr = typeof pid === 'string' ? pid : String(pid || '');
      return pidStr === userId ? t('leaderboard.you') : `${t('gameplay.player')} ${pidStr.substring(0,5)}`;
    });

    return (
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.phaseTitle}>{t('gameplay.finalScores')}</Text>
          <View style={styles.scoresContainer}>
            {scores.map((s, idx) => {
              const pid = (s.user && s.user._id) ? s.user._id : s.user;
              const pidStr = typeof pid === 'string' ? pid : String(pid || '');
              const name = pidStr === userId ? t('leaderboard.you') : `${t('gameplay.player')} ${pidStr.substring(0, 5)}`;
              return (
                <View key={pidStr || String(idx)} style={styles.scoreItem}>
                  <Text style={styles.playerName}>{name}</Text>
                  <Text style={styles.playerScore}>{s.score} {t('leaderboard.pts')}</Text>
                </View>
              );
            })}
          </View>
          {finalConfirmed ? (
            <>
              <Text style={styles.instruction}>
                {isDraw ? `${winnerNames.join(', ')}` : `${t('gameplay.winner')}: ${winnerNames[0]}`}
              </Text>
              <Text style={styles.instruction}>{`(${rematchReady}/${rematchTotal}) ${t('gameplay.playAgain')}`}</Text>
              <Button
                mode="contained"
                onPress={() => { if (!hasVotedRematch && !rematchAborted) { setHasVotedRematch(true); playAgainReady(gameId); } }}
                style={styles.nextButton}
                disabled={hasVotedRematch || rematchAborted}
                labelStyle={{ color: '#FFFFFF' }}
              >
                {rematchAborted ? t('common.error') : (typeof rematchCountdown === 'number') ? `${t('common.start')} ${rematchCountdown}s...` : hasVotedRematch ? t('gameplay.waitingForPlayers') : t('gameplay.playAgain')}
              </Button>
              <Button
                mode="outlined"
                onPress={() => navigation.replace('Menu')}
                style={styles.nextButton}
                labelStyle={{ color: theme.colors.primary }}
              >
                {t('gameplay.backToMenu')}
              </Button>
            </>
          ) : (
            <Button
              mode="contained"
              onPress={() => setFinalConfirmed(true)}
              style={styles.nextButton}
            >
              {t('gameplay.confirmFinalResults')}
            </Button>
          )}
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: HEADER_HEIGHT }]}>        
      <View style={[styles.gameHeader, { height: HEADER_HEIGHT }]}>
        <TouchableOpacity onPress={handleLeaveGame} style={styles.headerIconBtn} activeOpacity={0.7}>
          <MaterialCommunityIcons name="arrow-left" size={24} color="#424242" />
        </TouchableOpacity>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.headerScroll} contentContainerStyle={styles.headerCenter}>
          {playersForHeader.map((p) => {
            const isLeader = leaderPlayerId && p.id === leaderPlayerId;
            const gain = roundGainMap && roundGainMap[p.id];
            const gainAnim = roundGainAnimMapRef.current && roundGainAnimMapRef.current[p.id];
            const isDisconnected = disconnectedPlayers.has(p.id);
            const displayScore = isDisconnected ? 0 : ((pointsById && pointsById[p.id]) != null ? pointsById[p.id] : 0);
            return (
              <View key={p.id} style={[styles.playerItem, { width: CIRCLE_SIZE + 28 }]}> 
                <View style={[styles.playerCircle, { width: CIRCLE_SIZE, height: CIRCLE_SIZE, borderRadius: CIRCLE_SIZE / 2 }, isDisconnected && styles.playerCircleDisconnected]}> 
                  <MaterialCommunityIcons name="account" size={Math.round(CIRCLE_SIZE * 0.55)} color={isDisconnected ? '#9E9E9E' : theme.colors.primary} /> 
                  {/* Red slash overlay for disconnected players */}
                  {isDisconnected && (
                    <View style={styles.disconnectedOverlay}>
                      <MaterialCommunityIcons 
                        name="cancel" 
                        size={Math.round(CIRCLE_SIZE * 0.9)} 
                        color="#F44336" 
                        style={styles.disconnectedIcon}
                      />
                    </View>
                  )}
                  {isLeader && !isDisconnected && (
                    <View style={[styles.crownContainer, {
                      top: -CIRCLE_SIZE * 0.08,
                      right: -CIRCLE_SIZE * 0.08,
                    }]}> 
                      <MaterialCommunityIcons 
                        name="crown" 
                        size={Math.round(CIRCLE_SIZE * 0.45)} 
                        color="#FFD700" 
                        style={{ transform: [{ rotate: '45deg' }] }}
                      />
                    </View>
                  )}
                  <View style={[styles.scorePill, isDisconnected && styles.scorePillDisconnected, { 
                    width: (CIRCLE_SIZE + 28) * 0.7,
                    left: '50%', 
                    transform: [
                      { translateX: -((CIRCLE_SIZE + 28) * 0.35) }
                    ]
                  }]}> 
                    <Text style={[styles.scorePillText, isDisconnected && styles.scorePillTextDisconnected]}>{displayScore}</Text> 
                  </View>
                  {gain != null && gainAnim && !isDisconnected && (
                    <Animated.View
                      pointerEvents="none"
                      style={[
                        styles.roundGainContainer,
                        {
                          opacity: gainAnim.opacity,
                          transform: [{ scale: gainAnim.scale }],
                        },
                      ]}
                    >
                      <Text style={styles.roundGainText}>+{gain}</Text>
                    </Animated.View>
                  )}
                </View> 
                <View style={styles.playerNameContainer}>
                  <Text style={[styles.playerName, { maxWidth: CIRCLE_SIZE + 20, fontSize: 7 }, isDisconnected && styles.playerNameDisconnected]} numberOfLines={1}>{p.name}</Text> 
                </View>
              </View>
            );
          })}
        </ScrollView>
        <TouchableOpacity onPress={() => setSettingsVisible(true)} style={styles.headerIconBtn} activeOpacity={0.7}>
          <MaterialCommunityIcons name="cog" size={22} color="#424242" />
        </TouchableOpacity>
      </View>
      <Portal>
        <Modal
          visible={settingsVisible}
          onDismiss={() => setSettingsVisible(false)}
          contentContainerStyle={[
            styles.settingsModal,
            { maxHeight: Math.round(winH * 0.9), width: Math.round(winW * 0.94) }
          ]}
        >
          <View style={{ height: Math.round(winH * 0.88) }}>
            <SettingsScreen navigation={navigation} onClose={() => setSettingsVisible(false)} inGame />
          </View>
        </Modal>
      </Portal>
      {showStopOverlay && (
        <View style={styles.revealOverlay} pointerEvents="none">
          <Animated.View style={[styles.revealBox]}>
            <Text style={styles.stopText}>{t('gameplay.stop')}</Text>
          </Animated.View>
        </View>
      )}
      {showReveal && (
        <View style={styles.revealOverlay} pointerEvents="none">
          <Animated.View style={[styles.revealBox]}>
            <Text style={styles.revealText}>{t('gameplay.startingIn')} {revealTimeLeft}...</Text>
          </Animated.View>
        </View>
      )}
      {showConfetti && (
        <ConfettiCannon
          ref={confettiRef}
          count={200}
          origin={{ x: -10, y: 0 }}
          fadeOut
        />
      )}
      
      {phase === 'category-selection' && renderCategorySelection()}
      {phase === 'letter-selection' && renderLetterSelection()}
      {phase === 'playing' && renderGameplay()}
      {phase === 'validation' && (
        <View style={styles.validationContainer}>
          <Text style={styles.validationText}>{t('gameplay.validatingAnswers')}</Text>
          {isRefreshing && (
            <ActivityIndicator 
              size="large" 
              color={theme.colors.primary} 
              style={{ marginTop: 20 }}
            />
          )}
          {retryAttempt > 0 && (
            <Text style={styles.retryAttemptText}>{t('gameplay.attempt')} {retryAttempt}</Text>
          )}
          {refreshError && (
            <Text style={styles.refreshErrorText}>{refreshError}</Text>
          )}
          <Button 
            mode="contained" 
            onPress={() => handleRefreshValidation(false)} 
            disabled={isRefreshing}
            loading={isRefreshing}
            style={[styles.refreshButton, isRefreshing && styles.refreshButtonDisabled]}
          >
            {isRefreshing ? t('common.loading') : t('common.refresh')}
          </Button>
        </View>
      )}
      {phase === 'round-end' && renderRoundEnd()}
      {isFinished && phase === 'round-end' && renderFinalResults()}
    </View>
  );
};

const AVAILABLE_CATEGORIES = [
  'Name',
  'Last Name',
  'City/Country',
  'Animal',
  'Fruit/Food',
  'Color',
  'Object',
  'Brand',
  'Profession',
  'Sports'
];

const CATEGORY_ICONS = {
  'Name': 'account',
  'Last Name': 'account-group',
  'City/Country': 'city',
  'Animal': 'paw',
  'Fruit/Food': 'food-apple',
  'Color': 'palette',
  'Object': 'cube',
  'Brand': 'tag',
  'Profession': 'briefcase',
  'Sports': 'basketball'
};

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  card: {
    margin: 20,
    elevation: 3,
    borderRadius: 15,
  },
  phaseTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: 15,
    textAlign: 'center',
  },
  instruction: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 20,
    textAlign: 'center',
  },
  errorText: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 20,
    textAlign: 'center',
  },
  stopText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#F44336',
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginBottom: 20,
  },
  categorySelectionContainer: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  categoriesScrollView: {
    flex: 1,
  },
  categoriesScrollContent: {
    paddingHorizontal: 10,
    paddingBottom: 20,
  },
  categoriesGridNew: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  categoryBoxWrapper: {
    width: '31%',
    marginBottom: 15,
    alignItems: 'center',
  },
  fixedBottomSection: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingTop: 15,
    paddingBottom: 20,
    borderTopWidth: 2,
    borderTopColor: '#E0E0E0',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  categoryBox: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    position: 'relative',
  },
  categoryBoxSelected: {
    backgroundColor: '#F5F5F5',
    borderColor: '#4CAF50',
    opacity: 0.7,
  },
  categoryBoxDisabled: {
    opacity: 0.5,
  },
  categoryIcon: {
    marginBottom: 0,
  },
  checkmarkContainer: {
    position: 'absolute',
    top: 4,
    right: 4,
  },
  stuckWarningContainer: {
    backgroundColor: '#FFF3E0',
    borderRadius: 8,
    padding: 12,
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#FFB74D',
  },
  stuckWarningText: {
    fontSize: 13,
    color: '#E65100',
    fontWeight: '600',
    flex: 1,
  },
  manualReloadButton: {
    marginLeft: 10,
    borderColor: '#FF9800',
  },
  categoryTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#424242',
    textAlign: 'center',
    marginTop: 7,
    paddingHorizontal: 2,
  },
  categoryTitleSelected: {
    color: '#757575',
  },
  selectedCategoriesContainer: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    padding: 12,
    marginTop: 15,
  },
  selectedCategoriesLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#424242',
  },
  selectedCategoriesText: {
    fontSize: 14,
    fontWeight: 'normal',
    color: theme.colors.primary,
  },
  categoryChip: {
    margin: 5,
  },
  confirmButton: {
    backgroundColor: theme.colors.primary,
    marginBottom: 0,
  },
  waitingText: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    marginVertical: 30,
  },
  letterButton: {
    backgroundColor: theme.colors.accent,
    marginTop: 20,
  },
  letterInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 24,
    backgroundColor: '#FFFFFF',
    textAlign: 'center'
  },
  acceptButton: {
    marginTop: 12,
    backgroundColor: theme.colors.primary,
  },
  quickLettersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    marginTop: 12,
  },
  quickLetter: {
    width: '25%',
    marginVertical: 2,
  },
  quickLetterLabel: {
    fontSize: 16,
  },
  gameplayContainer: {
    flex: 1,
  },
  revealOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  revealBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 24,
    paddingHorizontal: 32,
    elevation: 6,
  },
  revealText: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  gameHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    zIndex: 20,
    elevation: 12,
    overflow: 'visible',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerIconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerScroll: {
    flex: 1,
    height: '100%',
  },
  headerCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerItem: {
    width: 68,
    alignItems: 'center',
    marginHorizontal: 6,
  },
  playerCircle: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5F5',
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  crownContainer: {
    position: 'absolute',
    zIndex: 10,
  },
  playerNameContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  playerName: {
    marginTop: 4,
    fontSize: 9,
    color: '#424242',
    maxWidth: 68,
    textAlign: 'center',
  },
  roundGainContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roundGainText: {
    fontSize: 72,
    color: '#4CAF50',
    fontWeight: '900',
    textShadowColor: 'rgba(0,0,0,0.35)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
  },
  scorePill: {
    position: 'absolute',
    bottom: 0,
    paddingHorizontal: 4, // Slightly more horizontal padding
    paddingVertical: 0,
    height: 14, // Increased height to ensure text fits
    minWidth: 25, // Slightly wider minimum width
    borderRadius: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E0E0E0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorePillText: {
    fontSize: 10, // Increased font size for better visibility
    fontWeight: 'bold',
    color: theme.colors.primary,
    lineHeight: 12, // Adjusted line height
    textAlign: 'center',
    paddingHorizontal: 1,
    includeFontPadding: false, // Remove any default font padding
    textAlignVertical: 'center', // Better vertical alignment
  },
  // Disconnected player styles
  playerCircleDisconnected: {
    borderColor: '#9E9E9E',
    backgroundColor: '#E0E0E0',
    opacity: 0.8,
  },
  disconnectedOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  disconnectedIcon: {
    opacity: 0.85,
  },
  scorePillDisconnected: {
    backgroundColor: '#E0E0E0',
    borderColor: '#BDBDBD',
  },
  scorePillTextDisconnected: {
    color: '#757575',
  },
  playerNameDisconnected: {
    color: '#9E9E9E',
  },
  settingsModal: {
    margin: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 0,
    maxHeight: '90%',
    alignSelf: 'center',
    overflow: 'hidden',
  },
  header: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    elevation: 3,
  },
  roundInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  roundText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#424242',
  },
  letterText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  timerContainer: {
    alignItems: 'center',
  },
  timerText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#424242',
    marginBottom: 3,
  },
  timerBar: {
    width: '100%',
    height: 6,
    borderRadius: 4,
  },
  answersContainer: {
    flex: 1,
    padding: 20,
  },
  answerCard: {
    marginBottom: 15,
    elevation: 2,
  },
  categoryLabelContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
  },
  categoryIcon: {
    marginRight: 8,
  },
  categoryLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  inputWrapper: {
    flex: 1,
    position: 'relative',
  },
  answerInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
  },
  hiddenInput: {
    color: 'transparent',
  },
  maskOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    paddingHorizontal: 10,
    borderRadius: 8,
  },
  maskText: {
    fontSize: 16,
    color: '#000000',
    letterSpacing: 2,
  },
  eyeIcon: {
    margin: 0,
    marginLeft: 4,
  },
  downArrowButton: {
    alignSelf: 'center',
    margin: 0,
    marginTop: 4,
  },
  hideAllContainer: {
    paddingHorizontal: 0,
    paddingTop: 4,
    paddingBottom: 8,
    alignItems: 'flex-start',
  },
  hideAllButton: {
    borderColor: theme.colors.primary,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 0,
    minHeight: 32,
    borderRadius: 18,
  },
  hideAllLabel: {
    color: theme.colors.primary,
    fontSize: 12,
  },
  errorText: {
    color: '#F44336',
    marginTop: 6,
  },
  stopButton: {
    margin: 20,
    backgroundColor: '#F44336',
    elevation: 5,
  },
  validationContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  validationText: {
    fontSize: 18,
    color: '#757575',
    marginBottom: 5,
  },
  autoRetryText: {
    fontSize: 14,
    color: theme.colors.primary,
    marginBottom: 10,
    fontStyle: 'italic',
  },
  retryAttemptText: {
    fontSize: 13,
    color: '#9E9E9E',
    marginTop: 10,
    marginBottom: 5,
  },
  stuckContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  stuckText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#424242',
    marginBottom: 10,
  },
  stuckSubtext: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 10,
  },
  refreshButton: {
    marginTop: 20,
    backgroundColor: theme.colors.primary,
  },
  refreshButtonDisabled: {
    backgroundColor: '#9E9E9E',
  },
  refreshErrorText: {
    fontSize: 14,
    color: '#F44336',
    marginTop: 15,
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  scoresContainer: {
    marginVertical: 20,
  },
  scoreItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  playerName: {
    fontSize: 16,
    color: '#424242',
  },
  playerScore: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  nextButton: {
    marginTop: 20,
    backgroundColor: theme.colors.primary,
  },
  playerNavigationContainer: {
    marginBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingBottom: 10,
  },
  playerTabsScroll: {
    flexDirection: 'row',
  },
  playerTab: {
    marginHorizontal: 4,
    borderRadius: 8,
  },
  playerTabSelected: {
    backgroundColor: theme.colors.primary,
  },
  playerTabLabel: {
    fontSize: 14,
    color: theme.colors.primary,
  },
  playerTabLabelSelected: {
    fontSize: 14,
    color: '#FFFFFF',
  },
  answerDetailsContainer: {
    marginBottom: 20,
  },
  answerDetailsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#424242',
    marginBottom: 15,
    textAlign: 'center',
  },
  dataTable: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    overflow: 'hidden',
  },
  tableHeaderCategory: {
    flex: 2,
  },
  tableHeaderAnswer: {
    flex: 3,
  },
  tableHeaderPoints: {
    flex: 1,
  },
  tableHeaderStatus: {
    flex: 1,
  },
  tableRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tableCellCategory: {
    flex: 2,
  },
  tableCellAnswer: {
    flex: 3,
  },
  tableCellPoints: {
    flex: 1,
  },
  tableCellStatus: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryText: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  answerText: {
    fontSize: 13,
    color: '#424242',
  },
  pointsText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#757575',
  },
  pointsTextValid: {
    color: '#4CAF50',
  },
  validationIcon: {
    margin: 0,
  },
  roundSummary: {
    marginTop: 15,
    padding: 15,
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 5,
  },
  summaryLabel: {
    fontSize: 14,
    color: '#424242',
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#4CAF50',
  },
  summaryTotal: {
    borderTopWidth: 2,
    borderTopColor: theme.colors.primary,
    marginTop: 8,
    paddingTop: 10,
  },
  summaryTotalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#424242',
  },
  summaryTotalValue: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  noAnswersText: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginVertical: 20,
    fontStyle: 'italic',
  },
  standingsContainer: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  standingsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#424242',
    marginBottom: 10,
    textAlign: 'center',
  },
});

export default GameplayScreen;
