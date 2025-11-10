import 'react-native-gesture-handler';
import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import { Provider as PaperProvider } from 'react-native-paper';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
// removed expo-font usage because font files were not present in assets/fonts

// Screens
import LoadingScreen from './src/screens/LoadingScreen';
import LoginScreen from './src/screens/LoginScreen';
import RegisterScreen from './src/screens/RegisterScreen';
import VerifyScreen from './src/screens/VerifyScreen';
import UsernameSetupScreen from './src/screens/UsernameSetupScreen';
import MenuScreen from './src/screens/MenuScreen';
import CreateRoomScreen from './src/screens/CreateRoomScreen';
import JoinRoomScreen from './src/screens/JoinRoomScreen';
import RoomScreen from './src/screens/RoomScreen';
import GameplayScreen from './src/screens/GameplayScreen';
import LeaderboardScreen from './src/screens/LeaderboardScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import PaymentScreen from './src/screens/PaymentScreen';

// Contexts
import { AuthProvider } from './src/contexts/AuthContext';
import { SocketProvider } from './src/contexts/SocketContext';
import { GameProvider } from './src/contexts/GameContext';
import { LanguageProvider } from './src/contexts/LanguageContext';

// Theme
import theme from './src/theme';

const Stack = createStackNavigator();

// Keep splash screen visible while loading
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [isReady, setIsReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [initialRoute, setInitialRoute] = useState('Loading');

  useEffect(() => {
    async function prepare() {
      try {
        // NOTE: font files were not present under ./assets/fonts. To avoid Metro
        // requiring missing modules at bundle time we skip loading custom fonts
        // here and rely on the platform/default fonts. If you add the font
        // files later, re-introduce Font.loadAsync with proper requires.

        // Check authentication status
        const token = await AsyncStorage.getItem('authToken');
        const user = await AsyncStorage.getItem('user');
        
        if (token && user) {
          setIsAuthenticated(true);
          setInitialRoute('Menu');
        } else {
          setInitialRoute('Login');
        }
      } catch (e) {
        console.warn(e);
      } finally {
        setIsReady(true);
        await SplashScreen.hideAsync();
      }
    }

    prepare();
  }, []);

  if (!isReady) {
    return null;
  }

  return (
    <PaperProvider theme={theme}>
      <LanguageProvider>
        <AuthProvider>
          <SocketProvider>
            <GameProvider>
              <NavigationContainer>
              <Stack.Navigator 
                initialRouteName={initialRoute}
                screenOptions={{
                  headerStyle: {
                    backgroundColor: theme.colors.primary,
                  },
                  headerTintColor: '#fff',
                  headerTitleStyle: {
                    fontWeight: 'bold',
                  },
                }}
              >
                <Stack.Screen 
                  name="Loading" 
                  component={LoadingScreen} 
                  options={{ headerShown: false }}
                />
                <Stack.Screen 
                  name="Login" 
                  component={LoginScreen} 
                  options={{ headerShown: false }}
                />
                <Stack.Screen 
                  name="Register" 
                  component={RegisterScreen} 
                  options={{ 
                    title: 'Create Account',
                    headerLeft: null 
                  }}
                />
                <Stack.Screen 
                  name="UsernameSetup" 
                  component={UsernameSetupScreen} 
                  options={{ 
                    title: 'Set Username',
                    headerLeft: null 
                  }}
                />
                <Stack.Screen 
                  name="Verify" 
                  component={VerifyScreen} 
                  options={{ 
                    title: 'Verify Email',
                    headerLeft: null 
                  }}
                />
                <Stack.Screen 
                  name="Menu" 
                  component={MenuScreen} 
                  options={{ 
                    title: 'Stop! The Game',
                    headerLeft: null 
                  }}
                />
                <Stack.Screen 
                  name="CreateRoom" 
                  component={CreateRoomScreen} 
                  options={{ title: 'Create Room' }}
                />
                <Stack.Screen 
                  name="JoinRoom" 
                  component={JoinRoomScreen} 
                  options={{ title: 'Join Room' }}
                />
                <Stack.Screen 
                  name="Room" 
                  component={RoomScreen} 
                  options={{ title: 'Game Room' }}
                />
                <Stack.Screen 
                  name="Gameplay" 
                  component={GameplayScreen} 
                  options={{ 
                    headerShown: false,
                    gestureEnabled: false 
                  }}
                />
                <Stack.Screen 
                  name="Leaderboard" 
                  component={LeaderboardScreen} 
                  options={{ title: 'Leaderboard' }}
                />
                <Stack.Screen 
                  name="Settings" 
                  component={SettingsScreen} 
                  options={{ title: 'Settings' }}
                />
                <Stack.Screen 
                  name="Payment" 
                  component={PaymentScreen} 
                  options={{ title: 'Subscribe' }}
                />
              </Stack.Navigator>
            </NavigationContainer>
          </GameProvider>
        </SocketProvider>
      </AuthProvider>
      </LanguageProvider>
    </PaperProvider>
  );
}
