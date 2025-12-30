import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl, Platform } from 'react-native';
import { Text, Card, List, Avatar, Chip, SegmentedButtons, ActivityIndicator } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import axios from 'axios';
import theme from '../theme';

const LeaderboardScreen = ({ navigation }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [selectedTab, setSelectedTab] = useState('global');
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [userRank, setUserRank] = useState(null);

  useEffect(() => {
    loadLeaderboard();
    loadUserRank();
  }, [selectedTab]);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
  const response = await axios.get(`/leaderboard/${selectedTab}`, {
        params: selectedTab === 'friends' ? { userId: user?.id } : {}
      });
      setLeaderboardData(response.data.leaderboard);
    } catch (error) {
      console.error('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadUserRank = async () => {
    if (user?.id && selectedTab === 'global') {
      try {
  const response = await axios.get(`/leaderboard/rank/${user.id}`);
        setUserRank(response.data);
      } catch (error) {
        console.error('Error loading user rank:', error);
      }
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadLeaderboard();
    await loadUserRank();
    setRefreshing(false);
  };

  const getRankColor = (rank) => {
    switch (rank) {
      case 1: return '#FFD700'; // Gold
      case 2: return '#C0C0C0'; // Silver
      case 3: return '#CD7F32'; // Bronze
      default: return theme.colors.primary;
    }
  };

  const getRankIcon = (rank) => {
    switch (rank) {
      case 1: return 'trophy';
      case 2: return 'medal';
      case 3: return 'medal-outline';
      default: return null;
    }
  };

  return (
    <View style={styles.container}>
      {/* Tab Selector */}
      <View style={styles.tabContainer}>
        <SegmentedButtons
          value={selectedTab}
          onValueChange={setSelectedTab}
          buttons={[
            { value: 'global', label: t('leaderboard.global'), icon: 'earth' },
            { value: 'weekly', label: t('leaderboard.weekly'), icon: 'calendar-week' },
            { value: 'friends', label: t('leaderboard.friends'), icon: 'account-group' },
          ]}
          style={styles.segmentedButtons}
        />
      </View>

      {/* User Rank Card (only for global) */}
      {selectedTab === 'global' && userRank && (
        <View style={styles.maxWidthContent}>
          <Card style={styles.userRankCard}>
            <Card.Content>
              <View style={styles.userRankContent}>
                <Avatar.Text
                  size={50}
                  label={(user?.displayName || user?.username)?.substring(0, 2).toUpperCase()}
                  style={{ backgroundColor: theme.colors.primary }}
                />
                <View style={styles.userRankInfo}>
                  <Text style={styles.userRankName}>{t('leaderboard.yourRank')}</Text>
                  <View style={styles.userRankStats}>
                    <Chip style={styles.rankChip}>#{userRank.rank}</Chip>
                    <Chip style={styles.pointsChip}>{userRank.winPoints} {t('leaderboard.pts')}</Chip>
                    <Chip style={styles.percentileChip}>{t('leaderboard.top')} {userRank.percentile}%</Chip>
                  </View>
                </View>
              </View>
            </Card.Content>
          </Card>
        </View>
      )}

      {/* Leaderboard List */}
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
          />
        }
      >
        <View style={styles.maxWidthContent}>
          {loading ? (
            <ActivityIndicator size="large" style={styles.loader} />
          ) : leaderboardData.length === 0 ? (
            <Text style={styles.emptyText}>{t('leaderboard.noData')}</Text>
          ) : (
            <Card style={styles.leaderboardCard}>
              <List.Section>
                {leaderboardData.map((player, index) => (
                  <List.Item
                    key={index}
                    title={player.displayName || player.username}
                    description={`${player.winPoints || player.weeklyPoints || 0} ${t('leaderboard.points')} • ${player.matchesPlayed || player.gamesPlayed || 0} ${t('leaderboard.games')}`}
                    left={() => (
                      <View style={styles.rankContainer}>
                        {player.rank <= 3 && getRankIcon(player.rank) ? (
                          <Avatar.Icon
                            size={40}
                            icon={getRankIcon(player.rank)}
                            style={[styles.rankAvatar, { backgroundColor: getRankColor(player.rank) }]}
                          />
                        ) : (
                          <Avatar.Text
                            size={40}
                            label={player.rank.toString()}
                            style={[styles.rankAvatar, { backgroundColor: '#E0E0E0' }]}
                          />
                        )}
                      </View>
                    )}
                    right={() => (
                      <View style={styles.playerStats}>
                        <Text style={styles.avgPoints}>
                          {player.avgPoints} {t('leaderboard.avg')}
                        </Text>
                        {player.isYou && (
                          <Chip style={styles.youChip}>{t('leaderboard.you')}</Chip>
                        )}
                      </View>
                    )}
                    style={[
                      styles.listItem,
                      player.isYou && styles.highlightedItem,
                      player.rank === 1 && styles.firstPlace,
                      player.rank === 2 && styles.secondPlace,
                      player.rank === 3 && styles.thirdPlace,
                    ]}
                  />
                ))}
              </List.Section>
            </Card>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  maxWidthContent: {
    width: '100%',
    maxWidth: theme.layout?.maxContentWidth || 1100,
    alignSelf: 'center',
  },
  tabContainer: {
    padding: 15,
    backgroundColor: '#FFFFFF',
    elevation: 2,
  },
  segmentedButtons: {
    backgroundColor: '#F5F5F5',
  },
  userRankCard: {
    margin: 15,
    elevation: 3,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
  },
  userRankContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userRankInfo: {
    flex: 1,
    marginLeft: 15,
  },
  userRankName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#424242',
    marginBottom: 10,
  },
  userRankStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  rankChip: {
    marginRight: 5,
    marginBottom: 5,
    backgroundColor: theme.colors.primary,
  },
  pointsChip: {
    marginRight: 5,
    marginBottom: 5,
    backgroundColor: '#E3F2FD',
  },
  percentileChip: {
    marginBottom: 5,
    backgroundColor: '#FFF3E0',
  },
  scrollView: {
    flex: 1,
    ...(Platform.OS === 'web' && { overflowY: 'auto' }),
  },
  scrollContent: {
    padding: 15,
  },
  loader: {
    marginTop: 50,
  },
  emptyText: {
    textAlign: 'center',
    color: '#757575',
    marginTop: 50,
    fontSize: 16,
  },
  leaderboardCard: {
    elevation: 2,
    borderRadius: 15,
    backgroundColor: '#FFFFFF',
  },
  listItem: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  highlightedItem: {
    backgroundColor: '#E8F5E9',
  },
  firstPlace: {
    backgroundColor: '#FFF8E1',
  },
  secondPlace: {
    backgroundColor: '#F5F5F5',
  },
  thirdPlace: {
    backgroundColor: '#FFF3E0',
  },
  rankContainer: {
    marginRight: 10,
    justifyContent: 'center',
  },
  rankAvatar: {
    marginLeft: 10,
  },
  playerStats: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginRight: 10,
  },
  avgPoints: {
    fontSize: 12,
    color: '#757575',
    marginBottom: 5,
  },
  youChip: {
    backgroundColor: theme.colors.primary,
    height: 24,
  },
});

export default LeaderboardScreen;
