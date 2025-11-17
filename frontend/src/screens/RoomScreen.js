import React, { useState, useEffect, useRef } from 'react';
import { View, StyleSheet, ScrollView, Alert, Clipboard, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard, BackHandler } from 'react-native';
import { Text, Button, Card, List, Avatar, Chip, IconButton, TextInput } from 'react-native-paper';
import { useSocket } from '../contexts/SocketContext';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import theme from '../theme';

const RoomScreen = ({ navigation, route }) => {
  const { roomId } = route.params;
  const { user } = useAuth();
  const { t } = useLanguage();
  const { socket, connected, isAuthenticated, setPlayerReady, startGame, sendMessage, joinRoom, deleteRoom, leaveRoom: socketLeaveRoom } = useSocket();
  const { currentRoom, leaveRoom } = useGame();
  const [players, setPlayers] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [roomOwner, setRoomOwner] = useState(null);
  const [startGameCooldown, setStartGameCooldown] = useState(false);
  const [inputFocused, setInputFocused] = useState(false);
  const inputRef = useRef(null);
  const messagesRef = useRef(null);
  const isLeavingRef = useRef(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [inviteCode, setInviteCode] = useState(null);
  const [isChatActive, setIsChatActive] = useState(false);

  // Initialize players from currentRoom when component mounts
  useEffect(() => {
    if (currentRoom && currentRoom.players) {
      const ownerId = currentRoom.owner._id || currentRoom.owner;
      setRoomOwner(ownerId.toString());
      if (currentRoom.inviteCode) setInviteCode(currentRoom.inviteCode);
      
      const playersData = currentRoom.players.map(p => ({
        id: p.user._id || p.user,
        displayName: p.user.displayName || p.user.username || t('gameplay.player'),
        isReady: p.isReady,
        isOwner: (p.user._id || p.user).toString() === ownerId.toString()
      }));
      setPlayers(playersData);
      
      // Check if current user is owner and set ready state
      if (user && ownerId.toString() === user.id) {
        setIsReady(true);
      }
    }
  }, [currentRoom, user]);

  // Join room via socket on mount and after auth
  useEffect(() => {
    if (socket && roomId && isAuthenticated) {
      joinRoom(roomId);
    }
  }, [socket, roomId, isAuthenticated]);

  useEffect(() => {
    if (socket) {
      // Socket event listeners
      socket.on('room-joined', (data) => {
        const room = data.room;
        const ownerId = room.owner._id || room.owner;
        setRoomOwner(ownerId.toString());
        if (room.inviteCode) setInviteCode(room.inviteCode);
        
        const playersData = (room.players || []).map(p => ({
          id: p.user._id || p.user,
          displayName: p.user.displayName || p.user.username || t('gameplay.player'),
          isReady: p.isReady,
          isOwner: (p.user._id || p.user).toString() === ownerId.toString()
        }));
        setPlayers(playersData);
        
        // Check if current user is owner and set ready state
        if (user && ownerId.toString() === user.id) {
          setIsReady(true);
        }
      });
      socket.on('player-joined', (data) => {
        const playersData = data.players.map(p => ({
          id: p.user._id || p.user,
          displayName: p.user.displayName || p.user.username || t('gameplay.player'),
          isReady: p.isReady,
          isOwner: (p.user._id || p.user).toString() === roomOwner
        }));
        setPlayers(playersData);
        setMessages(prev => [...prev, {
          type: 'system',
          text: `${data.displayName || data.username || 'A player'} ${t('room.playerJoined')}`
        }]);
      });

      socket.on('player-left', (data) => {
        // Update owner if ownership was transferred
        if (data.newOwnerId) {
          setRoomOwner(data.newOwnerId);
        }
        
        const currentOwnerId = data.newOwnerId || roomOwner;
        const playersData = data.players.map(p => ({
          id: p.user._id || p.user,
          displayName: p.user.displayName || p.user.username || t('gameplay.player'),
          isReady: p.isReady,
          isOwner: (p.user._id || p.user).toString() === currentOwnerId
        }));
        setPlayers(playersData);
        setMessages(prev => [...prev, {
          type: 'system',
          text: `${data.displayName || data.username} ${t('room.playerLeft')}`
        }]);
      });

      socket.on('ready-status-changed', (data) => {
        setPlayers(prev => prev.map(p => 
          p.id === data.userId ? { ...p, isReady: data.isReady } : p
        ));
      });

      socket.on('game-starting', (data) => {
        navigation.replace('Gameplay', { gameId: data.gameId });
      });

      socket.on('new-message', (data) => {
        setMessages(prev => [...prev, {
          type: 'chat',
          displayName: data.displayName || data.username || user?.displayName || user?.username || t('gameplay.player'),
          text: data.message
        }]);
      });

      socket.on('ownership-transferred', (data) => {
        setRoomOwner(data.newOwnerId);
        if (data.inviteCode) setInviteCode(data.inviteCode);
        
        const playersData = data.players.map(p => ({
          id: p.user._id || p.user,
          displayName: p.user.displayName || p.user.username || t('gameplay.player'),
          isReady: p.isReady,
          isOwner: (p.user._id || p.user).toString() === data.newOwnerId
        }));
        setPlayers(playersData);
        
        // If current user became the owner
        if (user && data.newOwnerId === user.id) {
          setIsReady(true);
          setStartGameCooldown(true);
          
          // Remove cooldown after 2 seconds
          setTimeout(() => {
            setStartGameCooldown(false);
          }, 2000);
          
          setMessages(prev => [...prev, {
            type: 'system',
            text: t('room.youAreOwner')
          }]);
        } else {
          setMessages(prev => [...prev, {
            type: 'system',
            text: `${data.displayName || data.username} ${t('room.isNowOwner')}`
          }]);
        }
      });

      socket.on('room-deleted', (data) => {
        Alert.alert(
          t('room.roomDeleted'),
          data.message || t('room.hostTerminated'),
          [
            {
              text: t('common.ok'),
              onPress: () => navigation.navigate('Menu')
            }
          ],
          { cancelable: false }
        );
      });

      return () => {
        socket.off('room-joined');
        socket.off('player-joined');
        socket.off('player-left');
        socket.off('ownership-transferred');
        socket.off('ready-status-changed');
        socket.off('game-starting');
        socket.off('new-message');
        socket.off('room-deleted');
      };
    }
  }, [socket, currentRoom, user, roomOwner]);

  // Handle hardware back button press
  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      // Show confirmation dialog
      handleLeaveRoom();
      // Return true to prevent default back behavior
      return true;
    });

    return () => backHandler.remove();
  }, [socket, connected, isAuthenticated]);

  // Intercept header back arrow to use the same confirmation flow
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      // If already confirmed leaving, allow navigation
      if (isLeavingRef.current) {
        return;
      }

      // Allow navigation to Gameplay (game starting)
      const targetRoute = e.data?.action?.payload?.name;
      if (targetRoute === 'Gameplay') {
        return;
      }

      // Prevent default behavior of leaving the screen
      e.preventDefault();
      // Use the same leave confirmation logic
      handleLeaveRoom();
    });

    return unsubscribe;
  }, [navigation, socket, connected, isAuthenticated]);

  const handleReady = () => {
    const newReadyState = !isReady;
    setIsReady(newReadyState);
    setPlayerReady(roomId, newReadyState);
  };

  const handleStartGame = () => {
    if (players.length < 2) {
      Alert.alert(t('room.cannotStart'), t('room.needTwoPlayers'));
      return;
    }
    if (players.filter(p => p.isReady).length < 2) {
      Alert.alert(t('room.cannotStart'), t('room.needTwoReady'));
      return;
    }
    startGame(roomId);
  };

  const handleLeaveRoom = () => {
    Alert.alert(
      t('room.leaveRoom'),
      t('room.leaveRoomMessage'),
      [
        { text: t('common.no'), style: 'cancel' },
        {
          text: t('common.yes'),
          onPress: async () => {
            isLeavingRef.current = true;
            try {
              if (socket && connected && isAuthenticated) {
                socketLeaveRoom();
              } else {
                await leaveRoom();
              }
            } finally {
              navigation.navigate('Menu');
            }
          },
          style: 'destructive'
        }
      ]
    );
  };

  const handleDeleteRoom = () => {
    Alert.alert(
      t('room.deleteRoom'),
      t('room.deleteRoomMessage'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('common.delete'),
          onPress: async () => {
            deleteRoom(roomId);
            // Navigation will be handled by the room-deleted socket event
          },
          style: 'destructive'
        }
      ]
    );
  };

  const handleSendMessage = () => {
    const wasFocused = inputFocused;
    if (messageInput.trim()) {
      sendMessage(roomId, messageInput);
      setMessageInput('');
      // Preserve keyboard state: if input was focused, keep focus; otherwise do nothing
      if (wasFocused) {
        setTimeout(() => {
          inputRef.current?.focus?.();
        }, 0);
      }
    }
  };

  const copyInviteCode = () => {
    if (inviteCode) {
      Clipboard.setString(inviteCode);
      Alert.alert(t('common.success'), t('room.codeCopied'));
    }
  };

  const isOwner = roomOwner === user?.id;
  const showInviteCode = inviteCode != null; // Show to all players if code exists
  const allPlayersReady = players.length >= 2 && players.every(p => p.isReady);

  const handleMessagesScroll = (e) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const paddingToBottom = 16; // threshold
    const atBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
    setIsAtBottom(atBottom);
  };

  const handleMessagesContentSizeChange = () => {
    if (isAtBottom) {
      // Auto-scroll only if user was already at the bottom
      messagesRef.current?.scrollToEnd({ animated: true });
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        scrollEnabled={!isChatActive}
        onTouchStartCapture={() => setIsChatActive(false)}
      >
        {/* Room Info */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.roomHeader}>
              <View style={styles.roomInfo}>
                <Text style={styles.roomName}>{currentRoom?.name || t('room.title')}</Text>
                <View style={styles.roomDetails}>
                  <Chip style={styles.chip}>{currentRoom?.rounds || 3} {t('joinRoom.rounds')}</Chip>
                  <Chip style={styles.chip}>
                    {players.length}/{currentRoom?.maxPlayers || 8} {t('joinRoom.players')}
                  </Chip>
                </View>
              </View>
              <View style={{ flexDirection: 'row' }}>
                {showInviteCode && (
                  <IconButton
                    icon="content-copy"
                    onPress={copyInviteCode}
                    style={styles.copyButton}
                  />
                )}
                {isOwner && (
                  <IconButton
                    icon="delete"
                    onPress={handleDeleteRoom}
                    iconColor="#F44336"
                    style={styles.copyButton}
                  />
                )}
              </View>
            </View>
            {showInviteCode && (
              <View style={styles.inviteContainer}>
                <Text style={styles.inviteLabel}>{t('room.inviteCode')}:</Text>
                <Text style={styles.inviteCode}>{inviteCode || 'XXXXXX'}</Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Players */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>{t('room.players')}</Text>
            <List.Section>
              {players.map((player, index) => (
                <List.Item
                  key={player.id}
                  title={player.displayName}
                  description={player.isOwner ? t('room.owner') : player.isReady ? t('room.ready') : t('room.notReady')}
                  left={() => (
                    <Avatar.Text
                      size={40}
                      label={player.displayName.substring(0, 2).toUpperCase()}
                      style={{ backgroundColor: theme.colors.primary }}
                    />
                  )}
                  right={() => (
                    <View style={styles.playerStatus}>
                      {player.isOwner && (
                        <IconButton icon="crown" size={20} iconColor="#FFC107" />
                      )}
                      <IconButton
                        icon={player.isReady ? 'check-circle' : 'circle-outline'}
                        size={20}
                        iconColor={player.isReady ? '#4CAF50' : '#757575'}
                      />
                    </View>
                  )}
                />
              ))}
            </List.Section>
          </Card.Content>
        </Card>

        {/* Chat */}
        <Card style={styles.card}>
          <Card.Content>
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
              <Text style={styles.sectionTitle}>{t('room.chat')}</Text>
            </TouchableWithoutFeedback>
            <View 
              style={[styles.chatContainer, isChatActive && styles.chatContainerActive]}
              onTouchStart={() => setIsChatActive(true)}
            >
                <ScrollView
                  ref={messagesRef}
                  style={styles.messagesContainer}
                  contentContainerStyle={styles.messagesContentContainer}
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled
                  onScroll={handleMessagesScroll}
                  scrollEventThrottle={16}
                  onContentSizeChange={handleMessagesContentSizeChange}
                  onScrollBeginDrag={() => setIsChatActive(true)}
                  showsVerticalScrollIndicator
                >
                  {messages.map((msg, index) => (
                    <View key={index} style={styles.message}>
                      {msg.type === 'system' ? (
                        <Text style={styles.systemMessage}>{msg.text}</Text>
                      ) : (
                        <Text style={styles.chatMessage}>
                          <Text style={styles.chatUsername}>{msg.displayName || msg.username}: </Text>
                          {msg.text}
                        </Text>
                      )}
                    </View>
                  ))}
                </ScrollView>
                <View style={styles.chatInput}>
                  <TextInput
                    ref={inputRef}
                    value={messageInput}
                    onChangeText={setMessageInput}
                    onFocus={() => setInputFocused(true)}
                    onBlur={() => setInputFocused(false)}
                    placeholder={t('room.typeMessage')}
                    style={styles.messageInput}
                    mode="outlined"
                    dense
                    blurOnSubmit={false}
                    returnKeyType="send"
                    onSubmitEditing={handleSendMessage}
                    right={
                      <TextInput.Icon
                        icon="send"
                        onPress={handleSendMessage}
                        disabled={!messageInput.trim()}
                      />
                    }
                  />
                </View>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionContainer}>
        <Button
          mode="outlined"
          onPress={handleLeaveRoom}
          style={styles.leaveButton}
          icon={'exit-to-app'}
        >
          {t('room.leaveRoom')}
        </Button>
        {isOwner ? (
          <Button
            mode="contained"
            onPress={handleStartGame}
            style={styles.startButton}
            disabled={!allPlayersReady || loading || startGameCooldown}
            loading={loading}
            icon="play"
          >
            {startGameCooldown ? t('common.waiting') : t('room.startGame')}
          </Button>
        ) : (
          <Button
            mode={isReady ? 'outlined' : 'contained'}
            onPress={handleReady}
            style={isReady ? styles.notReadyButton : styles.readyButton}
            icon={isReady ? 'close' : 'check'}
          >
            {isReady ? t('room.notReady') : t('room.ready')}
          </Button>
        )}
      </View>
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 100,
  },
  card: {
    marginBottom: 20,
    elevation: 2,
    borderRadius: 15,
  },
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  roomInfo: {
    flex: 1,
  },
  roomName: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
    marginBottom: 10,
  },
  roomDetails: {
    flexDirection: 'row',
  },
  chip: {
    marginRight: 10,
    backgroundColor: '#E8F5E9',
  },
  copyButton: {
    margin: 0,
  },
  inviteContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 15,
    padding: 10,
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
  },
  inviteLabel: {
    fontSize: 14,
    color: '#757575',
    marginRight: 10,
  },
  inviteCode: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.primary,
    letterSpacing: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: 15,
  },
  playerStatus: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  chatContainer: {
    height: 260,
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 10,
  },
  chatContainerActive: {
    borderWidth: 2,
    borderColor: '#FFF9C4',
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    marginBottom: 10,
  },
  messagesContentContainer: {
    padding: 10,
    paddingBottom: 20,
  },
  message: {
    marginBottom: 5,
  },
  systemMessage: {
    fontSize: 12,
    color: '#757575',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  chatMessage: {
    fontSize: 14,
    color: '#424242',
  },
  chatUsername: {
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  chatInput: {
    marginTop: 5,
  },
  messageInput: {
    backgroundColor: '#FFFFFF',
  },
  actionContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#FFFFFF',
    elevation: 10,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  leaveButton: {
    flex: 1,
    marginRight: 10,
    borderColor: '#F44336',
  },
  readyButton: {
    flex: 1,
    backgroundColor: theme.colors.primary,
  },
  notReadyButton: {
    flex: 1,
    borderColor: '#F44336',
  },
  startButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
  },
});

export default RoomScreen;
