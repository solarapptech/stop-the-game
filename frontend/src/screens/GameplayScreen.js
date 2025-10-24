import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, TextInput, Alert, Animated } from 'react-native';
import { Text, Button, Card, IconButton, Chip, ProgressBar } from 'react-native-paper';
import ConfettiCannon from 'react-native-confetti-cannon';
import { useSocket } from '../contexts/SocketContext';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import theme from '../theme';

const GameplayScreen = ({ navigation, route }) => {
  const { gameId } = route.params;
  const { user } = useAuth();
  const { socket, joinGame, selectCategory, selectLetter, stopRound, confirmCategories } = useSocket();
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
  const [selectTimeLeft, setSelectTimeLeft] = useState(12);
  const [roundResults, setRoundResults] = useState(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [playerScores, setPlayerScores] = useState({});
  const [currentRound, setCurrentRound] = useState(1);
  const [totalRounds, setTotalRounds] = useState(3);
  const [isPlayerTurn, setIsPlayerTurn] = useState(false);
  const [hasStoppedFirst, setHasStoppedFirst] = useState(false);
  
  const timerRef = useRef(null);
  const selectTimerRef = useRef(null);
  const confettiRef = useRef(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadGameState();
    setupSocketListeners();
    if (joinGame && gameId) joinGame(gameId);
    
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (selectTimerRef.current) clearInterval(selectTimerRef.current);
    };
  }, []);

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
  };

  const setupSocketListeners = () => {
    if (socket) {
      socket.on('category-selection-started', (data) => {
        setPhase('category-selection');
        if (Array.isArray(data.categories)) setSelectedCategories(data.categories);
        if (data.deadline) startSelectionTimer(new Date(data.deadline));
      });

      socket.on('category-selected', (data) => {
        if (Array.isArray(data.categories)) setSelectedCategories(data.categories);
      });

      socket.on('categories-confirmed', (data) => {
        if (selectTimerRef.current) clearInterval(selectTimerRef.current);
        if (Array.isArray(data.categories)) setSelectedCategories(data.categories);
        setPhase('letter-selection');
        setIsPlayerTurn(data.currentPlayer === user.id);
      });

      socket.on('letter-selected', (data) => {
        if (data.letter) setCurrentLetter(data.letter);
        setPhase('playing');
        startTimer();
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
    selectCategory(gameId, category);
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
      setPhase('category-selection');
      setHasStoppedFirst(false);
    }
  };

  const renderCategorySelection = () => (
    <Card style={styles.card}>
      <Card.Content>
        <Text style={styles.phaseTitle}>Select Categories</Text>
        <Text style={styles.instruction}>Pick 6-8 categories. Time left: {selectTimeLeft}s</Text>
        <View style={styles.categoriesGrid}>
          {AVAILABLE_CATEGORIES.map(category => (
            <Chip
              key={category}
              selected={selectedCategories.includes(category)}
              disabled={selectedCategories.includes(category) || selectedCategories.length >= 8 || selectTimeLeft <= 0}
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
          onPress={() => confirmCategories(gameId)}
          disabled={selectedCategories.length < 6}
          style={styles.confirmButton}
        >
          Confirm ({selectedCategories.length}/6-8)
        </Button>
        {selectTimeLeft <= 0 && (
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
          <>
            <Text style={styles.instruction}>Select a random letter for this round</Text>
            <Button
              mode="contained"
              onPress={handleLetterSelect}
              style={styles.letterButton}
              icon="dice-3"
            >
              Select Random Letter
            </Button>
          </>
        ) : (
          <Text style={styles.waitingText}>Waiting for player to select letter...</Text>
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
  gameplayContainer: {
    flex: 1,
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
