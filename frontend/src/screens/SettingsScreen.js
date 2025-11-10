import React, { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Card, List, Switch, Button, TextInput, Dialog, Portal, IconButton, RadioButton } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import axios from 'axios';
import theme from '../theme';

const SettingsScreen = ({ navigation, onClose, inGame }) => {
  const { user, updateUser, updateLanguage: updateUserLanguage, logout, updateDisplayName, resendVerificationCode, refreshUser } = useAuth() || {};
  const { language, changeLanguage, t } = useLanguage();
  const refreshUserSafe = async (opts = {}) => {
    if (typeof refreshUser === 'function') {
      return await refreshUser(opts);
    }
    return { success: false, noContext: true };
  };
  const updateUserSafe = async (updates = {}) => {
    if (typeof updateUser === 'function') {
      return await updateUser(updates);
    }
    return { success: false, noContext: true };
  };
  const updateDisplayNameSafe = async (name) => {
    if (typeof updateDisplayName === 'function') {
      return await updateDisplayName(name);
    }
    return { success: false, noContext: true };
  };
  const logoutSafe = async () => {
    if (typeof logout === 'function') {
      return await logout();
    }
    return { success: false, noContext: true };
  };
  const resendVerificationCodeSafe = async () => {
    if (typeof resendVerificationCode === 'function') {
      return await resendVerificationCode();
    }
    return { success: false, noContext: true };
  };
  const [soundEnabled, setSoundEnabled] = useState(user?.settings?.soundEnabled ?? true);
  const [notificationsEnabled, setNotificationsEnabled] = useState(user?.settings?.notificationsEnabled ?? true);
  const [vibrationEnabled, setVibrationEnabled] = useState(user?.settings?.vibrationEnabled ?? true);
  const [changePasswordDialog, setChangePasswordDialog] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [editDisplayNameVisible, setEditDisplayNameVisible] = useState(false);
  const [newDisplayName, setNewDisplayName] = useState(user?.displayName || user?.username || '');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    // Ensure we have the latest email/verified fields for display
    refreshUserSafe({ force: true, minAgeMs: 0 }).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSaveSettings = async () => {
    setLoading(true);
    try {
      const settings = {
        soundEnabled,
        notificationsEnabled,
        vibrationEnabled
      };
      await axios.put(`/user/settings`, { settings });
      await updateUserSafe({ settings });
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

  const handleClose = () => {
    if (typeof onClose === 'function') {
      onClose();
      return;
    }
    if (navigation && typeof navigation.goBack === 'function') {
      navigation.goBack();
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.settingsHeader}>
        <IconButton 
          icon="close" 
          onPress={handleClose}
          accessibilityLabel="Close settings"
        />
      </View>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        {!inGame && (
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
              right={() => (
                <Button
                  mode="text"
                  onPress={() => {
                    setNewDisplayName(user?.displayName || user?.username || '');
                    setEditDisplayNameVisible(true);
                  }}
                >
                  Edit
                </Button>
              )}
            />
            <List.Item
              title="Email"
              description={user?.email || 'Not provided'}
              left={(props) => <List.Icon {...props} icon="email" />}
              right={() => (
                !user?.verified ? (
                  <Button
                    mode="text"
                    onPress={async () => {
                      try {
                        await resendVerificationCodeSafe();
                      } catch (e) {
                        // ignore errors; Verify screen can retry
                      }
                      navigation.navigate('Verify');
                    }}
                  >
                    Verify email
                  </Button>
                ) : null
              )}
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
        )}

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

        {!inGame && (
          <>
            {/* Language Settings */}
            <Card style={styles.card}>
              <Card.Content>
                <Text style={styles.sectionTitle}>Language</Text>
                <RadioButton.Group 
                  onValueChange={async (value) => {
                    await changeLanguage(value);
                    if (updateUserLanguage) {
                      await updateUserLanguage(value);
                    }
                  }} 
                  value={language}
                >
                  <List.Item
                    title="English"
                    left={() => <RadioButton value="en" color={theme.colors.primary} />}
                    onPress={() => {
                      changeLanguage('en');
                      if (updateUserLanguage) updateUserLanguage('en');
                    }}
                  />
                  <List.Item
                    title="Español"
                    left={() => <RadioButton value="es" color={theme.colors.primary} />}
                    onPress={() => {
                      changeLanguage('es');
                      if (updateUserLanguage) updateUserLanguage('es');
                    }}
                  />
                </RadioButton.Group>
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
          </>
        )}

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

      {/* Dialogs */}
      <Portal>
        {/* Change Password Dialog */}
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

        {/* Edit Display Name Dialog */}
        <Dialog visible={editDisplayNameVisible} onDismiss={() => !savingName && setEditDisplayNameVisible(false)}>
          <Dialog.Title>Edit Display Name</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Display Name"
              value={newDisplayName}
              onChangeText={setNewDisplayName}
              mode="outlined"
              maxLength={30}
              disabled={savingName}
              autoFocus
              style={styles.dialogInput}
            />
            <Text style={{ fontSize: 12, color: '#757575' }}>
              This is the name other players will see (3-30 characters)
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditDisplayNameVisible(false)} disabled={savingName}>
              Cancel
            </Button>
            <Button
              onPress={async () => {
                const name = (newDisplayName || '').trim();
                if (name.length < 3) {
                  Alert.alert('Invalid Name', 'Display name must be at least 3 characters');
                  return;
                }
                if (name.length > 30) {
                  Alert.alert('Invalid Name', 'Display name must be at most 30 characters');
                  return;
                }
                setSavingName(true);
                const result = await updateDisplayNameSafe(name);
                setSavingName(false);
                if (result?.success) {
                  setEditDisplayNameVisible(false);
                  Alert.alert('Success', 'Display name updated successfully');
                } else {
                  Alert.alert('Error', result?.error || 'Failed to update display name');
                }
              }}
              loading={savingName}
              disabled={savingName}
            >
              Save
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
  settingsHeader: {
    alignItems: 'flex-end',
    paddingTop: 8,
    paddingRight: 8,
    backgroundColor: '#FFFFFF',
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
