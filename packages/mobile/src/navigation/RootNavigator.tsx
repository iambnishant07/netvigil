import { ActivityIndicator, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useAuth } from '../contexts/auth-context';
import AuthNavigator from './AuthNavigator';
import AppNavigator from './AppNavigator';
import PendingScreen from '../screens/PendingScreen';
import OfflineBanner from '../components/OfflineBanner';

type RootStackParamList = {
  Auth:    undefined;
  App:     undefined;
  Pending: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  const { isAuthenticated, isPending, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#6366f1" />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <OfflineBanner />
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          {!isAuthenticated ? (
            <Stack.Screen name="Auth"    component={AuthNavigator} />
          ) : isPending ? (
            <Stack.Screen name="Pending" component={PendingScreen} />
          ) : (
            <Stack.Screen name="App"     component={AppNavigator} />
          )}
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
