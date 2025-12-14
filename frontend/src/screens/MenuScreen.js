import React, { useEffect, useState, useLayoutEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Text, Button, Avatar, IconButton, ActivityIndicator, TextInput, Portal, Dialog } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import axios from 'axios';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useLanguage } from '../contexts/LanguageContext';
import theme from '../theme';

const MenuScreen = ({ navigation }) => {
  const { user, logout, updateDisplayName, refreshUser, statsDirty, token } = useAuth();
  const { socket, connected, isAuthenticated, joinRoom, joinGame } = useSocket();
  const { t } = useLanguage();
  const [stats, setStats] = useState({
    winPoints: user?.winPoints || 0,
    matchesPlayed: user?.matchesPlayed || 0,
    friends: user?.friends?.length || 0,
  });
  const [statsRefreshing, setStatsRefreshing] = useState(false);
  const [quickPlayVisible, setQuickPlayVisible] = useState(false);
  const [matchmakingStatus, setMatchmakingStatus] = useState('searching'); // 'searching' | 'found'
  const [editNameVisible, setEditNameVisible] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(user?.displayName || user?.username || '');
  const [savingName, setSavingName] = useState(false);
  
  // Reconnect state
  const [hasActiveGame, setHasActiveGame] = useState(false);
  const [activeGameData, setActiveGameData] = useState(null);
  const [reconnectVisible, setReconnectVisible] = useState(false);
  const [reconnectStatus, setReconnectStatus] = useState('reconnecting'); // 'reconnecting' | 'joining'

  useLayoutEffect(() => {
    const crownColor = user?.isSubscribed ? '#FFC107' : '#BDBDBD';
    navigation.setOptions({
      headerTitle: 'Stop! The Game',
      headerTitleStyle: {
        marginTop: 12,
      },
      headerRightContainerStyle: {
        marginTop: 12,
      },
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
          <IconButton
            icon="crown"
            size={22}
            onPress={() => navigation.navigate('Payment')}
            iconColor={crownColor}
            style={{ margin: 0 }}
          />
          <IconButton
            icon="trophy"
            size={22}
            onPress={() => navigation.navigate('Leaderboard')}
            iconColor="#FFFFFF"
            style={{ marginLeft: 4 }}
          />
          <IconButton
            icon="cog"
            size={22}
            onPress={() => navigation.navigate('Settings')}
            iconColor="#FFFFFF"
            style={{ marginLeft: 4, marginRight: 0 }}
          />
        </View>
      ),
    });
  }, [navigation, user?.isSubscribed]);

  // Update stats when user changes
  useEffect(() => {
    if (user) {
      setStats({
        winPoints: user.winPoints || 0,
        matchesPlayed: user.matchesPlayed || 0,
        friends: user.friends?.length || 0,
      });
    }
  }, [user]);

  // Refresh user stats when screen comes into focus, but only if stats were marked dirty
  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      const timer = setTimeout(async () => {
        try {
          if (statsDirty) {
            const result = await refreshUser({ force: true });
            if (!cancelled) {
              if (result?.success) {
                console.log('[MenuScreen] User stats refreshed (dirty)');
              } else {
                console.log('[MenuScreen] Failed to refresh dirty stats:', result?.error || 'unknown');
              }
            }
          } else {
            console.log('[MenuScreen] Skipping refresh (stats not dirty)');
          }
        } catch (error) {
          if (!cancelled) console.error('[MenuScreen] Failed to refresh user stats:', error);
        }
      }, 300);
      return () => { cancelled = true; clearTimeout(timer); };
    }, [refreshUser, statsDirty])
  );

  // Check for active game to reconnect on screen focus
  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      const checkActiveGame = async () => {
        if (!token) return;
        try {
          const response = await axios.get('game/reconnect/check');
          const data = response.data;
          if (!cancelled) {
            if (data.hasActiveGame) {
              console.log('[MenuScreen] Found active game to reconnect:', data);
              setHasActiveGame(true);
              setActiveGameData(data);
            } else {
              setHasActiveGame(false);
              setActiveGameData(null);
            }
          }
        } catch (error) {
          console.error('[MenuScreen] Error checking for active game:', error);
          if (!cancelled) {
            setHasActiveGame(false);
            setActiveGameData(null);
          }
        }
      };
      checkActiveGame();
      return () => { cancelled = true; };
    }, [token])
  );

  const handleManualStatsRefresh = async () => {
    try {
      setStatsRefreshing(true);
      const result = await refreshUser({ force: true });
      if (!(result?.success)) {
        console.log('[MenuScreen] Manual stats refresh failed:', result?.error || 'unknown');
      }
    } catch (e) {
      console.error('[MenuScreen] Manual stats refresh error', e);
    } finally {
      setStatsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!socket) return;

    const handleQuickPlayMatched = (data) => {
      setMatchmakingStatus('found');
      setTimeout(() => {
        setQuickPlayVisible(false);
        setMatchmakingStatus('searching');
        if (data.roomId) {
          navigation.navigate('Room', { roomId: data.roomId });
        }
      }, 2000);
    };

    const handleQuickPlayError = (data) => {
      setQuickPlayVisible(false);
      setMatchmakingStatus('searching');
      const message = data?.message || t('menu.quickPlayError');
      if (message === 'Not authenticated') {
        Alert.alert(
          t('common.error'),
          message,
          [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('auth.login'),
              onPress: async () => {
                try {
                  await logout();
                } finally {
                  navigation.replace('Login');
                }
              },
            },
          ]
        );
        return;
      }

      Alert.alert(t('common.error'), message);
    };

    socket.on('quickplay-matched', handleQuickPlayMatched);
    socket.on('quickplay-error', handleQuickPlayError);

    return () => {
      socket.off('quickplay-matched', handleQuickPlayMatched);
      socket.off('quickplay-error', handleQuickPlayError);
    };
  }, [socket, navigation, t, logout]);

  const handleQuickPlay = () => {
    if (!connected) {
      Alert.alert(t('common.error'), t('menu.notConnected'));
      return;
    }
    setQuickPlayVisible(true);
    setMatchmakingStatus('searching');
    if (socket) {
      socket.emit('quickplay-join');
    }
  };

  const handleCancelQuickPlay = () => {
    if (socket) {
      socket.emit('quickplay-leave');
    }
    setQuickPlayVisible(false);
    setMatchmakingStatus('searching');
  };

  const handleReconnect = async () => {
    if (!activeGameData || !connected) {
      Alert.alert(t('common.error'), t('menu.notConnected'));
      return;
    }

    setReconnectVisible(true);
    setReconnectStatus('reconnecting');

    try {
      // Verify game still exists
      const response = await axios.get('game/reconnect/check');
      const data = response.data;

      if (!data.hasActiveGame) {
        setHasActiveGame(false);
        setActiveGameData(null);
        setReconnectStatus('gameEnded');
        setTimeout(() => {
          setReconnectVisible(false);
          setReconnectStatus('reconnecting');
        }, 1000);
        return;
      }

      // Game exists, show "Joining..." status
      setReconnectStatus('joining');

      // Wait 1 second to show the "Joining..." state
      setTimeout(() => {
        setReconnectVisible(false);
        setReconnectStatus('reconnecting');

        try {
          if (typeof joinRoom === 'function') joinRoom(data.roomId);
          if (typeof joinGame === 'function') joinGame(data.gameId);
        } catch (e) {}

        // Navigate to gameplay
        navigation.navigate('Gameplay', { 
          gameId: data.gameId,
          roomId: data.roomId 
        });
      }, 1000);
    } catch (error) {
      console.error('[MenuScreen] Reconnect error:', error);
      setReconnectVisible(false);
      setReconnectStatus('reconnecting');
      Alert.alert(t('common.error'), t('menu.reconnectFailed'));
    }
  };

  const handleCancelReconnect = () => {
    setReconnectVisible(false);
    setReconnectStatus('reconnecting');
  };

  const handleLogout = () => {
    Alert.alert(
      t('menu.logout'),
      t('menu.logoutConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { 
          text: t('menu.logout'), 
          onPress: async () => {
            await logout();
            navigation.replace('Login');
          },
          style: 'destructive'
        }
      ]
    );
  };

  return (
    <LinearGradient
      colors={['#4CAF50', '#45a049']}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.userInfo}>
            <Avatar.Text 
              size={52} 
              label={user?.username?.substring(0, 2).toUpperCase() || 'US'} 
              style={styles.avatar}
            />
            <View style={styles.userDetails}>
              <View style={styles.usernameRow}>
                <Text style={styles.username}>{user?.displayName || user?.username || t('gameplay.player')}</Text>
                <IconButton
                  icon="pencil"
                  size={16}
                  onPress={() => {
                    setNewDisplayName(user?.displayName || user?.username || '');
                    setEditNameVisible(true);
                  }}
                  style={styles.editIcon}
                  iconColor={theme.colors.primary}
                />
              </View>
              <View style={styles.connectionStatus}>
                <View style={[styles.statusDot, { backgroundColor: connected ? '#4CAF50' : '#F44336' }]} />
                <Text style={styles.statusText}>
                  {connected ? t('menu.connected') : t('menu.disconnected')}
                </Text>
              </View>
            </View>
            <IconButton
              icon="logout"
              size={24}
              onPress={handleLogout}
              style={styles.logoutButton}
              iconColor="#FFFFFF"
            />
          </View>

          {/* Stats */}
          <View style={styles.statsContainer}>
            <IconButton
              icon={statsRefreshing ? 'reload' : 'refresh'}
              size={18}
              onPress={handleManualStatsRefresh}
              disabled={statsRefreshing}
              style={styles.refreshIcon}
              iconColor={theme.colors.primary}
            />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.winPoints}</Text>
              <Text style={styles.statLabel}>{t('menu.points')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.matchesPlayed}</Text>
              <Text style={styles.statLabel}>{t('menu.games')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.friends}</Text>
              <Text style={styles.statLabel}>{t('menu.friends')}</Text>
            </View>
          </View>

          {/* Quick Play Button */}
          <Button
            mode="contained"
            onPress={handleQuickPlay}
            style={styles.quickPlayButton}
            contentStyle={styles.quickPlayContent}
            icon="play-circle"
          >
            {t('menu.quickPlay')}
          </Button>
        </View>

        {/* Primary Menu Actions */}
        <View style={styles.menuContainer}>
          <View style={styles.primaryActionsGrid}>
            <TouchableOpacity
              onPress={() => navigation.navigate('CreateRoom')}
              activeOpacity={0.85}
              style={[styles.primaryActionCard, hasActiveGame ? styles.primaryActionCardThird : styles.primaryActionCardHalf, { marginRight: 8 }]}
            >
              <Avatar.Icon
                size={48}
                icon="plus-circle"
                style={[styles.primaryActionIcon, { backgroundColor: '#4CAF50' }]}
              />
              <Text style={styles.primaryActionTitle}>{t('menu.createRoom')}</Text>
              <Text style={styles.primaryActionSubtitle}>{t('menu.createRoomDesc')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => navigation.navigate('JoinRoom')}
              activeOpacity={0.85}
              style={[styles.primaryActionCard, hasActiveGame ? styles.primaryActionCardThird : styles.primaryActionCardHalf, { marginLeft: 8, marginRight: hasActiveGame ? 8 : 0 }]}
            >
              <Avatar.Icon
                size={48}
                icon="login"
                style={[styles.primaryActionIcon, { backgroundColor: '#2196F3' }]}
              />
              <Text style={styles.primaryActionTitle}>{t('menu.joinRoom')}</Text>
              <Text style={styles.primaryActionSubtitle}>{t('menu.joinRoomDesc')}</Text>
            </TouchableOpacity>

            {/* Reconnect Button - Only shown when there's an active game */}
            {hasActiveGame && (
              <TouchableOpacity
                onPress={handleReconnect}
                activeOpacity={0.85}
                style={[styles.primaryActionCard, styles.primaryActionCardThird, { marginLeft: 8 }]}
              >
                <Avatar.Icon
                  size={48}
                  icon="connection"
                  style={[styles.primaryActionIcon, { backgroundColor: '#FF9800' }]}
                />
                <Text style={styles.primaryActionTitle}>{t('menu.reconnect')}</Text>
                <Text style={styles.primaryActionSubtitle}>{t('menu.reconnectDesc')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Remove Ads helper text */}
        {!user?.isSubscribed && (
          <TouchableOpacity
            style={styles.removeAdsLink}
            onPress={() => navigation.navigate('Payment')}
          >
            <Text style={styles.removeAdsText}>{t('menu.removeAdsHint')}</Text>
          </TouchableOpacity>
        )}

      </ScrollView>

      {/* Quick Play Modal */}
      <Modal
        visible={quickPlayVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancelQuickPlay}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} style={styles.spinner} />
            <Text style={styles.modalTitle}>
              {matchmakingStatus === 'searching' ? t('menu.searchingGames') : t('menu.gameFound')}
            </Text>
            {matchmakingStatus === 'searching' && (
              <Button
                mode="outlined"
                onPress={handleCancelQuickPlay}
                style={styles.cancelButton}
                textColor="#FFFFFF"
              >
                {t('common.cancel')}
              </Button>
            )}
          </View>
        </View>
      </Modal>

      {/* Reconnect Modal */}
      <Modal
        visible={reconnectVisible}
        transparent
        animationType="fade"
        onRequestClose={handleCancelReconnect}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            {reconnectStatus === 'reconnecting' ? (
              <ActivityIndicator size="large" color={theme.colors.primary} style={styles.spinner} />
            ) : reconnectStatus === 'joining' ? (
              <MaterialCommunityIcons 
                name="check-circle" 
                size={50} 
                color="#4CAF50" 
                style={styles.spinner} 
              />
            ) : (
              <MaterialCommunityIcons 
                name="close-circle" 
                size={50} 
                color="#F44336" 
                style={styles.spinner} 
              />
            )}
            <Text style={styles.modalTitle}>
              {reconnectStatus === 'reconnecting'
                ? t('menu.reconnecting')
                : reconnectStatus === 'joining'
                  ? t('menu.joining')
                  : t('menu.gameEnded')}
            </Text>
            {reconnectStatus === 'reconnecting' && (
              <Button
                mode="outlined"
                onPress={handleCancelReconnect}
                style={styles.cancelButton}
                textColor="#FFFFFF"
              >
                {t('common.cancel')}
              </Button>
            )}
          </View>
        </View>
      </Modal>

      {/* Edit Display Name Dialog */}
      <Portal>
        <Dialog visible={editNameVisible} onDismiss={() => !savingName && setEditNameVisible(false)}>
          <Dialog.Title>{t('menu.editDisplayName')}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label={t('menu.displayName')}
              value={newDisplayName}
              onChangeText={setNewDisplayName}
              mode="outlined"
              maxLength={30}
              disabled={savingName}
              autoFocus
            />
            <Text style={styles.helperText}>
              {t('menu.displayNameHelper')}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditNameVisible(false)} disabled={savingName}>
              {t('common.cancel')}
            </Button>
            <Button 
              onPress={async () => {
                if (!newDisplayName || newDisplayName.trim().length < 3) {
                  Alert.alert(t('menu.invalidName'), t('menu.displayNameMin'));
                  return;
                }
                if (newDisplayName.trim().length > 30) {
                  Alert.alert(t('menu.invalidName'), t('menu.displayNameMax'));
                  return;
                }
                setSavingName(true);
                const result = await updateDisplayName(newDisplayName.trim());
                setSavingName(false);
                if (result.success) {
                  setEditNameVisible(false);
                  Alert.alert(t('common.success'), t('menu.displayNameUpdated'));
                } else {
                  Alert.alert(t('common.error'), result.error || t('menu.displayNameUpdateFailed'));
                }
              }}
              loading={savingName}
              disabled={savingName}
            >
              {t('common.save')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 20,
    paddingTop: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  appTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  titleIcons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleIconButton: {
    margin: 0,
    marginLeft: 4,
    backgroundColor: 'transparent',
  },
  header: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 12,
    elevation: 5,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatar: {
    backgroundColor: theme.colors.primary,
  },
  userDetails: {
    flex: 1,
    marginLeft: 15,
  },
  username: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#212121',
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 5,
  },
  statusText: {
    fontSize: 12,
    color: '#757575',
  },
  logoutButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#F5F5F5',
    borderRadius: 15,
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 8,
    position: 'relative',
  },
  statsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  statsHeaderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#424242',
  },
  refreshIcon: {
    margin: 0,
    position: 'absolute',
    top: 6,
    right: 6,
  },
  statItem: {
    alignItems: 'center',
    flex: 1,
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  statLabel: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E0E0E0',
    marginHorizontal: 10,
  },
  subscriptionBanner: {
    backgroundColor: '#FFC107',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    marginHorizontal: 20,
    marginTop: 10,
  },
  subscriptionText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 14,
  },
  menuContainer: {
    padding: 20,
  },
  removeAdsLink: {
    position: 'absolute',
    right: 20,
    bottom: '20%',
  },
  removeAdsText: {
    fontSize: 12,
    color: '#FFFFFF',
  },
  primaryActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  primaryActionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  primaryActionCard: {
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    elevation: 3,
  },
  primaryActionCardHalf: {
    flex: 1,
    minWidth: '45%',
  },
  primaryActionCardThird: {
    width: '30%',
    minWidth: 90,
  },
  primaryActionCardLeft: {
    marginRight: 8,
  },
  primaryActionCardRight: {
    marginLeft: 8,
  },
  primaryActionIcon: {
    marginBottom: 8,
  },
  primaryActionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212121',
  },
  primaryActionSubtitle: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
    textAlign: 'center',
  },
  menuCard: {
    marginBottom: 15,
    elevation: 2,
    borderRadius: 15,
  },
  menuCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  menuIcon: {
    marginRight: 15,
  },
  menuTextContainer: {
    flex: 1,
  },
  menuTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212121',
  },
  menuSubtitle: {
    fontSize: 12,
    color: '#757575',
    marginTop: 2,
  },
  menuArrow: {
    margin: 0,
  },
  quickPlayButton: {
    marginTop: 8,
    backgroundColor: '#FF9800',
    elevation: 5,
  },
  quickPlayContent: {
    paddingVertical: 8,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 40,
    alignItems: 'center',
    minWidth: 280,
    elevation: 10,
  },
  spinner: {
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#424242',
    textAlign: 'center',
    marginBottom: 20,
  },
  cancelButton: {
    borderColor: '#757575',
    borderWidth: 1,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  editIcon: {
    margin: 0,
    marginLeft: -4,
  },
  helperText: {
    fontSize: 12,
    color: '#757575',
    marginTop: 8,
  },
});

export default MenuScreen;
