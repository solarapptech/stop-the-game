import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import axios from 'axios';
import { ActivityIndicator, Button, Card, Menu, Text, TextInput } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useSocket } from '../contexts/SocketContext';
import theme from '../theme';

const MAX_MESSAGES = 300;
const PAGE_SIZE = 50;

const ChatZoneScreen = ({ navigation }) => {
  const { user } = useAuth();
  const { t, language: uiLanguage } = useLanguage();
  const { socket, connected, isAuthenticated, joinGlobalChat, leaveGlobalChat, sendGlobalMessage } = useSocket();

  const [messages, setMessages] = useState([]);
  const [messageInput, setMessageInput] = useState('');
  const [inputFocused, setInputFocused] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const [chatLanguage, setChatLanguage] = useState(uiLanguage === 'es' ? 'es' : 'en');
  const [languageMenuVisible, setLanguageMenuVisible] = useState(false);

  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoadingMore, setHistoryLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextBefore, setNextBefore] = useState(null);

  const inputRef = useRef(null);
  const messagesRef = useRef(null);
  const seenIdsRef = useRef(new Set());

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
        joinGlobalChat(chatLanguage);
      } else if (socket) {
        socket.emit('join-global-chat', { language: chatLanguage });
      }
    } catch (e) {}

    return () => {
      try {
        if (typeof leaveGlobalChat === 'function') {
          leaveGlobalChat(chatLanguage);
        } else if (socket) {
          socket.emit('leave-global-chat', { language: chatLanguage });
        }
      } catch (e) {}
    };
  }, [socket, canChat, chatLanguage, joinGlobalChat, leaveGlobalChat]);

  const mergeMessages = ({ newer, older }) => {
    setMessages((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      const addList = Array.isArray(newer) ? newer : (Array.isArray(older) ? older : []);
      if (addList.length === 0) return current;

      const result = older ? [...addList, ...current] : [...current, ...addList];
      if (result.length > MAX_MESSAGES) {
        return result.slice(result.length - MAX_MESSAGES);
      }
      return result;
    });
  };

  const fetchHistory = async ({ before, appendOlder }) => {
    if (!canChat) return;
    if (appendOlder) {
      if (historyLoadingMore) return;
      setHistoryLoadingMore(true);
    } else {
      if (historyLoading) return;
      setHistoryLoading(true);
    }

    try {
      const params = {
        language: chatLanguage,
        limit: PAGE_SIZE,
      };
      if (before) params.before = before;

      const res = await axios.get('chat/global', { params });
      const payload = res?.data || {};
      const page = Array.isArray(payload.messages) ? payload.messages : [];

      if (!appendOlder) {
        seenIdsRef.current = new Set();
        setMessages([]);
      }

      const normalized = page
        .map((m) => ({
          id: m?.id ? String(m.id) : undefined,
          type: 'chat',
          displayName: m?.displayName || m?.username || t('gameplay.player'),
          text: m?.message || '',
          createdAt: m?.createdAt ? new Date(m.createdAt) : null,
        }))
        .filter((m) => m.text);

      const deduped = [];
      for (const msg of normalized) {
        if (msg.id && seenIdsRef.current.has(msg.id)) continue;
        if (msg.id) seenIdsRef.current.add(msg.id);
        deduped.push(msg);
      }

      if (appendOlder) {
        mergeMessages({ older: deduped });
      } else {
        mergeMessages({ newer: deduped });
      }

      setHasMore(!!payload.hasMore);
      setNextBefore(payload.nextBefore || null);

      setTimeout(() => {
        try {
          messagesRef.current?.scrollToEnd?.({ animated: false });
        } catch (e) {}
      }, 0);
    } catch (e) {
      if (!appendOlder) {
        setMessages([]);
        setHasMore(false);
        setNextBefore(null);
      }
    } finally {
      if (appendOlder) setHistoryLoadingMore(false);
      else setHistoryLoading(false);
    }
  };

  useEffect(() => {
    if (!canChat) return;
    fetchHistory({ before: null, appendOlder: false });
  }, [canChat, chatLanguage]);

  useEffect(() => {
    if (!socket) return;

    const handleGlobalNewMessage = (data) => {
      const id = data?.id ? String(data.id) : undefined;
      if (id && seenIdsRef.current.has(id)) return;
      if (id) seenIdsRef.current.add(id);

      const displayName = data?.displayName || data?.username || user?.displayName || user?.username || t('gameplay.player');
      const text = data?.message;
      if (!text) return;

      mergeMessages({ newer: [{ id, type: 'chat', displayName, text, createdAt: data?.createdAt ? new Date(data.createdAt) : null }] });
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
        sendGlobalMessage(chatLanguage, msg);
      } else if (socket) {
        socket.emit('global-send-message', { language: chatLanguage, message: msg });
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
      <Pressable
        style={{ flex: 1 }}
        onPress={() => {
          setLanguageMenuVisible(false);
          Keyboard.dismiss();
        }}
      >
        <View style={styles.container}>
          <Card style={styles.card}>
            <Card.Content>
              <View style={styles.headerRow}>
                <Text style={styles.title}>{t('chatZone.welcome')}</Text>
                <View style={styles.headerRight}>
                  <View style={styles.statusRow}>
                    <View style={[styles.statusDot, { backgroundColor: canChat ? '#95C159' : '#F44336' }]} />
                    <Text style={styles.statusText}>{canChat ? t('menu.connected') : t('menu.disconnected')}</Text>
                  </View>
                  <Menu
                    visible={languageMenuVisible}
                    onDismiss={() => setLanguageMenuVisible(false)}
                    anchor={
                      <Button
                        mode="outlined"
                        onPress={() => setLanguageMenuVisible(true)}
                        textColor={theme.colors.primary}
                        style={styles.languageButton}
                        disabled={historyLoading || historyLoadingMore}
                      >
                        {(chatLanguage === 'es') ? t('settings.spanish') : t('settings.english')}
                      </Button>
                    }
                  >
                    <Menu.Item
                      onPress={() => {
                        setLanguageMenuVisible(false);
                        setChatLanguage('en');
                      }}
                      title={t('settings.english')}
                    />
                    <Menu.Item
                      onPress={() => {
                        setLanguageMenuVisible(false);
                        setChatLanguage('es');
                      }}
                      title={t('settings.spanish')}
                    />
                  </Menu>
                </View>
              </View>
            </Card.Content>
          </Card>

          <Card style={[styles.card, styles.chatCard]}>
            <Card.Content>
              <Pressable
                style={{ flex: 1 }}
                onPress={() => {
                  setLanguageMenuVisible(false);
                }}
              >
                <View style={styles.historyRow}>
                  <Button
                    mode="outlined"
                    onPress={() => fetchHistory({ before: nextBefore, appendOlder: true })}
                    disabled={!canChat || !hasMore || historyLoading || historyLoadingMore}
                    textColor={theme.colors.primary}
                    style={styles.loadMoreButton}
                  >
                    {t('chatZone.loadPrevious')}
                  </Button>
                  {(historyLoading || historyLoadingMore) && (
                    <ActivityIndicator size={16} color={theme.colors.primary} />
                  )}
                </View>

                <ScrollView
                  ref={messagesRef}
                  style={styles.messagesContainer}
                  contentContainerStyle={styles.messagesContentContainer}
                  keyboardShouldPersistTaps="always"
                  keyboardDismissMode="on-drag"
                  nestedScrollEnabled
                  onTouchStart={() => {
                    Keyboard.dismiss();
                  }}
                  onScroll={handleMessagesScroll}
                  scrollEventThrottle={16}
                  onContentSizeChange={handleMessagesContentSizeChange}
                  showsVerticalScrollIndicator
                >
                  {messages.length === 0 ? (
                    <Text style={styles.emptyText}>{t('chatZone.empty')}</Text>
                  ) : (
                    messages.map((msg, index) => (
                      <View key={msg.id || index} style={styles.message}>
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
              </Pressable>
            </Card.Content>
          </Card>

          {!canChat && (
            <Text style={styles.footerHint}>{t('chatZone.notConnectedHint')}</Text>
          )}
        </View>
      </Pressable>
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
  chatCard: {
    flex: 1,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
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
  languageButton: {
    marginLeft: 10,
    borderColor: theme.colors.primary,
  },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  loadMoreButton: {
    borderColor: theme.colors.primary,
  },
  messagesContainer: {
    flex: 1,
    minHeight: 240,
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
