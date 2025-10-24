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
  const { socket, joinGame, selectCategory, selectLetter, stopRound, confirmCategories, categoryPhaseReady } = useSocket();
  const { 
    gameState, 
    categories, 
    currentLetter, 
    submitAnswers, 
    validateAnswers,
    nextRound,
    getGameState 
  } = useGame();
  
  const [phase, setPhase] = useState('category-selection'); // category-selection, letter-selection, playing, validation, round-end
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [answers, setAnswers] = useState({});
  const [timeLeft, setTimeLeft] = useState(60);
  const [selectTimeLeft, setSelectTimeLeft] = useState(60);
  const [selectionDeadline, setSelectionDeadline] = useState(null);
  const [roundResults, setRoundResults] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [playerScores, setPlayerScores] = useState({});
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(3);
  const [isPlayerTurn, setIsPlayerTurn] = useState(false);
  const [hasStoppedFirst, setHasStoppedFirst] = useState(false);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const [hasConfirmed, setHasConfirmed] = useState(false);
  const [letterInput, setLetterInput] = useState('');
  const [letterDeadline, setLetterDeadline] = useState(null);
  const [letterTimeLeft, setLetterTimeLeft] = useState(20);
  const [letterSelectorName, setLetterSelectorName] = useState('');
  const [letterSelectorId, setLetterSelectorId] = useState(null);
  const [showReveal, setShowReveal] = useState(false);
  const [revealTimeLeft, setRevealTimeLeft] = useState(3);
  
  const timerRef = useRef(null);
  const selectTimerRef = useRef(null);
  const announcedReadyRef = useRef(false);
  const letterTimerRef = useRef(null);
  const revealTimerRef = useRef(null);
  const confettiRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadGameState();
    setupSocketListeners();
    if (joinGame && gameId) joinGame(gameId);
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (selectTimerRef.current) clearInterval(selectTimerRef.current);
      if (letterTimerRef.current) clearInterval(letterTimerRef.current);
      if (revealTimerRef.current) clearInterval(revealTimerRef.current);
    };
  }, []);

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
        setIsPlayerTurn(data.currentPlayer === user.id);
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
          setIsPlayerTurn(data.selectorId === user.id);
        }
        if (data.selectorName) setLetterSelectorName(data.selectorName);
        if (data.deadline) startLetterTimer(new Date(data.deadline));
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

      socket.on('player-stopped', (data) => {
        if (data.playerId !== user.id) {
          Alert.alert('Hurry!', `${data.username} stopped the round!`);
          setTimeLeft(10); // Give 10 seconds to finish
        }
      });

      socket.on('round-ended', async (data) => {
        if (timerRef.current) clearInterval(timerRef.current);
        setPhase('validation');
        await handleValidation();
      });

      socket.on('round-results', (data) => {
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

  const handleStop = async () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setHasStoppedFirst(true);
    stopRound(gameId);
    await submitAnswers(gameId, answers, true);
  };

  const handleTimeUp = async () => {
    await submitAnswers(gameId, answers, false);
  };

  const handleValidation = async () => {
    const result = await validateAnswers(gameId);
    if (result.success) {
      setRoundResults(result.roundResults);
      setPlayerScores(result.standings);
      setPhase('round-end');
    }
  };

  const handleNextRound = async () => {
    const result = await nextRound(gameId);
    if (result.finished) {
      // Game finished
      setShowConfetti(true);
    } else {
      // Reset for next round
      setAnswers({});
      setSelectedCategories([]);
      setCurrentRound(result.currentRound);
      setPhase('letter-selection');
      setHasStoppedFirst(false);
      announcedReadyRef.current = false;
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
        {categories.map(category => (
          <Card key={category} style={styles.answerCard}>
            <Card.Content>
              <Text style={styles.categoryLabel}>{category}</Text>
              <TextInput
                value={answers[category] || ''}
                onChangeText={(text) => handleAnswerChange(category, text)}
                placeholder={`Enter ${category} starting with ${currentLetter}`}
                style={styles.answerInput}
                autoCapitalize="words"
                editable={timeLeft > 0}
              />
            </Card.Content>
          </Card>
        ))}
      </ScrollView>

      <Button
        mode="contained"
        onPress={handleStop}
        style={styles.stopButton}
        disabled={timeLeft === 0 || hasStoppedFirst}
        icon="hand-right"
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
          {Object.entries(playerScores).map(([playerId, score]) => (
            <View key={playerId} style={styles.scoreItem}>
              <Text style={styles.playerName}>
                {playerId === user.id ? 'You' : `Player ${playerId.substring(0, 5)}`}
              </Text>
              <Text style={styles.playerScore}>{score} pts</Text>
            </View>
          ))}
        </View>
        {currentRound < totalRounds && (
          <Button
            mode="contained"
            onPress={handleNextRound}
            style={styles.nextButton}
          >
            Next Round
          </Button>
        )}
      </Card.Content>
    </Card>
  );

  return (
    <View style={styles.container}>
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
