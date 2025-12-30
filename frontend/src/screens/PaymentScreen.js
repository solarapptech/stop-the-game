import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Platform } from 'react-native';
import { Text, Card, Button, List, Chip } from 'react-native-paper';
import { WebView } from 'react-native-webview';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import axios from 'axios';
import theme from '../theme';

const PaymentScreen = ({ navigation }) => {
  const { user, updateUser } = useAuth();
  const { t } = useLanguage();
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(null);
  const [showWebView, setShowWebView] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState('');

  const SUBSCRIPTION_PRICE = 9.99;
  const getFeatures = () => [
    { icon: 'close-circle', text: t('payment.noAds'), description: t('payment.noAdsDesc') },
    { icon: 'crown', text: t('payment.premiumBadge'), description: t('payment.premiumBadgeDesc') },
    { icon: 'rocket', text: t('payment.earlyAccess'), description: t('payment.earlyAccessDesc') },
    { icon: 'palette', text: t('payment.customThemes'), description: t('payment.customThemesDesc') },
    { icon: 'infinity', text: t('payment.unlimitedRooms'), description: t('payment.unlimitedRoomsDesc') },
    { icon: 'star', text: t('payment.prioritySupport'), description: t('payment.prioritySupportDesc') },
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
      Alert.alert(t('common.error'), t('payment.failedToInitiate'));
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
      Alert.alert(t('common.error'), t('payment.failedToInitiatePayPal'));
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
            t('common.success'),
            t('payment.welcomePremium'),
            [{ text: t('common.ok'), onPress: () => navigation.goBack() }]
          );
        }
      } catch (error) {
        Alert.alert(t('common.error'), t('payment.failedToVerify'));
      } finally {
        setLoading(false);
      }
    }
    
    // Check for cancel URL
    if (url.includes('payment-cancel')) {
      setShowWebView(false);
      Alert.alert(t('payment.paymentCancelled'), t('payment.paymentCancelledDesc'));
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
          {t('payment.cancelPayment')}
        </Button>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <View style={styles.maxWidthContent}>
        {/* Premium Banner */}
        <Card style={styles.premiumCard}>
          <Card.Content>
            <Text style={styles.premiumTitle}>{t('payment.goPremium')}</Text>
            <Text style={styles.premiumSubtitle}>{t('payment.oneTimePayment')}</Text>
            <View style={styles.priceContainer}>
              <Text style={styles.priceSymbol}>$</Text>
              <Text style={styles.priceAmount}>{SUBSCRIPTION_PRICE}</Text>
              <Text style={styles.priceLabel}>USD</Text>
            </View>
            <Chip style={styles.lifetimeChip} icon="infinity">{t('payment.lifetimeAccess')}</Chip>
          </Card.Content>
        </Card>

        {/* Features */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>{t('payment.premiumFeatures')}</Text>
            <List.Section>
              {getFeatures().map((feature, index) => (
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
            <Text style={styles.sectionTitle}>{t('payment.choosePaymentMethod')}</Text>
            
            <Button
              mode="contained"
              onPress={handleStripePayment}
              style={styles.paymentButton}
              loading={loading && paymentMethod === 'stripe'}
              disabled={loading}
              icon="credit-card"
            >
              {t('payment.payWithCard')}
            </Button>

            <Button
              mode="contained"
              onPress={handlePayPalPayment}
              style={[styles.paymentButton, styles.paypalButton]}
              loading={loading && paymentMethod === 'paypal'}
              disabled={loading}
              icon="paypal"
            >
              {t('payment.payWithPayPal')}
            </Button>
          </Card.Content>
        </Card>

        {/* Terms */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.termsTitle}>{t('payment.termsTitle')}</Text>
            <Text style={styles.termsText}>
              {t('payment.termsText')}
            </Text>
          </Card.Content>
        </Card>

        {/* Already Subscribed */}
        {user?.isSubscribed && (
          <Card style={[styles.card, styles.subscribedCard]}>
            <Card.Content>
              <Text style={styles.subscribedTitle}>{t('payment.alreadyPremium')}</Text>
              <Text style={styles.subscribedText}>
                {t('payment.thankYou')}
              </Text>
            </Card.Content>
          </Card>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    ...(Platform.OS === 'web' && { overflowY: 'auto' }),
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 30,
  },
  maxWidthContent: {
    width: '100%',
    maxWidth: theme.layout?.maxContentWidth || 1100,
    alignSelf: 'center',
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
