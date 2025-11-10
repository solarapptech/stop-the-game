import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, TextInput, Button, HelperText } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';
import theme from '../theme';

const UsernameSetupScreen = ({ navigation }) => {
  const { user, updateUsername, checkUsernameAvailable, refreshUser } = useAuth();
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
    if (!name) return 'Username is required';
    if (name.length < 3) return 'Must be at least 3 characters';
    if (name.length > 30) return 'Must be at most 30 characters';
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) return 'Only letters, numbers, dot, underscore, hyphen';
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
        setErrorMessage('Username already taken');
        setSaving(false);
        return;
      }
    } catch (e) {
      setErrorMessage('Error checking username availability');
      setSaving(false);
      return;
    }

    // Update username
    const result = await updateUsername(username);
    setSaving(false);

    if (result.success) {
      navigation.replace('Menu');
    } else {
      setErrorMessage(result.error || 'Failed to update username');
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Your Account has been Created!</Text>
        <Text style={styles.subtitle}>What's Your Username?</Text>

        <TextInput
          label="Username"
          value={username}
          onChangeText={(t) => { setUsername(t); setErrorMessage(''); }}
          style={styles.input}
          mode="outlined"
          autoCapitalize="none"
          left={<TextInput.Icon icon="account" />}
          error={!!errorMessage}
        />
        <HelperText type="error" visible={!!errorMessage}>
          {errorMessage}
        </HelperText>

        <Button
          mode="contained"
          onPress={handleContinue}
          loading={saving}
          disabled={saving}
          contentStyle={styles.buttonContent}
          style={styles.continueButton}
        >
          Let's Play!
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
  continueButton: {
    marginTop: 8,
    backgroundColor: theme.colors.primary
  },
  buttonContent: {
    height: 48
  },
});

export default UsernameSetupScreen;
