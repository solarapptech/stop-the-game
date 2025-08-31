import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { Text, Card, Button, List, Chip } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import theme from '../theme';

const PaymentScreen = ({ navigation }) => {
  const { user, updateUser } = useAuth();
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [showWebView, setShowWebView] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState('');

  const SUBSCRIPTION_PRICE = 9.99;
  const FEATURES = [
    { icon: 'close-circle', text: 'No Ads', description: 'Enjoy uninterrupted gameplay' },
    { icon: 'crown', text: 'Premium Badge', description: 'Show off your premium status' },
    { icon: 'rocket', text: 'Early Access', description: 'Get new features first' },
    { icon: 'palette', text: 'Custom Themes', description: 'Personalize your experience' },
    { icon: 'infinity', text: 'Unlimited Rooms', description: 'Create as many rooms as you want' },
    { icon: 'star', text: 'Priority Support', description: 'Get help faster' },
  ];

  const handleStripePayment = async () => {
    setLoading(true);
    try {
  const response = await axios.post('/payment/create-stripe-session', {
        userId: user.id,
        priceId: 'price_lifetime_subscription'
      });
      
      setPaymentUrl(response.data.url);
      setShowWebView(true);
    } catch (error) {
      Alert.alert('Error', 'Failed to initiate payment');
    } finally {
      setLoading(false);
    }
  };

  const handlePayPalPayment = async () => {
    setLoading(true);
    try {
  const response = await axios.post('/payment/create-paypal-order', {
        userId: user.id
      });
      
      setPaymentUrl(response.data.approvalUrl);
      setShowWebView(true);
    } catch (error) {
      Alert.alert('Error', 'Failed to initiate PayPal payment');
    } finally {
      setLoading(false);
    }
  };

  const handleWebViewNavigationStateChange = async (navState) => {
    const { url } = navState;
    
    // Check for success URL
    if (url.includes('payment-success')) {
      setShowWebView(false);
      setLoading(true);
      
      // Verify payment on backend
      try {
  const response = await axios.get('/payment/verify-subscription', {
          params: { userId: user.id }
        });
        
        if (response.data.isSubscribed) {
          await updateUser({ isSubscribed: true });
          Alert.alert(
            'Success!',
            'Welcome to Premium! Enjoy your ad-free experience.',
            [{ text: 'OK', onPress: () => navigation.goBack() }]
          );
        }
      } catch (error) {
        Alert.alert('Error', 'Failed to verify payment');
      } finally {
        setLoading(false);
      }
    }
    
    // Check for cancel URL
    if (url.includes('payment-cancel')) {
      setShowWebView(false);
      Alert.alert('Payment Cancelled', 'Your payment was cancelled');
    }
  };

  if (showWebView) {
    return (
      <View style={styles.webViewContainer}>
        <WebView
          source={{ uri: paymentUrl }}
          onNavigationStateChange={handleWebViewNavigationStateChange}
          startInLoadingState
        />
        <Button
          mode="text"
          onPress={() => setShowWebView(false)}
          style={styles.cancelWebView}
        >
          Cancel Payment
        </Button>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      {/* Premium Banner */}
      <Card style={styles.premiumCard}>
        <Card.Content>
          <Text style={styles.premiumTitle}>Go Premium!</Text>
          <Text style={styles.premiumSubtitle}>One-time payment, lifetime access</Text>
          <View style={styles.priceContainer}>
            <Text style={styles.priceSymbol}>$</Text>
            <Text style={styles.priceAmount}>{SUBSCRIPTION_PRICE}</Text>
            <Text style={styles.priceLabel}>USD</Text>
          </View>
          <Chip style={styles.lifetimeChip} icon="infinity">Lifetime Access</Chip>
        </Card.Content>
      </Card>

      {/* Features */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>Premium Features</Text>
          <List.Section>
            {FEATURES.map((feature, index) => (
              <List.Item
                key={index}
                title={feature.text}
                description={feature.description}
                left={(props) => (
                  <List.Icon {...props} icon={feature.icon} color={theme.colors.primary} />
                )}
                titleStyle={styles.featureTitle}
                descriptionStyle={styles.featureDescription}
              />
            ))}
          </List.Section>
        </Card.Content>
      </Card>

      {/* Payment Methods */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>Choose Payment Method</Text>
          
          <Button
            mode="contained"
            onPress={handleStripePayment}
            style={styles.paymentButton}
            loading={loading && paymentMethod === 'stripe'}
            disabled={loading}
            icon="credit-card"
          >
            Pay with Card (Stripe)
          </Button>

          <Button
            mode="contained"
            onPress={handlePayPalPayment}
            style={[styles.paymentButton, styles.paypalButton]}
            loading={loading && paymentMethod === 'paypal'}
            disabled={loading}
            icon="paypal"
          >
            Pay with PayPal
          </Button>
        </Card.Content>
      </Card>

      {/* Terms */}
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.termsTitle}>Terms & Conditions</Text>
          <Text style={styles.termsText}>
            • One-time payment for lifetime access{'\n'}
            • No recurring charges{'\n'}
            • Instant activation after payment{'\n'}
            • 30-day money-back guarantee{'\n'}
            • Non-transferable license
          </Text>
        </Card.Content>
      </Card>

      {/* Already Subscribed */}
      {user?.isSubscribed && (
        <Card style={[styles.card, styles.subscribedCard]}>
          <Card.Content>
            <Text style={styles.subscribedTitle}>✨ You're Already Premium!</Text>
            <Text style={styles.subscribedText}>
              Thank you for supporting Stop! The Game
            </Text>
          </Card.Content>
        </Card>
      )}
    </ScrollView>
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
  premiumCard: {
    marginBottom: 20,
    elevation: 3,
    borderRadius: 15,
    backgroundColor: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
  },
  premiumTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: theme.colors.primary,
    textAlign: 'center',
    marginBottom: 5,
  },
  premiumSubtitle: {
    fontSize: 14,
    color: '#757575',
    textAlign: 'center',
    marginBottom: 20,
  },
  priceContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'baseline',
    marginBottom: 15,
  },
  priceSymbol: {
    fontSize: 20,
    color: theme.colors.primary,
    marginRight: 5,
  },
  priceAmount: {
    fontSize: 48,
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  priceLabel: {
    fontSize: 16,
    color: '#757575',
    marginLeft: 5,
  },
  lifetimeChip: {
    alignSelf: 'center',
    backgroundColor: '#E8F5E9',
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
  featureTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#212121',
  },
  featureDescription: {
    fontSize: 12,
    color: '#757575',
  },
  paymentButton: {
    marginBottom: 15,
    backgroundColor: theme.colors.primary,
  },
  paypalButton: {
    backgroundColor: '#0070BA',
  },
  termsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#424242',
    marginBottom: 10,
  },
  termsText: {
    fontSize: 12,
    color: '#757575',
    lineHeight: 20,
  },
  subscribedCard: {
    backgroundColor: '#E8F5E9',
    borderColor: theme.colors.primary,
    borderWidth: 2,
  },
  subscribedTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.primary,
    textAlign: 'center',
    marginBottom: 10,
  },
  subscribedText: {
    fontSize: 14,
    color: '#424242',
    textAlign: 'center',
  },
  webViewContainer: {
    flex: 1,
  },
  cancelWebView: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
  },
});

export default PaymentScreen;
