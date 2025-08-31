import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { Text, Card, List, Avatar, Chip, SegmentedButtons, ActivityIndicator } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import theme from '../theme';

const LeaderboardScreen = ({ navigation }) => {
  const { user } = useAuth();
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
            { value: 'global', label: 'Global', icon: 'earth' },
            { value: 'weekly', label: 'Weekly', icon: 'calendar-week' },
            { value: 'friends', label: 'Friends', icon: 'account-group' },
          ]}
          style={styles.segmentedButtons}
        />
      </View>

      {/* User Rank Card (only for global) */}
      {selectedTab === 'global' && userRank && (
        <Card style={styles.userRankCard}>
          <Card.Content>
            <View style={styles.userRankContent}>
              <Avatar.Text
                size={50}
                label={user?.username?.substring(0, 2).toUpperCase()}
                style={{ backgroundColor: theme.colors.primary }}
              />
              <View style={styles.userRankInfo}>
                <Text style={styles.userRankName}>Your Rank</Text>
                <View style={styles.userRankStats}>
                  <Chip style={styles.rankChip}>#{userRank.rank}</Chip>
                  <Chip style={styles.pointsChip}>{userRank.winPoints} pts</Chip>
                  <Chip style={styles.percentileChip}>Top {userRank.percentile}%</Chip>
                </View>
              </View>
            </View>
          </Card.Content>
        </Card>
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
        {loading ? (
          <ActivityIndicator size="large" style={styles.loader} />
        ) : leaderboardData.length === 0 ? (
          <Text style={styles.emptyText}>No data available</Text>
        ) : (
          <Card style={styles.leaderboardCard}>
            <List.Section>
              {leaderboardData.map((player, index) => (
                <List.Item
                  key={index}
                  title={player.username}
                  description={`${player.winPoints || player.weeklyPoints || 0} points • ${player.matchesPlayed || player.gamesPlayed || 0} games`}
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
                        {player.avgPoints} avg
                      </Text>
                      {player.isYou && (
                        <Chip style={styles.youChip}>You</Chip>
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
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
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
