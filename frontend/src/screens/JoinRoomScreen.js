import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, RefreshControl } from 'react-native';
import { Text, TextInput, Button, Card, List, Chip, Dialog, Portal, ActivityIndicator } from 'react-native-paper';
import { useGame } from '../contexts/GameContext';
import theme from '../theme';

const JoinRoomScreen = ({ navigation }) => {
  const [inviteCode, setInviteCode] = useState('');
  const [publicRooms, setPublicRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [passwordDialog, setPasswordDialog] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [roomPassword, setRoomPassword] = useState('');
  const { joinRoom, joinRoomByCode, getPublicRooms } = useGame();

  useEffect(() => {
    loadPublicRooms();
  }, []);

  const loadPublicRooms = async () => {
    setLoading(true);
    const result = await getPublicRooms();
    if (result.success) {
      setPublicRooms(result.rooms);
    }
    setLoading(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPublicRooms();
    setRefreshing(false);
  };

  const handleJoinByCode = async () => {
    if (!inviteCode.trim()) {
      Alert.alert('Error', 'Please enter an invite code');
      return;
    }

    setLoading(true);
    const result = await joinRoomByCode(inviteCode.toUpperCase());
    setLoading(false);

    if (result.success) {
      navigation.replace('Room', { roomId: result.room.id });
    } else if (result.needsPassword) {
      setSelectedRoom({ inviteCode: inviteCode.toUpperCase(), name: result.roomName });
      setPasswordDialog(true);
    } else {
      Alert.alert('Error', result.error);
    }
  };

  const handleJoinPublicRoom = async (room) => {
    setLoading(true);
    const result = await joinRoom(room.id);
    setLoading(false);

    if (result.success) {
      navigation.replace('Room', { roomId: room.id });
    } else if (result.needsPassword) {
      setSelectedRoom(room);
      setPasswordDialog(true);
    } else {
      Alert.alert('Error', result.error);
    }
  };

  const handlePasswordSubmit = async () => {
    if (!roomPassword.trim()) {
      Alert.alert('Error', 'Please enter the room password');
      return;
    }

    setPasswordDialog(false);
    setLoading(true);

    let result;
    if (selectedRoom.inviteCode) {
      result = await joinRoomByCode(selectedRoom.inviteCode, roomPassword);
    } else {
      result = await joinRoom(selectedRoom.id, roomPassword);
    }

    setLoading(false);
    setRoomPassword('');
    setSelectedRoom(null);

    if (result.success) {
      navigation.replace('Room', { roomId: result.room.id });
    } else {
      Alert.alert('Error', result.error);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView 
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
          />
        }
      >
        {/* Join by Code */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Join with Invite Code</Text>
            <View style={styles.codeInputContainer}>
              <TextInput
                label="Invite Code"
                value={inviteCode}
                onChangeText={setInviteCode}
                style={styles.codeInput}
                mode="outlined"
                placeholder="Enter 6-digit code"
                maxLength={6}
                autoCapitalize="characters"
                left={<TextInput.Icon icon="key" />}
              />
              <Button
                mode="contained"
                onPress={handleJoinByCode}
                style={styles.joinButton}
                loading={loading}
                disabled={loading || inviteCode.length !== 6}
              >
                Join
              </Button>
            </View>
          </Card.Content>
        </Card>

        {/* Public Rooms */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Public Rooms</Text>
              <Button
                mode="outlined"
                icon="refresh"
                onPress={handleRefresh}
                loading={refreshing}
                disabled={refreshing}
                compact
                style={styles.refreshButton}
              >
                Refresh
              </Button>
            </View>
            {loading && publicRooms.length === 0 ? (
              <ActivityIndicator style={styles.loader} />
            ) : publicRooms.length === 0 ? (
              <Text style={styles.emptyText}>No public rooms available</Text>
            ) : (
              <View>
                {publicRooms.map((room) => (
                  <Card key={room.id} style={styles.roomCard}>
                    <View style={styles.roomContainer}>
                      <View style={styles.roomHeader}>
                        <Text style={styles.roomTitle}>{room.name}</Text>
                        <Button
                          mode="outlined"
                          onPress={() => handleJoinPublicRoom(room)}
                          disabled={room.status !== 'waiting' || loading}
                          style={styles.roomJoinButton}
                        >
                          Join
                        </Button>
                      </View>
                      <View style={styles.roomMeta}>
                        <Text style={styles.roomHost}>Host: {room.owner?.displayName || room.owner?.username || 'Unknown'}</Text>
                        <Chip style={styles.playersChip} icon="account-group">
                          {room.players.length}/{room.maxPlayers} players
                        </Chip>
                      </View>
                      <View style={styles.roomChipsWrap}>
                        <Chip style={styles.roundChip} icon="timer-outline">{room.rounds} rounds</Chip>
                        <Chip style={[styles.statusChip, room.status === 'in_progress' ? styles.playingChip : null]}>
                          {room.status === 'in_progress' ? 'In Game' : 'Waiting'}
                        </Chip>
                        {room.hasPassword && (
                          <Chip style={styles.lockChip} icon="lock">Private</Chip>
                        )}
                      </View>
                    </View>
                  </Card>
                ))}
              </View>
            )}
          </Card.Content>
        </Card>
      </ScrollView>

      {/* Password Dialog */}
      <Portal>
        <Dialog visible={passwordDialog} onDismiss={() => setPasswordDialog(false)}>
          <Dialog.Title>Room Password Required</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogText}>
              {selectedRoom?.name ? `"${selectedRoom.name}"` : 'This room'} requires a password
            </Text>
            <TextInput
              label="Password"
              value={roomPassword}
              onChangeText={setRoomPassword}
              style={styles.passwordInput}
              mode="outlined"
              secureTextEntry
              autoFocus
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => {
              setPasswordDialog(false);
              setRoomPassword('');
              setSelectedRoom(null);
            }}>
              Cancel
            </Button>
            <Button onPress={handlePasswordSubmit}>
              Join
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
    paddingBottom: 30,
  },
  card: {
    marginBottom: 20,
    elevation: 2,
    borderRadius: 15,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  refreshButton: {
    borderColor: theme.colors.primary,
  },
  codeInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  codeInput: {
    flex: 1,
    marginRight: 10,
    backgroundColor: '#FFFFFF',
  },
  joinButton: {
    backgroundColor: theme.colors.primary,
  },
  loader: {
    marginVertical: 20,
  },
  emptyText: {
    textAlign: 'center',
    color: '#757575',
    marginVertical: 20,
  },
  roomCard: {
    marginBottom: 10,
    elevation: 1,
  },
  roomItem: {
    paddingVertical: 5,
  },
  roomRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roomChips: {
    flexDirection: 'row',
    marginRight: 10,
  },
  roundChip: {
    marginRight: 5,
    height: 28,
    backgroundColor: '#E3F2FD',
  },
  statusChip: {
    height: 28,
    backgroundColor: '#E8F5E9',
  },
  playingChip: {
    backgroundColor: '#FFF3E0',
  },
  roomJoinButton: {
    borderColor: theme.colors.primary,
  },
  dialogText: {
    marginBottom: 15,
    color: '#424242',
  },
  passwordInput: {
    backgroundColor: '#FFFFFF',
  },
  // New responsive room list styles
  roomContainer: {
    padding: 12,
  },
  roomHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  roomTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    flexWrap: 'wrap',
    color: '#212121',
    marginRight: 8,
  },
  roomMeta: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  roomHost: {
    color: '#616161',
    fontSize: 13,
    flexShrink: 1,
  },
  playersChip: {
    height: 26,
    backgroundColor: '#F1F8E9',
  },
  roomChipsWrap: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  lockChip: {
    backgroundColor: '#FFEBEE',
  },
});

export default JoinRoomScreen;
