import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Alert, Clipboard } from 'react-native';
import { Text, TextInput, Button, Switch, RadioButton, Card, Chip } from 'react-native-paper';
import { useGame } from '../contexts/GameContext';
import theme from '../theme';

const CreateRoomScreen = ({ navigation }) => {
  const [roomName, setRoomName] = useState('');
  const [password, setPassword] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [rounds, setRounds] = useState('3');
  const [loading, setLoading] = useState(false);
  const { createRoom } = useGame();

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      Alert.alert('Error', 'Please enter a room name');
      return;
    }

    if (!isPublic && !password.trim()) {
      Alert.alert('Error', 'Private rooms require a password');
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
      navigation.replace('Room', { roomId: result.room.id });
    } else {
      Alert.alert('Error', result.error);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>Room Details</Text>
          
          <TextInput
            label="Room Name"
            value={roomName}
            onChangeText={setRoomName}
            style={styles.input}
            mode="outlined"
            placeholder="Enter a creative room name"
            left={<TextInput.Icon icon="home" />}
          />

          <View style={styles.switchContainer}>
            <Text style={styles.switchLabel}>Public Room</Text>
            <Switch
              value={isPublic}
              onValueChange={setIsPublic}
              color={theme.colors.primary}
            />
          </View>

          {!isPublic && (
            <TextInput
              label="Room Password"
              value={password}
              onChangeText={setPassword}
              style={styles.input}
              mode="outlined"
              secureTextEntry
              placeholder="Set a password for private room"
              left={<TextInput.Icon icon="lock" />}
            />
          )}
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>Game Settings</Text>
          <Text style={styles.label}>Number of Rounds</Text>
          
          <RadioButton.Group onValueChange={setRounds} value={rounds}>
            <View style={styles.radioContainer}>
              <View style={styles.radioItem}>
                <RadioButton value="1" color={theme.colors.primary} />
                <Text>1 Round (Quick)</Text>
              </View>
              <View style={styles.radioItem}>
                <RadioButton value="3" color={theme.colors.primary} />
                <Text>3 Rounds (Normal)</Text>
              </View>
              <View style={styles.radioItem}>
                <RadioButton value="6" color={theme.colors.primary} />
                <Text>6 Rounds (Extended)</Text>
              </View>
              <View style={styles.radioItem}>
                <RadioButton value="9" color={theme.colors.primary} />
                <Text>9 Rounds (Marathon)</Text>
              </View>
            </View>
          </RadioButton.Group>
        </Card.Content>
      </Card>

      <Card style={styles.card}>
        <Card.Content>
          <Text style={styles.sectionTitle}>Room Features</Text>
          <View style={styles.featuresContainer}>
            <Chip icon="timer" style={styles.chip}>60s per round</Chip>
            <Chip icon="account-group" style={styles.chip}>2-8 players</Chip>
            <Chip icon="robot" style={styles.chip}>AI validation</Chip>
            <Chip icon="trophy" style={styles.chip}>Leaderboard</Chip>
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
        Create Room
      </Button>
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
