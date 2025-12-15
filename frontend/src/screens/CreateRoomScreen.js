import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, Clipboard } from 'react-native';
import { Text, TextInput, Button, Switch, RadioButton, Card, Chip, Portal, Dialog, ActivityIndicator } from 'react-native-paper';
import { useGame } from '../contexts/GameContext';
import { useLanguage } from '../contexts/LanguageContext';
import { useAuth } from '../contexts/AuthContext';
import theme from '../theme';

const CreateRoomScreen = ({ navigation }) => {
  const [roomName, setRoomName] = useState('');
  const [password, setPassword] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [rounds, setRounds] = useState('3');
  const [loading, setLoading] = useState(false);
  const [roomLanguage, setRoomLanguage] = useState('en');
  const [languagePromptVisible, setLanguagePromptVisible] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState(null);
  const [switchingLanguage, setSwitchingLanguage] = useState(false);
  const { createRoom, getPublicRooms } = useGame();
  const { t, language, changeLanguage } = useLanguage();
  const { updateLanguage: updateUserLanguage } = useAuth() || {};

  useEffect(() => {
    if (language === 'en' || language === 'es') {
      setRoomLanguage(language);
    }
  }, [language]);

  // Auto-generate room name on mount
  useEffect(() => {
    const generateRoomName = async () => {
      const result = await getPublicRooms();
      if (result.success) {
        const roomCount = result.rooms?.length || 0;
        const prefix = t('createRoom.autoRoomNamePrefix');
        setRoomName(`${prefix} ${roomCount + 1}`);
      } else {
        const prefix = t('createRoom.autoRoomNamePrefix');
        setRoomName(`${prefix} 1`);
      }
    };
    generateRoomName();
  }, []);

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      Alert.alert(t('common.error'), t('createRoom.enterRoomName'));
      return;
    }

    if (!isPublic && !password.trim()) {
      Alert.alert(t('common.error'), t('createRoom.privatePasswordRequired'));
      return;
    }

    setLoading(true);
    const result = await createRoom({
      name: roomName,
      password: isPublic ? null : password,
      isPublic,
      rounds: parseInt(rounds),
    });
    setLoading(false);

    if (result.success) {
      // Navigate directly to the room without showing popup
      navigation.navigate('Room', { roomId: result.room.id });
    } else {
      Alert.alert(t('common.error'), result.error);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>{t('createRoom.roomDetails')}</Text>
          
          <TextInput
            label={t('createRoom.roomName')}
            value={roomName}
            onChangeText={setRoomName}
            style={styles.input}
            mode="outlined"
            placeholder={t('createRoom.roomNamePlaceholder')}
            left={<TextInput.Icon icon="home" />}
          />

          <View style={styles.switchContainer}>
            <Text style={styles.switchLabel}>{t('createRoom.publicRoom')}</Text>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              color={theme.colors.primary}
            />
          </View>

          <Text style={styles.label}>{t('createRoom.roomLanguage')}</Text>
          <RadioButton.Group
            onValueChange={(val) => {
              if (val === language) {
                setRoomLanguage(val);
                return;
              }
              setPendingLanguage(val);
              setLanguagePromptVisible(true);
            }}
            value={roomLanguage}
          >
            <View style={styles.radioContainer}>
              <View style={styles.radioItem}>
                <RadioButton value="en" color={theme.colors.primary} />
                <Text>{t('settings.english')}</Text>
              </View>
              <View style={styles.radioItem}>
                <RadioButton value="es" color={theme.colors.primary} />
                <Text>{t('settings.spanish')}</Text>
              </View>
            </View>
          </RadioButton.Group>

          {!isPublic && (
            <TextInput
              label={t('createRoom.roomPassword')}
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              mode="outlined"
              secureTextEntry
              placeholder={t('createRoom.passwordPlaceholder')}
              left={<TextInput.Icon icon="lock" />}
            />
          )}
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>{t('createRoom.gameSettings')}</Text>
          <Text style={styles.label}>{t('createRoom.numberOfRounds')}</Text>
          
          <RadioButton.Group onValueChange={setRounds} value={rounds}>
            <View style={styles.radioContainer}>
              <View style={styles.radioItem}>
                <RadioButton value="1" color={theme.colors.primary} />
                <Text>{t('createRoom.roundQuick')}</Text>
              </View>
              <View style={styles.radioItem}>
                <RadioButton value="3" color={theme.colors.primary} />
                <Text>{t('createRoom.roundNormal')}</Text>
              </View>
              <View style={styles.radioItem}>
                <RadioButton value="6" color={theme.colors.primary} />
                <Text>{t('createRoom.roundExtended')}</Text>
              </View>
              <View style={styles.radioItem}>
                <RadioButton value="9" color={theme.colors.primary} />
                <Text>{t('createRoom.roundMarathon')}</Text>
              </View>
            </View>
          </RadioButton.Group>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>{t('createRoom.roomFeatures')}</Text>
          <View style={styles.featuresContainer}>
            <Chip icon="timer" style={styles.chip}>{t('createRoom.timePerRound')}</Chip>
            <Chip icon="account-group" style={styles.chip}>{t('createRoom.playersRange')}</Chip>
            <Chip icon="robot" style={styles.chip}>{t('createRoom.aiValidation')}</Chip>
            <Chip icon="trophy" style={styles.chip}>{t('createRoom.leaderboard')}</Chip>
          </View>
        </Card.Content>
      </Card>

      <Button
        mode="contained"
        onPress={handleCreateRoom}
        style={styles.createButton}
        loading={loading}
        disabled={loading}
        contentStyle={styles.buttonContent}
        icon="plus"
      >
        {t('createRoom.createRoom')}
      </Button>

      <Portal>
        <Dialog
          visible={languagePromptVisible}
          onDismiss={() => {
            if (switchingLanguage) return;
            setPendingLanguage(null);
            setRoomLanguage(language);
            setLanguagePromptVisible(false);
          }}
        >
          <Dialog.Title>{t('createRoom.switchLanguagePromptTitle')}</Dialog.Title>
          <Dialog.Content>
            <Text>
              {t('createRoom.switchLanguagePromptMessage', {
                language: pendingLanguage === 'es' ? t('settings.spanish') : t('settings.english')
              })}
            </Text>
            {switchingLanguage && (
              <View style={{ marginTop: 12 }}>
                <ActivityIndicator />
              </View>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => {
                setPendingLanguage(null);
                setRoomLanguage(language);
                setLanguagePromptVisible(false);
              }}
              disabled={switchingLanguage}
            >
              {t('common.cancel')}
            </Button>
            <Button
              onPress={async () => {
                const target = pendingLanguage;
                if (!target) return;
                setSwitchingLanguage(true);
                try {
                  await changeLanguage(target);
                  if (updateUserLanguage) {
                    const res = await updateUserLanguage(target);
                    if (!res?.success) throw new Error(res?.error || 'failed');
                  }
                  setRoomLanguage(target);
                  setLanguagePromptVisible(false);
                } catch (e) {
                  Alert.alert(t('common.error'), t('menu.languageSwitchFailed'));
                  setRoomLanguage(language);
                } finally {
                  setSwitchingLanguage(false);
                  setPendingLanguage(null);
                }
              }}
              disabled={switchingLanguage}
            >
              {t('createRoom.switchLanguageAndCreate')}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
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
  input: {
    marginBottom: 15,
    backgroundColor: '#FFFFFF',
  },
  switchContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 15,
    paddingVertical: 10,
  },
  switchLabel: {
    fontSize: 16,
    color: '#424242',
  },
  label: {
    fontSize: 14,
    color: '#757575',
    marginBottom: 10,
  },
  radioContainer: {
    marginTop: 5,
  },
  radioItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  featuresContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 5,
  },
  chip: {
    margin: 5,
    backgroundColor: '#E8F5E9',
  },
  createButton: {
    marginTop: 10,
    backgroundColor: theme.colors.primary,
    elevation: 5,
  },
  buttonContent: {
    paddingVertical: 10,
  },
});

export default CreateRoomScreen;
