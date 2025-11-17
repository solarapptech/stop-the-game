import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, TextInput, Button, HelperText, RadioButton, List } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import theme from '../theme';

const UsernameSetupScreen = ({ navigation }) => {
  const { user, updateUsername, updateLanguage: updateUserLanguage, checkUsernameAvailable, refreshUser } = useAuth();
  const { language, changeLanguage, t } = useLanguage();
  const [username, setUsername] = useState(user?.username || '');
  const [errorMessage, setErrorMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const init = async () => {
      // Ensure user profile is fresh so email is decrypted
      try { await refreshUser({ force: true, minAgeMs: 0 }); } catch (e) {}
      // Prefer a suggestion derived from the email local part (no suffix)
      const email = user?.email || '';
      const local = typeof email === 'string' ? (email.split('@')[0] || '') : '';
      let base = local.replace(/[^a-zA-Z0-9_.-]/g, '').toLowerCase();
      if (!base || base.length < 3) base = (user?.username || '').toLowerCase();
      if (!base || base.length < 3) base = `player${Math.floor(Math.random() * 1000)}`;
      if (base.length > 30) base = base.slice(0, 30);

      // Just use the base username without checking availability
      setUsername(base);
      setErrorMessage('');
    };
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

  const validateLocal = (name) => {
    if (!name) return t('usernameSetup.required');
    if (name.length < 3) return t('usernameSetup.minLength');
    if (name.length > 30) return t('usernameSetup.maxLength');
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) return t('usernameSetup.invalidChars');
    return null;
  };

  const handleContinue = async () => {
    // Clear previous error
    setErrorMessage('');

    // Validate format
    const err = validateLocal(username);
    if (err) {
      setErrorMessage(err);
      return;
    }

    // If username hasn't changed, just proceed
    if (username === (user?.username || '')) {
      navigation.replace('Menu');
      return;
    }

    // Check availability first
    setSaving(true);
    try {
      const available = await checkUsernameAvailable(username);
      if (!available) {
        setErrorMessage(t('usernameSetup.alreadyTaken'));
        setSaving(false);
        return;
      }
    } catch (e) {
      setErrorMessage(t('usernameSetup.errorChecking'));
      setSaving(false);
      return;
    }

    // Update username
    const result = await updateUsername(username);
    setSaving(false);

    if (result.success) {
      navigation.replace('Menu');
    } else {
      setErrorMessage(result.error || t('usernameSetup.updateFailed'));
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{t('usernameSetup.title')}</Text>
        <Text style={styles.subtitle}>{t('usernameSetup.subtitle')}</Text>

        <TextInput
          label={t('usernameSetup.username')}
          value={username}
          onChangeText={(text) => { setUsername(text); setErrorMessage(''); }}
          style={styles.input}
          mode="outlined"
          autoCapitalize="none"
          left={<TextInput.Icon icon="account" />}
          error={!!errorMessage}
        />
        <HelperText type="error" visible={!!errorMessage}>
          {errorMessage}
        </HelperText>

        <View style={styles.languageContainer}>
          <Text style={styles.languageLabel}>{t('usernameSetup.selectLanguage')}</Text>
          <RadioButton.Group 
            onValueChange={async (value) => {
              await changeLanguage(value);
              if (updateUserLanguage) {
                await updateUserLanguage(value);
              }
            }} 
            value={language}
          >
            <View style={styles.languageOptions}>
              <View style={styles.languageOption}>
                <RadioButton value="en" color={theme.colors.primary} />
                <Text style={styles.languageOptionText}>{t('settings.english')}</Text>
              </View>
              <View style={styles.languageOption}>
                <RadioButton value="es" color={theme.colors.primary} />
                <Text style={styles.languageOptionText}>{t('settings.spanish')}</Text>
              </View>
            </View>
          </RadioButton.Group>
        </View>

        <Button
          mode="contained"
          onPress={handleContinue}
          loading={saving}
          disabled={saving}
          contentStyle={styles.buttonContent}
          style={styles.continueButton}
        >
          {t('usernameSetup.letsPlay')}
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 20,
    backgroundColor: '#F5F5F5'
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.primary,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 16,
  },
  input: {
    marginBottom: 8,
    backgroundColor: '#FFFFFF'
  },
  languageContainer: {
    marginTop: 16,
    marginBottom: 8,
  },
  languageLabel: {
    fontSize: 16,
    fontWeight: '600',
    color: '#424242',
    marginBottom: 8,
  },
  languageOptions: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 8,
  },
  languageOption: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  languageOptionText: {
    fontSize: 16,
    color: '#424242',
    marginLeft: -8,
  },
  continueButton: {
    marginTop: 16,
    backgroundColor: theme.colors.primary
  },
  buttonContent: {
    height: 48
  },
});

export default UsernameSetupScreen;
