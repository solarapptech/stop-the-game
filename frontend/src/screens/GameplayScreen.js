import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, TextInput, Alert, Animated, KeyboardAvoidingView, Platform } from 'react-native';
import { Text, Button, Card, IconButton, Chip, ProgressBar } from 'react-native-paper';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useSocket } from '../contexts/SocketContext';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import theme from '../theme';

const GameplayScreen = ({ navigation, route }) => {
  const { gameId } = route.params;
  const { user } = useAuth();
  const { socket, connected, isAuthenticated, joinGame, selectCategory, selectLetter, stopRound, confirmCategories, categoryPhaseReady, readyNextRound, playAgainReady } = useSocket();
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
  
  const timerRef = useRef(null);
  const selectTimerRef = useRef(null);
  const announcedReadyRef = useRef(false);
  const letterTimerRef = useRef(null);
  const revealTimerRef = useRef(null);
  const confettiRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const answersRef = useRef(answers);
  const stopShownRef = useRef(false);
  const phaseRef = useRef(phase);
  const userIdRef = useRef(userId);

  useEffect(() => {
    loadGameState();
    if (joinGame && gameId) joinGame(gameId);
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (selectTimerRef.current) clearInterval(selectTimerRef.current);
      if (letterTimerRef.current) clearInterval(letterTimerRef.current);
      if (revealTimerRef.current) clearInterval(revealTimerRef.current);
    };
  }, []);

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
      setPhase('validation');
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
    };
    const onReadyUpdate = (data) => {
      if (typeof data.ready === 'number') setReadyCount(data.ready);
      if (typeof data.total === 'number') setReadyTotal(data.total);
    };
    const onNextRoundCountdown = (data) => {
      if (typeof data.seconds === 'number') setNextCountdown(data.seconds);
    };
    const onGameFinished = (data) => {
      setShowConfetti(true);
      setIsFinished(true);
      // derive totals if provided
      if (Array.isArray(data?.standings)) setPlayerScores(data.standings);
      if (Array.isArray(playerScores) && playerScores.length > 0) {
        setRematchTotal(playerScores.length);
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
      // New game begins
      navigation.replace('Gameplay', { gameId: data.gameId });
    };
    const onRematchCountdown = (data) => {
      if (typeof data.seconds === 'number') setRematchCountdown(data.seconds);
    };

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

  // When entering category-selection phase, signal readiness exactly once
  useEffect(() => {
    if (phase === 'category-selection' && categoryPhaseReady && !announcedReadyRef.current) {
      categoryPhaseReady(gameId);
      announcedReadyRef.current = true;
    }
  }, [phase, categoryPhaseReady, gameId]);

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
            'Game Over!',
            `Winner: ${data.winner.username}\nFinal Score: ${data.winner.score}`,
            [
              { text: 'View Leaderboard', onPress: () => navigation.replace('Leaderboard') },
              { text: 'Back to Menu', onPress: () => navigation.replace('Menu') }
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
      return `It doesn't start with letter '${currentLetter}'`;
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

  useEffect(() => {
    const trySync = async () => {
      if (phase === 'letter-selection' && letterTimeLeft === 0) {
        const result = await getGameState(gameId);
        if (result?.success) {
          const g = result.game;
          if (g?.currentLetter) {
            setCurrentLetter(g.currentLetter);
          }
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
    };
    trySync();
  }, [letterTimeLeft, phase, gameId]);

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

  const renderCategorySelection = () => (
    <Card style={styles.card}>
      <Card.Content>
        <Text style={styles.phaseTitle}>Select Categories</Text>
        {selectionDeadline ? (
          <Text style={styles.instruction}>Pick 6-8 categories. Time left: {selectTimeLeft}s</Text>
        ) : (
          <Text style={styles.instruction}>Waiting for all players to enter this screen. Timer will start at 60s for everyone.</Text>
        )}
        {(totalPlayers > 0) && (
          <Text style={styles.instruction}>{confirmedCount}/{totalPlayers} Players ready</Text>
        )}
        <View style={styles.categoriesGrid}>
          {AVAILABLE_CATEGORIES.map(category => (
            <Chip
              key={category}
              selected={selectedCategories.includes(category)}
              disabled={!selectionDeadline || hasConfirmed || selectedCategories.includes(category) || selectedCategories.length >= 8 || selectTimeLeft <= 0}
              onPress={() => handleCategorySelect(category)}
              style={styles.categoryChip}
              mode="outlined"
            >
              {category}
            </Chip>
          ))}
        </View>
        <Button
          mode="contained"
          onPress={handleConfirmCategories}
          disabled={!selectionDeadline || hasConfirmed || selectedCategories.length < 6}
          style={styles.confirmButton}
        >
          {hasConfirmed ? 'Ready' : `Confirm (${selectedCategories.length}/6-8)`}
        </Button>
        {selectionDeadline && selectTimeLeft <= 0 && (
          <Text style={styles.waitingText}>Time is up. Finalizing categories...</Text>
        )}
      </Card.Content>
    </Card>
  );

  const renderLetterSelection = () => (
    <Card style={styles.card}>
      <Card.Content>
        <Text style={styles.phaseTitle}>Letter Selection</Text>
        {isPlayerTurn ? (
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <Text style={styles.instruction}>You have {letterTimeLeft}s to choose a letter</Text>
            <TextInput
              value={letterInput}
              onChangeText={(t) => setLetterInput((t || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0,1))}
              placeholder="Enter a letter (A-Z)"
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
              Accept Letter
            </Button>
            <Button
              mode="outlined"
              onPress={() => selectLetter(gameId)}
              style={styles.letterButton}
              icon="dice-3"
            >
              Pick Random
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
          <Text style={styles.waitingText}>Waiting for {letterSelectorName || 'player'} to select a letter... {letterDeadline ? `${letterTimeLeft}s` : ''}</Text>
        )}
      </Card.Content>
    </Card>
  );

  const renderGameplay = () => (
    <View style={styles.gameplayContainer}>
      <View style={styles.header}>
        <View style={styles.roundInfo}>
          <Text style={styles.roundText}>Round {currentRound}/{totalRounds}</Text>
          <Text style={styles.letterText}>Letter: {currentLetter}</Text>
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

      <ScrollView style={styles.answersContainer}>
        {selectedCategories.map(category => (
          <Card key={category} style={styles.answerCard}>
            <Card.Content>
              <Text style={styles.categoryLabel}>{category}</Text>
              <TextInput
                value={answers[category] || ''}
                onChangeText={(text) => handleAnswerChange(category, text)}
                placeholder={`Enter ${category} starting with ${currentLetter}`}
                style={styles.answerInput}
                autoCapitalize="words"
                editable={timeLeft > 0 && !isFrozen}
              />
              {(() => { const err = getAnswerError(answers[category] || ''); return err ? (<Text style={styles.errorText}>{err}</Text>) : null; })()}
            </Card.Content>
          </Card>
        ))}
      </ScrollView>

      <Button
        mode="contained"
        onPress={handleStop}
        style={[styles.stopButton, { backgroundColor: canFinish ? '#4CAF50' : '#9E9E9E' }]}
        disabled={timeLeft === 0 || hasStoppedFirst || !canFinish || isFrozen}
      >
        STOP!
      </Button>
    </View>
  );

  const renderRoundEnd = () => (
    <Card style={styles.card}>
      <Card.Content>
        <Text style={styles.phaseTitle}>Round {currentRound} Results</Text>
        <View style={styles.scoresContainer}>
          {Array.isArray(playerScores) && playerScores.map((s, idx) => {
            const pid = (s.user && s.user._id) ? s.user._id : s.user;
            const pidStr = typeof pid === 'string' ? pid : String(pid || '');
            const name = pidStr === user.id ? 'You' : `Player ${pidStr.substring(0, 5)}`;
            return (
              <View key={pidStr || String(idx)} style={styles.scoreItem}>
                <Text style={styles.playerName}>{name}</Text>
                <Text style={styles.playerScore}>{s.score} pts</Text>
              </View>
            );
          })}
        </View>
        {currentRound < totalRounds && (
          <>
            <Text style={styles.instruction}>{`(${readyCount}/${readyTotal}) players ready...`}</Text>
            {typeof nextCountdown === 'number' && nextCountdown >= 0 && (
              <Text style={styles.instruction}>Next round in {nextCountdown}s</Text>
            )}
            <Button
              mode="contained"
              onPress={() => readyNextRound(gameId)}
              style={styles.nextButton}
            >
              Continue
            </Button>
          </>
        )}
        {currentRound >= totalRounds && !isFinished && (
          <>
            <Button
              mode="contained"
              onPress={() => setFinalConfirmed(true) || setIsFinished(true)}
              style={styles.nextButton}
            >
              Confirm Final Results
            </Button>
          </>
        )}
      </Card.Content>
    </Card>
  );

  const renderFinalResults = () => {
    const scores = Array.isArray(playerScores) ? playerScores : [];
    const max = scores.reduce((m, s) => Math.max(m, s.score || 0), 0);
    const winners = scores.filter(s => (s.score || 0) === max);
    const isDraw = winners.length > 1;
    const winnerNames = winners.map((s) => {
      const pid = (s.user && s.user._id) ? s.user._id : s.user;
      const pidStr = typeof pid === 'string' ? pid : String(pid || '');
      return pidStr === userId ? 'You' : `Player ${pidStr.substring(0,5)}`;
    });
    return (
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.phaseTitle}>Final Results</Text>
          <View style={styles.scoresContainer}>
            {scores.map((s, idx) => {
              const pid = (s.user && s.user._id) ? s.user._id : s.user;
              const pidStr = typeof pid === 'string' ? pid : String(pid || '');
              const name = pidStr === userId ? 'You' : `Player ${pidStr.substring(0, 5)}`;
              return (
                <View key={pidStr || String(idx)} style={styles.scoreItem}>
                  <Text style={styles.playerName}>{name}</Text>
                  <Text style={styles.playerScore}>{s.score} pts</Text>
                </View>
              );
            })}
          </View>
          {finalConfirmed ? (
            <>
              <Text style={styles.instruction}>
                {isDraw ? `It's a draw between ${winnerNames.join(', ')}` : `Winner: ${winnerNames[0]}`}
              </Text>
              <Text style={styles.instruction}>{`(${rematchReady}/${rematchTotal}) players selected Play Again`}</Text>
              <Button
                mode="contained"
                onPress={() => { if (!hasVotedRematch && !rematchAborted) { setHasVotedRematch(true); playAgainReady(gameId); } }}
                style={styles.nextButton}
                disabled={hasVotedRematch || rematchAborted}
                labelStyle={{ color: '#FFFFFF' }}
              >
                {rematchAborted ? 'A user left' : (typeof rematchCountdown === 'number') ? `Starting in ${rematchCountdown}s...` : hasVotedRematch ? 'Waiting for others...' : 'Play Again'}
              </Button>
              <Button
                mode="outlined"
                onPress={() => navigation.replace('Menu')}
                style={styles.nextButton}
                labelStyle={{ color: theme.colors.primary }}
              >
                Return to lobby
              </Button>
            </>
          ) : (
            <Button
              mode="contained"
              onPress={() => setFinalConfirmed(true)}
              style={styles.nextButton}
            >
              Confirm Final Results
            </Button>
          )}
        </Card.Content>
      </Card>
    );
  };

  return (
    <View style={styles.container}>
      {showStopOverlay && (
        <View style={styles.revealOverlay} pointerEvents="none">
          <Animated.View style={[styles.revealBox]}>
            <Text style={styles.stopText}>Stop!</Text>
          </Animated.View>
        </View>
      )}
      {showReveal && (
        <View style={styles.revealOverlay} pointerEvents="none">
          <Animated.View style={[styles.revealBox]}>
            <Text style={styles.revealText}>Starting in {revealTimeLeft}...</Text>
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
          <Text style={styles.validationText}>Validating answers...</Text>
        </View>
      )}
      {phase === 'round-end' && renderRoundEnd()}
      {isFinished && renderFinalResults()}
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
  categoryChip: {
    margin: 5,
  },
  confirmButton: {
    backgroundColor: theme.colors.primary,
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
  header: {
    backgroundColor: '#FFFFFF',
    padding: 20,
    elevation: 3,
  },
  roundInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
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
    fontSize: 24,
    fontWeight: 'bold',
    color: '#424242',
    marginBottom: 5,
  },
  timerBar: {
    width: '100%',
    height: 8,
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
  categoryLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: 5,
  },
  answerInput: {
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    backgroundColor: '#FFFFFF',
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
  },
  validationText: {
    fontSize: 18,
    color: '#757575',
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
});

export default GameplayScreen;
