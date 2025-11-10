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
      Alert.alert(t('common.success'), t('settings.settingsSaved'));
    } catch (error) {
      Alert.alert(t('common.error'), t('settings.failedToSave'));
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!oldPassword || !newPassword || !confirmPassword) {
      Alert.alert(t('common.error'), t('auth.fillAllFields'));
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert(t('common.error'), t('settings.passwordsDoNotMatch'));
      return;
    }

    if (newPassword.length < 6) {
      Alert.alert(t('common.error'), t('auth.passwordMinLength'));
      return;
    }

    setLoading(true);
    try {
  await axios.post('/user/change-password', {
        oldPassword,
        newPassword
      });
      Alert.alert(t('common.success'), t('settings.passwordChanged'));
      setChangePasswordDialog(false);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (error) {
      Alert.alert(t('common.error'), error.response?.data?.message || t('settings.failedToChangePassword'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      t('settings.deleteAccount'),
      t('settings.deleteAccountConfirm'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('settings.delete'),
          style: 'destructive',
          onPress: async () => {
            try {
              await axios.delete('/user/account');
              await logout();
              navigation.replace('Login');
            } catch (error) {
              Alert.alert(t('common.error'), t('settings.failedToDelete'));
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
              <Text style={styles.sectionTitle}>{t('settings.accountInfo')}</Text>
            <List.Item
              title={t('settings.username')}
              description={user?.username}
              left={(props) => <List.Icon {...props} icon="account" />}
            />
            <List.Item
              title={t('settings.displayName')}
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
                  {t('settings.edit')}
                </Button>
              )}
            />
            <List.Item
              title={t('settings.email')}
              description={user?.email || t('settings.notProvided')}
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
                    {t('settings.verifyEmail')}
                  </Button>
                ) : null
              )}
            />
            <List.Item
              title={t('settings.accountType')}
              description={user?.isSubscribed ? t('settings.premium') : t('settings.free')}
              left={(props) => <List.Icon {...props} icon="crown" />}
              right={() => !user?.isSubscribed && (
                <Button
                  mode="contained"
                  onPress={() => navigation.navigate('Payment')}
                  compact
                >
                  {t('settings.upgrade')}
                </Button>
              )}
            />
            </Card.Content>
          </Card>
        )}

        {/* Game Settings */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>{t('settings.gameSettings')}</Text>
            <List.Item
              title={t('settings.soundEffects')}
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
              title={t('settings.notifications')}
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
              title={t('settings.vibration')}
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
                <Text style={styles.sectionTitle}>{t('settings.language')}</Text>
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
                <Text style={styles.sectionTitle}>{t('settings.security')}</Text>
                <List.Item
                  title={t('settings.changePassword')}
                  description={t('settings.changePasswordDesc')}
                  left={(props) => <List.Icon {...props} icon="lock-reset" />}
                  onPress={() => setChangePasswordDialog(true)}
                />
              </Card.Content>
            </Card>

            {/* Danger Zone */}
            <Card style={[styles.card, styles.dangerCard]}>
              <Card.Content>
                <Text style={[styles.sectionTitle, styles.dangerTitle]}>{t('settings.dangerZone')}</Text>
                <List.Item
                  title={t('settings.deleteAccount')}
                  description={t('settings.deleteAccountDesc')}
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
          {t('settings.saveSettings')}
        </Button>
      </ScrollView>

      {/* Dialogs */}
      <Portal>
        {/* Change Password Dialog */}
        <Dialog visible={changePasswordDialog} onDismiss={() => setChangePasswordDialog(false)}>
          <Dialog.Title>{t('settings.changePassword')}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label={t('settings.currentPassword')}
              value={oldPassword}
              onChangeText={setOldPassword}
              secureTextEntry
              style={styles.dialogInput}
              mode="outlined"
            />
            <TextInput
              label={t('settings.newPassword')}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              style={styles.dialogInput}
              mode="outlined"
            />
            <TextInput
              label={t('settings.confirmNewPassword')}
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
              {t('common.cancel')}
            </Button>
            <Button onPress={handleChangePassword} loading={loading}>
              {t('settings.change')}
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* Edit Display Name Dialog */}
        <Dialog visible={editDisplayNameVisible} onDismiss={() => !savingName && setEditDisplayNameVisible(false)}>
          <Dialog.Title>{t('settings.editDisplayName')}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              label={t('settings.displayName')}
              value={newDisplayName}
              onChangeText={setNewDisplayName}
              mode="outlined"
              maxLength={30}
              disabled={savingName}
              autoFocus
              style={styles.dialogInput}
            />
            <Text style={{ fontSize: 12, color: '#757575' }}>
              {t('settings.displayNameHelper')}
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEditDisplayNameVisible(false)} disabled={savingName}>
              {t('common.cancel')}
            </Button>
            <Button
              onPress={async () => {
                const name = (newDisplayName || '').trim();
                if (name.length < 3) {
                  Alert.alert(t('settings.invalidName'), t('settings.displayNameMin'));
                  return;
                }
                if (name.length > 30) {
                  Alert.alert(t('settings.invalidName'), t('settings.displayNameMax'));
                  return;
                }
                setSavingName(true);
                const result = await updateDisplayNameSafe(name);
                setSavingName(false);
                if (result?.success) {
                  setEditDisplayNameVisible(false);
                  Alert.alert(t('common.success'), t('settings.displayNameUpdated'));
                } else {
                  Alert.alert(t('common.error'), result?.error || t('settings.displayNameUpdateFailed'));
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
