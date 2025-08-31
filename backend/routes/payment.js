const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const paypal = require('@paypal/checkout-server-sdk');
const { authMiddleware } = require('../middleware/auth');
const User = require('../models/User');

// PayPal environment setup
const environment = process.env.NODE_ENV === 'production'
  ? new paypal.core.LiveEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_CLIENT_SECRET)
  : new paypal.core.SandboxEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_CLIENT_SECRET);

const paypalClient = new paypal.core.PayPalHttpClient(environment);

// Create Stripe checkout session
router.post('/stripe/create-checkout', authMiddleware, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Stop! The Game - Lifetime Subscription',
            description: 'Unlimited ad-free gameplay and exclusive features'
          },
          unit_amount: 299 // $2.99 in cents
        },
        quantity: 1
      }],
      mode: 'payment',
      success_url: `${process.env.CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_URL}/payment/cancel`,
      metadata: {
        userId: req.user._id.toString()
      }
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ message: 'Error creating checkout session' });
  }
});

// Verify Stripe payment
router.post('/stripe/verify', authMiddleware, async (req, res) => {
  try {
    const { sessionId } = req.body;

    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid' && session.metadata.userId === req.user._id.toString()) {
      const user = await User.findById(req.user._id);
      user.subscribed = true;
      user.subscriptionId = session.id;
      await user.save();

      res.json({ 
        success: true, 
        message: 'Subscription activated successfully' 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'Payment not verified' 
      });
    }
  } catch (error) {
    console.error('Stripe verify error:', error);
    res.status(500).json({ message: 'Error verifying payment' });
  }
});

// Create PayPal order
router.post('/paypal/create-order', authMiddleware, async (req, res) => {
  try {
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer('return=representation');
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: 'USD',
          value: '2.99'
        },
        description: 'Stop! The Game - Lifetime Subscription'
      }],
      application_context: {
        return_url: `${process.env.CLIENT_URL}/payment/success`,
        cancel_url: `${process.env.CLIENT_URL}/payment/cancel`
      }
    });

    const order = await paypalClient.execute(request);

    res.json({ 
      orderId: order.result.id,
      approveUrl: order.result.links.find(link => link.rel === 'approve').href
    });
  } catch (error) {
    console.error('PayPal create order error:', error);
    res.status(500).json({ message: 'Error creating PayPal order' });
  }
});

// Capture PayPal order
router.post('/paypal/capture-order', authMiddleware, async (req, res) => {
  try {
    const { orderId } = req.body;

    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});

    const capture = await paypalClient.execute(request);

    if (capture.result.status === 'COMPLETED') {
      const user = await User.findById(req.user._id);
      user.subscribed = true;
      user.subscriptionId = orderId;
      await user.save();

      res.json({ 
        success: true, 
        message: 'Subscription activated successfully' 
      });
    } else {
      res.status(400).json({ 
        success: false, 
        message: 'Payment not completed' 
      });
    }
  } catch (error) {
    console.error('PayPal capture error:', error);
    res.status(500).json({ message: 'Error capturing payment' });
  }
});

// Get subscription status
router.get('/subscription-status', authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    
    res.json({
      subscribed: user.subscribed,
      subscriptionId: user.subscriptionId
    });
  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({ message: 'Error fetching subscription status' });
  }
});

module.exports = router;
