import React, { useState, useRef } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { Text, TextInput, Button } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';
import theme from '../theme';

const VerifyScreen = ({ navigation }) => {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const { verifyEmail, resendVerificationCode } = useAuth();
  const inputRefs = useRef([]);

  const handleCodeChange = (value, index) => {
    const newCode = [...code];
    newCode[index] = value;
    setCode(newCode);

    // Auto-focus next input
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all digits are entered
    if (index === 5 && value) {
      const fullCode = newCode.join('');
      if (fullCode.length === 6) {
        handleVerify(fullCode);
      }
    }
  };

  const handleKeyPress = (key, index) => {
    if (key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handleVerify = async (verificationCode = null) => {
    const codeToVerify = verificationCode || code.join('');
    
    if (codeToVerify.length !== 6) {
      Alert.alert('Error', 'Please enter the complete 6-digit code');
      return;
    }

    setLoading(true);
    const result = await verifyEmail(codeToVerify);
    setLoading(false);

    if (result.success) {
      Alert.alert('Success', 'Email verified successfully!', [
        { text: 'OK', onPress: () => navigation.replace('Menu') }
      ]);
    } else {
      Alert.alert('Verification Failed', result.error);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    const result = await resendVerificationCode();
    setLoading(false);

    if (result.success) {
      Alert.alert('Success', 'Verification code sent to your email');
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } else {
      Alert.alert('Error', result.error);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.title}>Verify Your Email</Text>
        <Text style={styles.subtitle}>
          We've sent a 6-digit verification code to your email address
        </Text>

        <View style={styles.codeContainer}>
          {code.map((digit, index) => (
            <TextInput
              key={index}
              ref={ref => inputRefs.current[index] = ref}
              value={digit}
              onChangeText={(value) => handleCodeChange(value, index)}
              onKeyPress={({ nativeEvent }) => handleKeyPress(nativeEvent.key, index)}
              style={styles.codeInput}
              mode="outlined"
              maxLength={1}
              keyboardType="numeric"
              textAlign="center"
              selectionColor={theme.colors.primary}
              outlineColor={theme.colors.primary}
              activeOutlineColor={theme.colors.primary}
            />
          ))}
        </View>

        <Button
          mode="contained"
          onPress={() => handleVerify()}
          style={styles.verifyButton}
          loading={loading}
          disabled={loading}
          contentStyle={styles.buttonContent}
        >
          Verify Email
        </Button>

        <View style={styles.resendContainer}>
          <Text style={styles.resendText}>Didn't receive the code?</Text>
          <Button
            mode="text"
            onPress={handleResend}
            disabled={loading}
            style={styles.resendButton}
          >
            Resend Code
          </Button>
        </View>

        <Button
          mode="text"
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          disabled={loading}
        >
          Back to Login
        </Button>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    justifyContent: 'center',
    padding: 20,
  },
  content: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 30,
    elevation: 3,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.primary,
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 30,
    paddingHorizontal: 10,
  },
  codeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 30,
  },
  codeInput: {
    width: 45,
    height: 55,
    fontSize: 20,
    fontWeight: 'bold',
    backgroundColor: '#FFFFFF',
  },
  verifyButton: {
    marginBottom: 20,
    backgroundColor: theme.colors.primary,
  },
  buttonContent: {
    paddingVertical: 8,
  },
  resendContainer: {
    alignItems: 'center',
    marginBottom: 10,
  },
  resendText: {
    color: '#757575',
    marginBottom: 5,
  },
  resendButton: {
    marginTop: -5,
  },
  backButton: {
    marginTop: 10,
  },
});

export default VerifyScreen;
