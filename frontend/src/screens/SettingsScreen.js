import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Card, List, Switch, Button, TextInput, Dialog, Portal } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import theme from '../theme';

const SettingsScreen = ({ navigation }) => {
  const { user, updateUser, logout } = useAuth();
  const [soundEnabled, setSoundEnabled] = useState(user?.settings?.soundEnabled ?? true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(user?.settings?.notificationsEnabled ?? true);
  const [vibrationEnabled, setVibrationEnabled] = useState(user?.settings?.vibrationEnabled ?? true);
  const [changePasswordDialog, setChangePasswordDialog] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      const settings = {
        soundEnabled,
        notificationsEnabled,
        vibrationEnabled
      };
      
  await axios.put(`/user/settings`, { settings });
      await updateUser({ settings });
      Alert.alert('Success', 'Settings saved successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      Alert.alert('Error', 'Please fill in all fields');
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Error', 'New passwords do not match');
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert('Error', 'Password must be at least 6 characters');
      return;
    }

    setLoading(true);
    try {
  await axios.post('/user/change-password', {
        oldPassword,
        newPassword
      });
      Alert.alert('Success', 'Password changed successfully');
      setChangePasswordDialog(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      Alert.alert('Error', error.response?.data?.message || 'Failed to change password');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'Are you sure you want to delete your account? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete('/user/account');
              await logout();
              navigation.replace('Login');
            } catch (error) {
              Alert.alert('Error', 'Failed to delete account');
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {/* Account Info */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Account Information</Text>
            <List.Item
              title="Username"
              description={user?.username}
              left={(props) => <List.Icon {...props} icon="account" />}
            />
            <List.Item
              title="Display Name"
              description={user?.displayName || user?.username}
              left={(props) => <List.Icon {...props} icon="card-account-details" />}
            />
            <List.Item
              title="Email"
              description={user?.email || 'Not provided'}
              left={(props) => <List.Icon {...props} icon="email" />}
            />
            <List.Item
              title="Account Type"
              description={user?.isSubscribed ? 'Premium' : 'Free'}
              left={(props) => <List.Icon {...props} icon="crown" />}
              right={() => !user?.isSubscribed && (
                <Button
                  mode="contained"
                  onPress={() => navigation.navigate('Payment')}
                  compact
                >
                  Upgrade
                </Button>
              )}
            />
          </Card.Content>
        </Card>

        {/* Game Settings */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Game Settings</Text>
            <List.Item
              title="Sound Effects"
              left={(props) => <List.Icon {...props} icon="volume-high" />}
              right={() => (
                <Switch
                  value={soundEnabled}
                  onValueChange={setSoundEnabled}
                  color={theme.colors.primary}
                />
              )}
            />
            <List.Item
              title="Notifications"
              left={(props) => <List.Icon {...props} icon="bell" />}
              right={() => (
                <Switch
                  value={notificationsEnabled}
                  onValueChange={setNotificationsEnabled}
                  color={theme.colors.primary}
                />
              )}
            />
            <List.Item
              title="Vibration"
              left={(props) => <List.Icon {...props} icon="vibrate" />}
              right={() => (
                <Switch
                  value={vibrationEnabled}
                  onValueChange={setVibrationEnabled}
                  color={theme.colors.primary}
                />
              )}
            />
          </Card.Content>
        </Card>

        {/* Security */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Security</Text>
            <List.Item
              title="Change Password"
              description="Update your account password"
              left={(props) => <List.Icon {...props} icon="lock-reset" />}
              onPress={() => setChangePasswordDialog(true)}
            />
          </Card.Content>
        </Card>

        {/* Danger Zone */}
        <Card style={[styles.card, styles.dangerCard]}>
          <Card.Content>
            <Text style={[styles.sectionTitle, styles.dangerTitle]}>Danger Zone</Text>
            <List.Item
              title="Delete Account"
              description="Permanently delete your account and data"
              titleStyle={styles.dangerText}
              left={(props) => <List.Icon {...props} icon="delete-forever" color="#F44336" />}
              onPress={handleDeleteAccount}
            />
          </Card.Content>
        </Card>

        {/* Save Button */}
        <Button
          mode="contained"
          onPress={handleSaveSettings}
          style={styles.saveButton}
          loading={loading}
          disabled={loading}
        >
          Save Settings
        </Button>
      </ScrollView>

      {/* Change Password Dialog */}
      <Portal>
        <Dialog visible={changePasswordDialog} onDismiss={() => setChangePasswordDialog(false)}>
          <Dialog.Title>Change Password</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Current Password"
              value={oldPassword}
              onChangeText={setOldPassword}
              secureTextEntry
              style={styles.dialogInput}
              mode="outlined"
            />
            <TextInput
              label="New Password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              style={styles.dialogInput}
              mode="outlined"
            />
            <TextInput
              label="Confirm New Password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
              style={styles.dialogInput}
              mode="outlined"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => {
              setChangePasswordDialog(false);
              setOldPassword('');
              setNewPassword('');
              setConfirmPassword('');
            }}>
              Cancel
            </Button>
            <Button onPress={handleChangePassword} loading={loading}>
              Change
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.primary,
    marginBottom: 15,
  },
  dangerCard: {
    borderColor: '#F44336',
    borderWidth: 1,
  },
  dangerTitle: {
    color: '#F44336',
  },
  dangerText: {
    color: '#F44336',
  },
  saveButton: {
    marginTop: 10,
    backgroundColor: theme.colors.primary,
  },
  dialogInput: {
    marginBottom: 15,
    backgroundColor: '#FFFFFF',
  },
});

export default SettingsScreen;
