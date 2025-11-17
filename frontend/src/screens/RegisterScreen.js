import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { TextInput, Button, Text, Checkbox } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import theme from '../theme';

const RegisterScreen = ({ navigation }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { register, checkUsernameAvailable } = useAuth();
  const { t } = useLanguage();

  const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
  };

  const generateBaseFromEmail = (em) => {
    try {
      const local = (em || '').split('@')[0] || '';
      let base = local.replace(/[^a-zA-Z0-9_\.\-]/g, '').toLowerCase();
      if (base.length < 3) base = `player${Math.floor(Math.random() * 1000)}`;
      if (base.length > 30) base = base.slice(0, 30);
      return base;
    } catch {
      return `player${Math.floor(Math.random() * 1000)}`;
    }
  };

  const pickAvailableUsername = async (base) => {
    // ensure base within 3..30
    let core = base;
    if (core.length < 3) core = `${core}123`.slice(0, 3);
    if (core.length > 30) core = core.slice(0, 30);

    // try base, then base1, base2, ... up to reasonable limit
    const maxTries = 50;
    for (let i = 0; i <= maxTries; i++) {
      const suffix = i === 0 ? '' : String(i);
      const maxCoreLen = 30 - suffix.length;
      const candidate = (core.length > maxCoreLen ? core.slice(0, maxCoreLen) : core) + suffix;
      const available = await checkUsernameAvailable(candidate);
      if (available) return candidate;
    }
    // fallback
    return `${core.slice(0, 27)}${Math.floor(Math.random() * 900 + 100)}`;
  };

  const handleRegister = async () => {
    // Validation
    if (!email || !password) {
      Alert.alert(t('common.error'), t('auth.fillAllFields'));
      return;
    }

    if (!validateEmail(email)) {
      Alert.alert(t('common.error'), t('auth.invalidEmail'));
      return;
    }

    if (password.length < 6) {
      Alert.alert(t('common.error'), t('auth.passwordMinLength'));
      return;
    }

    if (!agreeTerms) {
      Alert.alert(t('common.error'), t('auth.mustAgreeTerms'));
      return;
    }

    setLoading(true);
    try {
      const base = generateBaseFromEmail(email);
      const autoUsername = await pickAvailableUsername(base);
      const result = await register(email, autoUsername, password);
      if (result.success) {
        navigation.replace('UsernameSetup');
      } else {
        Alert.alert(t('auth.registrationFailed'), result.error);
      }
    } catch (e) {
      Alert.alert(t('auth.registrationFailed'), e?.message || t('errors.generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.formContainer}>
        <Text style={styles.title}>{t('auth.createAccount')}</Text>
        <Text style={styles.subtitle}>{t('auth.joinTheFun')}</Text>

        <TextInput
          label={t('auth.email')}
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          mode="outlined"
          keyboardType="email-address"
          autoCapitalize="none"
          left={<TextInput.Icon icon="email" />}
        />

        <TextInput
          label={t('auth.password')}
          value={password}
          onChangeText={setPassword}
          style={styles.input}
          mode="outlined"
          secureTextEntry={!showPassword}
          left={<TextInput.Icon icon="lock" />}
          right={
            <TextInput.Icon 
              icon={showPassword ? "eye-off" : "eye"}
              onPress={() => setShowPassword(!showPassword)}
            />
          }
        />

        <View style={styles.checkboxContainer}>
          <Checkbox
            status={agreeTerms ? 'checked' : 'unchecked'}
            onPress={() => setAgreeTerms(!agreeTerms)}
            color={theme.colors.primary}
          />
          <Text style={styles.checkboxText}>
            {t('auth.agreeTerms')}
          </Text>
        </View>

        <Button
          mode="contained"
          onPress={handleRegister}
          style={styles.registerButton}
          loading={loading}
          disabled={loading}
          contentStyle={styles.buttonContent}
        >
          {t('auth.createAccount')}
        </Button>

        <Button
          mode="text"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          disabled={loading}
        >
          {t('auth.alreadyHaveAccount')}
        </Button>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 20,
  },
  formContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    elevation: 3,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.primary,
    textAlign: 'center',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 20,
  },
  input: {
    marginBottom: 15,
    backgroundColor: '#FFFFFF',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  checkboxText: {
    flex: 1,
    marginLeft: 8,
    color: '#424242',
  },
  registerButton: {
    marginBottom: 10,
    backgroundColor: theme.colors.primary,
  },
  backButton: {
    marginTop: 5,
  },
  buttonContent: {
    paddingVertical: 8,
  },
});

export default RegisterScreen;
