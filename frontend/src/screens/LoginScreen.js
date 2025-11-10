import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { TextInput, Button, Text, ActivityIndicator } from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import * as WebBrowser from 'expo-web-browser';
import * as Google from 'expo-auth-session/providers/google';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import theme from '../theme';
import axios from 'axios';

WebBrowser.maybeCompleteAuthSession();

const LoginScreen = ({ navigation }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { login } = useAuth();
  const { t } = useLanguage();

  // Google OAuth configuration
  const [request, response, promptAsync] = Google.useAuthRequest({
    clientId: 'YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com',
    scopes: ['profile', 'email'],
  });

  React.useEffect(() => {
    if (response?.type === 'success') {
      handleGoogleLogin(response.authentication.accessToken);
    }
  }, [response]);

  const handleLogin = async () => {
    if (!username || !password) {
      Alert.alert(t('common.error'), t('auth.fillAllFields'));
      return;
    }

    setLoading(true);
    const result = await login(username, password);
    setLoading(false);

    if (result.success) {
      navigation.replace('Menu');
    } else {
      Alert.alert(t('auth.loginFailed'), result.error);
    }
  };

  const handleGoogleLogin = async (accessToken) => {
    setLoading(true);
    try {
      // Send token to backend for verification and user creation/login
      const { data } = await axios.post('auth/google', { accessToken });
      if (data.success) {
        navigation.replace('Menu');
      } else {
        Alert.alert(t('common.error'), 'Google login failed');
      }
    } catch (error) {
      Alert.alert(t('common.error'), 'Failed to connect with Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <LinearGradient
      colors={['#4CAF50', '#45a049']}
      style={styles.container}
    >
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.logoContainer}>
          <Text style={styles.title}>Stop!</Text>
          <Text style={styles.subtitle}>The Game</Text>
        </View>

        <View style={styles.formContainer}>
          <TextInput
            label={t('auth.usernameOrEmail')}
            value={username}
            onChangeText={setUsername}
            style={styles.input}
            mode="outlined"
            autoCapitalize="none"
            left={<TextInput.Icon icon="account" />}
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

          <Button
            mode="contained"
            onPress={handleLogin}
            style={styles.loginButton}
            loading={loading}
            disabled={loading}
            contentStyle={styles.buttonContent}
          >
            {t('auth.login')}
          </Button>

          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>{t('common.or')}</Text>
            <View style={styles.dividerLine} />
          </View>

          <Button
            mode="outlined"
            onPress={() => promptAsync()}
            style={styles.googleButton}
            disabled={!request || loading}
            icon="google"
            contentStyle={styles.buttonContent}
          >
            {t('auth.continueWithGoogle')}
          </Button>

          <View style={styles.footer}>
            <Text style={styles.footerText}>{t('auth.dontHaveAccount')}</Text>
            <TouchableOpacity onPress={() => navigation.navigate('Register')}>
              <Text style={styles.linkText}>{t('auth.signUp')}</Text>
            </TouchableOpacity>
          </View>
        </View>
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
    justifyContent: 'center',
    padding: 20,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'Roboto-Bold',
  },
  subtitle: {
    fontSize: 24,
    color: '#FFFFFF',
    opacity: 0.9,
  },
  formContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 20,
    padding: 20,
    elevation: 5,
  },
  input: {
    marginBottom: 15,
    backgroundColor: '#FFFFFF',
  },
  loginButton: {
    marginTop: 10,
    marginBottom: 20,
    backgroundColor: theme.colors.primary,
  },
  googleButton: {
    marginBottom: 20,
    borderColor: theme.colors.primary,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  dividerText: {
    marginHorizontal: 10,
    color: '#757575',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerText: {
    color: '#757575',
    marginRight: 5,
  },
  linkText: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
});

export default LoginScreen;
