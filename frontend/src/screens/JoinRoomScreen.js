import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, RefreshControl } from 'react-native';
import { Text, TextInput, Button, Card, List, Chip, Dialog, Portal, ActivityIndicator } from 'react-native-paper';
import { useGame } from '../contexts/GameContext';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import theme from '../theme';

const JoinRoomScreen = ({ navigation }) => {
  const [inviteCode, setInviteCode] = useState('');
  const [publicRooms, setPublicRooms] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [passwordDialog, setPasswordDialog] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [roomPassword, setRoomPassword] = useState('');
  const [filterLanguage, setFilterLanguage] = useState('en');
  const [languageMismatchVisible, setLanguageMismatchVisible] = useState(false);
  const [switchingLanguage, setSwitchingLanguage] = useState(false);
  const [pendingJoin, setPendingJoin] = useState(null);
  const { joinRoom, joinRoomByCode, getPublicRooms } = useGame();
  const { t, language, changeLanguage } = useLanguage();
  const { updateLanguage: updateUserLanguage } = useAuth() || {};

  useEffect(() => {
    loadPublicRooms();
  }, []);

  useEffect(() => {
    if (language === 'en' || language === 'es') {
      setFilterLanguage(language);
    }
  }, [language]);

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
      Alert.alert(t('common.error'), t('joinRoom.enterInviteCode'));
      return;
    }

    setLoading(true);
    const result = await joinRoomByCode(inviteCode.toUpperCase());
    setLoading(false);

    if (result.success) {
      navigation.replace('Room', { roomId: result.room.id });
    } else if (result.languageMismatch) {
      setPendingJoin({
        type: 'code',
        inviteCode: inviteCode.toUpperCase(),
        roomLanguage: result.roomLanguage
      });
      setLanguageMismatchVisible(true);
    } else if (result.needsPassword) {
      setSelectedRoom({ inviteCode: inviteCode.toUpperCase(), name: result.roomName });
      setPasswordDialog(true);
    } else {
      const msg = result.error === 'Game already in progress' ? t('joinRoom.gameAlreadyStarted') : result.error;
      Alert.alert(t('common.error'), msg);
    }
  };

  const handleJoinPublicRoom = async (room) => {
    const roomLang = room?.language || 'en';
    if (roomLang !== language) {
      setPendingJoin({
        type: 'public',
        room,
        roomLanguage: roomLang
      });
      setLanguageMismatchVisible(true);
      return;
    }

    setLoading(true);
    const result = await joinRoom(room.id);
    setLoading(false);

    if (result.success) {
      navigation.replace('Room', { roomId: room.id });
    } else if (result.languageMismatch) {
      setPendingJoin({
        type: 'public',
        room,
        roomLanguage: result.roomLanguage
      });
      setLanguageMismatchVisible(true);
    } else if (result.needsPassword) {
      setSelectedRoom(room);
      setPasswordDialog(true);
    } else {
      const msg = result.error === 'Game already in progress' ? t('joinRoom.gameAlreadyStarted') : result.error;
      Alert.alert(t('common.error'), msg);
    }
  };

  const handlePasswordSubmit = async () => {
    if (!roomPassword.trim()) {
      Alert.alert(t('common.error'), t('joinRoom.enterPassword'));
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
    } else if (result.languageMismatch) {
      setPendingJoin({
        type: selectedRoom?.inviteCode ? 'code' : 'public',
        inviteCode: selectedRoom?.inviteCode,
        room: selectedRoom?.inviteCode ? null : selectedRoom,
        roomLanguage: result.roomLanguage,
        password: roomPassword
      });
      setLanguageMismatchVisible(true);
    } else {
      const msg = result.error === 'Game already in progress' ? t('joinRoom.gameAlreadyStarted') : result.error;
      Alert.alert(t('common.error'), msg);
    }
  };

  const switchLanguageAndJoin = async () => {
    const target = pendingJoin?.roomLanguage;
    if (!target) return;

    setSwitchingLanguage(true);
    try {
      await changeLanguage(target);
      if (updateUserLanguage) {
        const res = await updateUserLanguage(target);
        if (!res?.success) {
          throw new Error(res?.error || 'Failed');
        }
      }

      // Retry join after switching language
      if (pendingJoin?.type === 'public' && pendingJoin?.room?.id) {
        setLanguageMismatchVisible(false);
        setPendingJoin(null);
        await handleJoinPublicRoom(pendingJoin.room);
      } else if (pendingJoin?.type === 'code' && pendingJoin?.inviteCode) {
        setLanguageMismatchVisible(false);
        const code = pendingJoin.inviteCode;
        const pwd = pendingJoin.password || null;
        setPendingJoin(null);

        setLoading(true);
        const result = await joinRoomByCode(code, pwd);
        setLoading(false);

        if (result.success) {
          navigation.replace('Room', { roomId: result.room.id });
        } else if (result.needsPassword) {
          setSelectedRoom({ inviteCode: code, name: result.roomName });
          setPasswordDialog(true);
        } else {
          const msg = result.error === 'Game already in progress' ? t('joinRoom.gameAlreadyStarted') : result.error;
          Alert.alert(t('common.error'), msg);
        }
      }
    } catch (e) {
      Alert.alert(t('common.error'), t('menu.languageSwitchFailed'));
    } finally {
      setSwitchingLanguage(false);
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
            <Text style={styles.sectionTitle}>{t('joinRoom.joinWithCode')}</Text>
            <View style={styles.codeInputContainer}>
              <TextInput
                label={t('joinRoom.inviteCode')}
                value={inviteCode}
                onChangeText={setInviteCode}
                style={styles.codeInput}
                mode="outlined"
                placeholder={t('joinRoom.codePlaceholder')}
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
                {t('joinRoom.join')}
              </Button>
            </View>
          </Card.Content>
        </Card>

        {/* Public Rooms */}
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('joinRoom.publicRooms')}</Text>
              <Button
                mode="outlined"
                icon="refresh"
                onPress={handleRefresh}
                loading={refreshing}
                disabled={refreshing}
                compact
                style={styles.refreshButton}
              >
                {t('joinRoom.refresh')}
              </Button>
            </View>

            <View style={styles.languageFiltersRow}>
              <Chip
                selected={filterLanguage === 'en'}
                onPress={() => setFilterLanguage('en')}
                style={[styles.languageChip, filterLanguage === 'en' ? styles.languageChipSelected : null]}
              >
                {t('joinRoom.filterEnglish')}
              </Chip>
              <Chip
                selected={filterLanguage === 'es'}
                onPress={() => setFilterLanguage('es')}
                style={[styles.languageChip, filterLanguage === 'es' ? styles.languageChipSelected : null]}
              >
                {t('joinRoom.filterSpanish')}
              </Chip>
            </View>

            {loading && publicRooms.length === 0 ? (
              <ActivityIndicator style={styles.loader} />
            ) : publicRooms.length === 0 ? (
              <Text style={styles.emptyText}>{t('joinRoom.noRooms')}</Text>
            ) : (
              <View>
                {publicRooms
                  .filter(r => (r.language || 'en') === filterLanguage)
                  .map((room) => (
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
                          {t('joinRoom.join')}
                        </Button>
                      </View>
                      <View style={styles.roomMeta}>
                        <Text style={styles.roomHost}>{t('joinRoom.host')}: {room.owner?.displayName || room.owner?.username || t('common.unknown')}</Text>
                        <Chip style={styles.playersChip} icon="account-group">
                          {room.players.length}/{room.maxPlayers} {t('joinRoom.players')}
                        </Chip>
                      </View>
                      <View style={styles.roomChipsWrap}>
                        <Chip style={styles.roundChip} icon="timer-outline">{room.rounds} {t('joinRoom.rounds')}</Chip>
                        <Chip style={[styles.statusChip, room.status === 'in_progress' ? styles.playingChip : null]}>
                          {room.status === 'in_progress' ? t('joinRoom.inGame') : t('joinRoom.waiting')}
                        </Chip>
                        {room.hasPassword && (
                          <Chip style={styles.lockChip} icon="lock">{t('joinRoom.private')}</Chip>
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
        <Dialog visible={languageMismatchVisible} onDismiss={() => {
          if (switchingLanguage) return;
          setLanguageMismatchVisible(false);
          setPendingJoin(null);
        }}>
          <Dialog.Title>{t('joinRoom.roomLanguageMismatchTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogText}>
              {t('joinRoom.roomLanguageMismatchMessage', {
                language: (pendingJoin?.roomLanguage === 'es') ? t('settings.spanish') : t('settings.english')
              })}
            </Text>
            {switchingLanguage && <ActivityIndicator style={styles.loader} />}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => {
              setLanguageMismatchVisible(false);
              setPendingJoin(null);
            }} disabled={switchingLanguage}>
              {t('common.cancel')}
            </Button>
            <Button onPress={switchLanguageAndJoin} disabled={switchingLanguage} loading={switchingLanguage}>
              {t('joinRoom.switchLanguageAndJoin')}
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={passwordDialog} onDismiss={() => setPasswordDialog(false)}>
          <Dialog.Title>{t('joinRoom.passwordRequired')}</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogText}>
              {`"${selectedRoom?.name || t('joinRoom.thisRoom')}" ${t('joinRoom.requiresPassword')}`}
            </Text>
            <TextInput
              label={t('joinRoom.password')}
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
              {t('common.cancel')}
            </Button>
            <Button onPress={handlePasswordSubmit}>
              {t('joinRoom.join')}
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
  languageFiltersRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 10,
  },
  languageChip: {
    backgroundColor: '#EEEEEE',
  },
  languageChipSelected: {
    backgroundColor: '#E3F2FD',
  },
});

export default JoinRoomScreen;
