import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, TextInput, Button, HelperText } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';
import theme from '../theme';

const UsernameSetupScreen = ({ navigation }) => {
  const { user, updateUsername, checkUsernameAvailable } = useAuth();
  const [username, setUsername] = useState(user?.username || '');
  const [checking, setChecking] = useState(false);
  const [available, setAvailable] = useState(null); // null | true | false
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setUsername(user?.username || '');
  }, [user]);

  const validateLocal = (name) => {
    if (!name) return 'Username is required';
    if (name.length < 3) return 'Must be at least 3 characters';
    if (name.length > 30) return 'Must be at most 30 characters';
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) return 'Only letters, numbers, dot, underscore, hyphen';
    return null;
  };

  const handleCheck = async () => {
    const err = validateLocal(username);
    if (err) {
      setAvailable(false);
      return;
    }
    setChecking(true);
    try {
      const ok = await checkUsernameAvailable(username);
      setAvailable(!!ok);
    } catch (e) {
      setAvailable(null);
    } finally {
      setChecking(false);
    }
  };

  const handleContinue = async () => {
    const err = validateLocal(username);
    if (err) {
      Alert.alert('Invalid username', err);
      return;
    }

    if (username === (user?.username || '')) {
      navigation.replace('Menu');
      return;
    }

    setSaving(true);
    const result = await updateUsername(username);
    setSaving(false);

    if (result.success) {
      navigation.replace('Menu');
    } else {
      Alert.alert('Username Update Failed', result.error || 'Please try a different username');
    }
  };

  const helperText = () => {
    if (available === true) return 'Username is available';
    if (available === false) return 'Username is taken';
    return '';
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>Your Account has been Created!</Text>
        <Text style={styles.subtitle}>What's Your Username?</Text>

        <TextInput
          label="Username"
          value={username}
          onChangeText={(t) => { setUsername(t); setAvailable(null); }}
          style={styles.input}
          mode="outlined"
          autoCapitalize="none"
          left={<TextInput.Icon icon="account" />}
        />
        <HelperText type={available ? 'info' : 'error'} visible={available !== null}>
          {helperText()}
        </HelperText>

        <View style={styles.row}>
          <Button
            mode="outlined"
            onPress={handleCheck}
            disabled={checking || saving}
            style={styles.checkButton}
          >
            {checking ? 'Checking...' : 'Check availability'}
          </Button>
          <Button
            mode="contained"
            onPress={handleContinue}
            loading={saving}
            disabled={saving}
            contentStyle={styles.buttonContent}
            style={styles.continueButton}
          >
            Continue
          </Button>
        </View>
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  checkButton: {
    flex: 1,
    marginRight: 10,
    borderColor: theme.colors.primary
  },
  continueButton: {
    flex: 1,
    backgroundColor: theme.colors.primary
  },
  buttonContent: {
    height: 48
  },
});

export default UsernameSetupScreen;
