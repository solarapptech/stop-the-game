import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Text, Button, Card, Avatar, IconButton, Badge } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import theme from '../theme';

const MenuScreen = ({ navigation }) => {
  const { user, logout } = useAuth();
  const { connected } = useSocket();
  const [stats, setStats] = useState({
    winPoints: user?.winPoints || 0,
    matchesPlayed: user?.matchesPlayed || 0,
    friends: user?.friends?.length || 0,
  });

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Logout', 
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
      title: 'Create Room',
      subtitle: 'Start a new game room',
      icon: 'plus-circle',
      color: '#4CAF50',
      onPress: () => navigation.navigate('CreateRoom'),
    },
    {
      title: 'Join Room',
      subtitle: 'Enter an existing room',
      icon: 'login',
      color: '#2196F3',
      onPress: () => navigation.navigate('JoinRoom'),
    },
    {
      title: 'Leaderboard',
      subtitle: 'View top players',
      icon: 'trophy',
      color: '#FFC107',
      onPress: () => navigation.navigate('Leaderboard'),
    },
    {
      title: 'Settings',
      subtitle: 'Customize your experience',
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
              <Text style={styles.username}>{user?.username || 'Player'}</Text>
              <View style={styles.connectionStatus}>
                <View style={[styles.statusDot, { backgroundColor: connected ? '#4CAF50' : '#F44336' }]} />
                <Text style={styles.statusText}>
                  {connected ? 'Connected' : 'Disconnected'}
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
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.winPoints}</Text>
              <Text style={styles.statLabel}>Points</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.matchesPlayed}</Text>
              <Text style={styles.statLabel}>Games</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{stats.friends}</Text>
              <Text style={styles.statLabel}>Friends</Text>
            </View>
          </View>

          {/* Subscription Badge */}
          {!user?.isSubscribed && (
            <TouchableOpacity 
              style={styles.subscriptionBanner}
              onPress={() => navigation.navigate('Payment')}
            >
              <Text style={styles.subscriptionText}>🎮 Go Premium - Remove Ads!</Text>
            </TouchableOpacity>
          )}
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

        {/* Quick Play Button */}
        <Button
          mode="contained"
          onPress={() => navigation.navigate('JoinRoom')}
          style={styles.quickPlayButton}
          contentStyle={styles.quickPlayContent}
          icon="play-circle"
        >
          Quick Play
        </Button>
      </ScrollView>
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
    marginHorizontal: 20,
    marginTop: 10,
    backgroundColor: '#FF9800',
    elevation: 5,
  },
  quickPlayContent: {
    paddingVertical: 10,
  },
});

export default MenuScreen;
