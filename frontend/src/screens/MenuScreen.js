import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Text, Button, Card, Avatar, IconButton, Badge, ActivityIndicator, TextInput, Portal, Dialog } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { useLanguage } from '../contexts/LanguageContext';
import theme from '../theme';

const MenuScreen = ({ navigation }) => {
  const { user, logout, updateDisplayName, refreshUser, statsDirty } = useAuth();
  const { socket, connected } = useSocket();
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
      Alert.alert(t('common.error'), data.message || t('menu.quickPlayError'));
    };

    socket.on('quickplay-matched', handleQuickPlayMatched);
    socket.on('quickplay-error', handleQuickPlayError);

    return () => {
      socket.off('quickplay-matched', handleQuickPlayMatched);
      socket.off('quickplay-error', handleQuickPlayError);
    };
  }, [socket, navigation]);

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

  const menuItems = [
    {
      title: t('menu.createRoom'),
      subtitle: t('menu.createRoomDesc'),
      icon: 'plus-circle',
      color: '#4CAF50',
      onPress: () => navigation.navigate('CreateRoom'),
    },
    {
      title: t('menu.joinRoom'),
      subtitle: t('menu.joinRoomDesc'),
      icon: 'login',
      color: '#2196F3',
      onPress: () => navigation.navigate('JoinRoom'),
    },
    {
      title: t('menu.leaderboard'),
      subtitle: t('menu.leaderboardDesc'),
      icon: 'trophy',
      color: '#FFC107',
      onPress: () => navigation.navigate('Leaderboard'),
    },
    {
      title: t('menu.settings'),
      subtitle: t('menu.settingsDesc'),
      icon: 'cog',
      color: '#9C27B0',
      onPress: () => navigation.navigate('Settings'),
    },
  ];

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
              size={60} 
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
          <View style={styles.statsHeaderRow}>
            
            <IconButton
              icon={statsRefreshing ? 'reload' : 'refresh'}
              size={18}
              onPress={handleManualStatsRefresh}
              disabled={statsRefreshing}
              style={styles.refreshIcon}
              iconColor={theme.colors.primary}
            />
          </View>
          <View style={styles.statsContainer}>
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

        {/* Menu Items */}
        <View style={styles.menuContainer}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              onPress={item.onPress}
              activeOpacity={0.8}
            >
              <Card style={styles.menuCard}>
                <Card.Content style={styles.menuCardContent}>
                  <Avatar.Icon
                    size={48}
                    icon={item.icon}
                    style={[styles.menuIcon, { backgroundColor: item.color }]}
                  />
                  <View style={styles.menuTextContainer}>
                    <Text style={styles.menuTitle}>{item.title}</Text>
                    <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                  </View>
                  <IconButton
                    icon="chevron-right"
                    size={24}
                    style={styles.menuArrow}
                  />
                </Card.Content>
              </Card>
            </TouchableOpacity>
          ))}
        </View>

        {/* Subscription Banner */}
        {!user?.isSubscribed && (
          <TouchableOpacity 
            style={styles.subscriptionBanner}
            onPress={() => navigation.navigate('Payment')}
          >
            <Text style={styles.subscriptionText}>{t('menu.goPremium')}</Text>
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
  },
  header: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    padding: 20,
    elevation: 5,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
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
    padding: 15,
    marginBottom: 15,
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
    marginTop: 15,
    backgroundColor: '#FF9800',
    elevation: 5,
  },
  quickPlayContent: {
    paddingVertical: 10,
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
