import React, { useEffect, useMemo, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Card, Text, TextInput } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useSocket } from '../contexts/SocketContext';
import theme from '../theme';

const MAX_MESSAGES = 200;

const ChatZoneScreen = ({ navigation }) => {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { socket, connected, isAuthenticated, joinGlobalChat, leaveGlobalChat, sendGlobalMessage } = useSocket();

  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const inputRef = useRef(null);
  const messagesRef = useRef(null);

  const canChat = useMemo(() => !!(connected && isAuthenticated), [connected, isAuthenticated]);

  useEffect(() => {
    navigation.setOptions({
      title: t('chatZone.title'),
    });
  }, [navigation, t]);

  useEffect(() => {
    if (!canChat) return;

    try {
      if (typeof joinGlobalChat === 'function') {
        joinGlobalChat();
      } else if (socket) {
        socket.emit('join-global-chat');
      }
    } catch (e) {}

    return () => {
      try {
        if (typeof leaveGlobalChat === 'function') {
          leaveGlobalChat();
        } else if (socket) {
          socket.emit('leave-global-chat');
        }
      } catch (e) {}
    };
  }, [socket, canChat, joinGlobalChat, leaveGlobalChat]);

  useEffect(() => {
    if (!socket) return;

    const handleGlobalNewMessage = (data) => {
      const displayName = data?.displayName || data?.username || user?.displayName || user?.username || t('gameplay.player');
      const text = data?.message;
      if (!text) return;

      setMessages((prev) => {
        const next = [...prev, { type: 'chat', displayName, text }];
        if (next.length > MAX_MESSAGES) return next.slice(next.length - MAX_MESSAGES);
        return next;
      });
    };

    socket.on('global-new-message', handleGlobalNewMessage);

    return () => {
      socket.off('global-new-message', handleGlobalNewMessage);
    };
  }, [socket, user, t]);

  const handleMessagesScroll = (e) => {
    const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
    const paddingToBottom = 16;
    const atBottom = layoutMeasurement.height + contentOffset.y >= contentSize.height - paddingToBottom;
    setIsAtBottom(atBottom);
  };

  const handleMessagesContentSizeChange = () => {
    if (isAtBottom) {
      messagesRef.current?.scrollToEnd({ animated: true });
    }
  };

  const handleSendMessage = () => {
    const wasFocused = inputFocused;
    const msg = messageInput.trim();
    if (!msg) return;

    try {
      if (typeof sendGlobalMessage === 'function') {
        sendGlobalMessage(msg);
      } else if (socket) {
        socket.emit('global-send-message', { message: msg });
      }
    } catch (e) {}

    setMessageInput('');

    if (wasFocused) {
      setTimeout(() => {
        inputRef.current?.focus?.();
      }, 0);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      <View style={styles.container}>
        <Card style={styles.card}>
          <Card.Content>
            <View style={styles.headerRow}>
              <Text style={styles.title}>{t('chatZone.welcome')}</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: canChat ? '#95C159' : '#F44336' }]} />
                <Text style={styles.statusText}>{canChat ? t('menu.connected') : t('menu.disconnected')}</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <ScrollView
              ref={messagesRef}
              style={styles.messagesContainer}
              contentContainerStyle={styles.messagesContentContainer}
              keyboardShouldPersistTaps="always"
              keyboardDismissMode="none"
              nestedScrollEnabled
              onScroll={handleMessagesScroll}
              scrollEventThrottle={16}
              onContentSizeChange={handleMessagesContentSizeChange}
              showsVerticalScrollIndicator
            >
              {messages.length === 0 ? (
                <Text style={styles.emptyText}>{t('chatZone.empty')}</Text>
              ) : (
                messages.map((msg, index) => (
                  <View key={index} style={styles.message}>
                    <Text style={styles.chatMessage}>
                      <Text style={styles.chatUsername}>{msg.displayName}: </Text>
                      {msg.text}
                    </Text>
                  </View>
                ))
              )}
            </ScrollView>

            <View style={styles.chatInput}>
              <TextInput
                ref={inputRef}
                value={messageInput}
                onChangeText={setMessageInput}
                onFocus={() => setInputFocused(true)}
                onBlur={() => setInputFocused(false)}
                placeholder={t('chatZone.typeMessage')}
                style={styles.messageInput}
                mode="outlined"
                dense
                blurOnSubmit={false}
                returnKeyType="send"
                onSubmitEditing={handleSendMessage}
                disabled={!canChat}
                right={
                  <TextInput.Icon
                    icon="send"
                    onPress={handleSendMessage}
                    disabled={!canChat || !messageInput.trim()}
                  />
                }
              />
            </View>
          </Card.Content>
        </Card>

        {!canChat && (
          <Text style={styles.footerHint}>{t('chatZone.notConnectedHint')}</Text>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#F5F5F5',
  },
  card: {
    marginBottom: 12,
    borderRadius: 16,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#212121',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: '#757575',
  },
  messagesContainer: {
    height: 420,
    backgroundColor: '#FAFAFA',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  messagesContentContainer: {
    paddingBottom: 10,
  },
  message: {
    marginBottom: 8,
  },
  chatMessage: {
    fontSize: 14,
    color: '#212121',
  },
  chatUsername: {
    fontWeight: 'bold',
    color: theme.colors.primary,
  },
  emptyText: {
    color: '#757575',
    textAlign: 'center',
    marginTop: 18,
  },
  chatInput: {
    marginTop: 12,
  },
  messageInput: {
    backgroundColor: '#FFFFFF',
  },
  footerHint: {
    marginTop: 4,
    color: '#757575',
    textAlign: 'center',
    fontSize: 12,
  },
});

export default ChatZoneScreen;
