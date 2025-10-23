import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, Clipboard } from 'react-native';
import { Text, Button, Card, List, Avatar, Chip, IconButton, TextInput } from 'react-native-paper';
import { useSocket } from '../contexts/SocketContext';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import theme from '../theme';

const RoomScreen = ({ navigation, route }) => {
  const { roomId } = route.params;
  const { user } = useAuth();
  const { socket, isAuthenticated, setPlayerReady, startGame, sendMessage, joinRoom, deleteRoom, leaveRoom: socketLeaveRoom } = useSocket();
  const { currentRoom, leaveRoom } = useGame();
  const [players, setPlayers] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [roomOwner, setRoomOwner] = useState(null);
  const [startGameCooldown, setStartGameCooldown] = useState(false);

  // Initialize players from currentRoom when component mounts
  useEffect(() => {
    if (currentRoom && currentRoom.players) {
      const ownerId = currentRoom.owner._id || currentRoom.owner;
      setRoomOwner(ownerId.toString());
      
      const playersData = currentRoom.players.map(p => ({
        id: p.user._id || p.user,
        username: p.user.username || 'Player',
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
        
        const playersData = (room.players || []).map(p => ({
          id: p.user._id || p.user,
          username: p.user.username || 'Player',
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
          username: p.user.username || 'Player',
          isReady: p.isReady,
          isOwner: (p.user._id || p.user).toString() === roomOwner
        }));
        setPlayers(playersData);
        setMessages(prev => [...prev, {
          type: 'system',
          text: `${data.username || 'A player'} joined the room`
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
          username: p.user.username || 'Player',
          isReady: p.isReady,
          isOwner: (p.user._id || p.user).toString() === currentOwnerId
        }));
        setPlayers(playersData);
        setMessages(prev => [...prev, {
          type: 'system',
          text: `${data.username} left the room`
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
          username: data.username || user?.username || 'Player',
          text: data.message
        }]);
      });

      socket.on('ownership-transferred', (data) => {
        setRoomOwner(data.newOwnerId);
        
        const playersData = data.players.map(p => ({
          id: p.user._id || p.user,
          username: p.user.username || 'Player',
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
            text: 'You are now the room owner!'
          }]);
        } else {
          setMessages(prev => [...prev, {
            type: 'system',
            text: `${data.username} is now the room owner`
          }]);
        }
      });

      socket.on('room-deleted', (data) => {
        Alert.alert(
          'Room Deleted',
          data.message || 'Host terminated the session',
          [
            {
              text: 'OK',
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

  const handleReady = () => {
    const newReadyState = !isReady;
    setIsReady(newReadyState);
    setPlayerReady(roomId, newReadyState);
  };

  const handleStartGame = () => {
    if (players.length < 2) {
      Alert.alert('Cannot Start', 'At least 2 players must be in the room');
      return;
    }
    if (players.filter(p => p.isReady).length < 2) {
      Alert.alert('Cannot Start', 'At least 2 players must be ready');
      return;
    }
    startGame(roomId);
  };

  const handleLeaveRoom = () => {
    Alert.alert(
      'Leave Room',
      'Are you sure you want to leave this room?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Leave',
          onPress: async () => {
            try { socketLeaveRoom(); } catch (e) {}
            await leaveRoom();
            navigation.navigate('Menu');
          },
          style: 'destructive'
        }
      ]
    );
  };

  const handleDeleteRoom = () => {
    Alert.alert(
      'Delete Room',
      'Are you sure you want to delete this room? All players will be kicked out.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
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
    if (messageInput.trim()) {
      sendMessage(roomId, messageInput);
      setMessageInput('');
    }
  };

  const copyInviteCode = () => {
    if (currentRoom?.inviteCode) {
      Clipboard.setString(currentRoom.inviteCode);
      Alert.alert('Copied', 'Invite code copied to clipboard');
    }
  };

  const isOwner = roomOwner === user?.id;
  const allPlayersReady = players.length >= 2 && players.every(p => p.isReady);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Room Info */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.roomHeader}>
              <View style={styles.roomInfo}>
                <Text style={styles.roomName}>{currentRoom?.name || 'Game Room'}</Text>
                <View style={styles.roomDetails}>
                  <Chip style={styles.chip}>{currentRoom?.rounds || 3} rounds</Chip>
                  <Chip style={styles.chip}>
                    {players.length}/{currentRoom?.maxPlayers || 8} players
                  </Chip>
                </View>
              </View>
              <IconButton
                icon="content-copy"
                onPress={copyInviteCode}
                style={styles.copyButton}
              />
            </View>
            <View style={styles.inviteContainer}>
              <Text style={styles.inviteLabel}>Invite Code:</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={styles.inviteCode}>{currentRoom?.inviteCode || 'XXXXXX'}</Text>
                {isOwner && (
                  <IconButton
                    icon="delete"
                    onPress={handleDeleteRoom}
                    iconColor="#F44336"
                    style={{ marginLeft: 8 }}
                  />
                )}
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Players */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Players</Text>
            <List.Section>
              {players.map((player, index) => (
                <List.Item
                  key={player.id}
                  title={player.username}
                  description={player.isOwner ? 'Room Owner' : player.isReady ? 'Ready' : 'Not Ready'}
                  left={() => (
                    <Avatar.Text
                      size={40}
                      label={player.username.substring(0, 2).toUpperCase()}
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
            <Text style={styles.sectionTitle}>Chat</Text>
            <View style={styles.chatContainer}>
              <ScrollView style={styles.messagesContainer}>
                {messages.map((msg, index) => (
                  <View key={index} style={styles.message}>
                    {msg.type === 'system' ? (
                      <Text style={styles.systemMessage}>{msg.text}</Text>
                    ) : (
                      <Text style={styles.chatMessage}>
                        <Text style={styles.chatUsername}>{msg.username}: </Text>
                        {msg.text}
                      </Text>
                    )}
                  </View>
                ))}
              </ScrollView>
              <View style={styles.chatInput}>
                <TextInput
                  value={messageInput}
                  onChangeText={setMessageInput}
                  placeholder="Type a message..."
                  style={styles.messageInput}
                  mode="outlined"
                  dense
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
          Leave Room
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
            {startGameCooldown ? 'Wait...' : 'Start Game'}
          </Button>
        ) : (
          <Button
            mode={isReady ? 'outlined' : 'contained'}
            onPress={handleReady}
            style={isReady ? styles.notReadyButton : styles.readyButton}
            icon={isReady ? 'close' : 'check'}
          >
            {isReady ? 'Not Ready' : 'Ready'}
          </Button>
        )}
      </View>
    </View>
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
    height: 200,
  },
  messagesContainer: {
    flex: 1,
    backgroundColor: '#FAFAFA',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
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
