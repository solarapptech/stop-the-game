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
  const { socket, setPlayerReady, startGame, sendMessage } = useSocket();
  const { currentRoom, leaveRoom, getRoom, deleteRoom } = useGame();
  const [players, setPlayers] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // fetch current room state when screen mounts
    (async () => {
      const r = await getRoom(roomId);
      if (r.success && r.room) {
  setPlayers(normalizePlayers(r.room.players || []));
  setMessages(r.room.messages || []);
      }
    })();
    let joined = false;
    if (socket) {
      // Ask server for current room state by joining the room namespace
      socket.emit('join-room', roomId);

      // When the server confirms room joined it will send 'room-joined' with full room
      socket.on('room-joined', (data) => {
        if (data.room) {
          setPlayers(normalizePlayers(data.room.players || []));
          setMessages(data.room.messages || []);
        }
        joined = true;
      });

      // Player joined/left
      socket.on('player-joined', (data) => {
        // backend sends the updated players array
        if (data.players) setPlayers(normalizePlayers(data.players));
        if (data.username) {
          setMessages(prev => [...prev, { type: 'system', text: `${data.username} joined the room` }]);
        }
      });

      socket.on('player-left', (data) => {
        if (data.players) setPlayers(normalizePlayers(data.players));
        if (data.username) {
          setMessages(prev => [...prev, { type: 'system', text: `${data.username} left the room` }]);
        }
      });

      socket.on('ready-status-changed', async (data) => {
        // backend doesn't include full players array here — fetch updated room
        const r = await getRoom(roomId);
        if (r.success && r.room) setPlayers(normalizePlayers(r.room.players || []));
      });

      socket.on('game-starting', (data) => {
        navigation.replace('Gameplay', { gameId: data.gameId });
      });

      socket.on('new-message', async (data) => {
        // backend emits 'new-message' with userId/message
        const found = players.find(p => p.id === data.userId);
        if (found) {
          setMessages(prev => [...prev, { type: 'chat', username: found.username, text: data.message }]);
        } else {
          // fallback: refresh room (authoritative) and set messages to avoid duplicates
          const r = await getRoom(roomId);
          if (r.success && r.room) {
            setPlayers(normalizePlayers(r.room.players || []));
            setMessages(r.room.messages || []);
          } else {
            setMessages(prev => [...prev, { type: 'chat', username: 'Player', text: data.message }]);
          }
        }
      });

      socket.on('room-updated', (data) => {
        if (data.room) {
          setPlayers(normalizePlayers(data.room.players || []));
        }
      });

      return () => {
        socket.off('room-joined');
        socket.off('player-joined');
        socket.off('player-left');
        socket.off('ready-status-changed');
        socket.off('game-starting');
        socket.off('new-message');
        socket.off('room-updated');
        // leave the socket room
        if (socket && joined) socket.emit('leave-room');
      };
    }
  }, [socket]);

  // handle navigation back (hardware or header back)
  useEffect(() => {
    const beforeRemove = navigation.addListener('beforeRemove', async (e) => {
      // prevent default and perform leave/delete
      e.preventDefault();

      if (isOwner && currentRoom?.id) {
        await deleteRoom(currentRoom.id);
      } else {
        await leaveRoom();
      }

      // allow navigation to proceed
      navigation.dispatch(e.data.action);
    });

    return () => {
      beforeRemove && beforeRemove();
    };
  }, [navigation, isOwner, currentRoom]);

  // helper to normalize player objects coming from different sources
  const normalizePlayers = (incoming = []) => {
    return incoming.map((p) => {
      // possible shapes: { id, username, isReady, isOwner } or { user: { _id, username }, isReady, isOwner }
      if (!p) return null;
      if (p.user) {
        return {
          id: p.user._id || p.user.id,
          username: p.user.username || p.user.name,
          isReady: p.isReady || false,
          isOwner: p.isOwner || false
        };
      }
      return {
        id: p.id || p._id || p.userId,
        username: p.username || p.name || 'Player',
        isReady: p.isReady || false,
        isOwner: p.isOwner || false
      };
    }).filter(Boolean);
  };

  const handleReady = () => {
    const newReadyState = !isReady;
    setIsReady(newReadyState);
    setPlayerReady(roomId, newReadyState);
  };

  const handleStartGame = () => {
    if (!atLeastOneOtherReady) {
      Alert.alert('Cannot Start', 'At least one other player must be ready');
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
            // if owner, delete room from server
            if (isOwner && currentRoom?.id) {
              await deleteRoom(currentRoom.id);
            } else {
              await leaveRoom();
            }
            navigation.goBack();
          },
          style: 'destructive'
        }
      ]
    );
  };

  const handleSendMessage = () => {
    if (messageInput.trim()) {
  // send to server; server will emit 'new-message' back to all clients
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

  const isOwner = currentRoom && (currentRoom.owner === user?.id || currentRoom.owner === user?._id);
  // At least one non-owner player ready
  const otherPlayers = players.filter(p => !p.isOwner && p.id !== (user?.id || user?._id));
  const atLeastOneOtherReady = otherPlayers.some(p => p.isReady);

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
              <Text style={styles.inviteCode}>{currentRoom?.inviteCode || 'XXXXXX'}</Text>
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
          icon="exit-to-app"
        >
          Leave Room
        </Button>
        {isOwner ? (
          <Button
            mode="contained"
            onPress={handleStartGame}
            style={styles.startButton}
            disabled={!atLeastOneOtherReady || loading}
            loading={loading}
            icon="play"
          >
            Start Game
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
