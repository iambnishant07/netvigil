import { createNativeStackNavigator } from '@react-navigation/native-stack';
import LoginScreen from '../screens/LoginScreen';
import RegisterScreen from '../screens/RegisterScreen';
import MfaChallengeScreen from '../screens/MfaChallengeScreen';
import GoogleOrgSelectScreen from '../screens/GoogleOrgSelectScreen';

export type AuthStackParamList = {
  Login:           undefined;
  Register:        undefined;
  MfaChallenge:    { mfaToken: string };
  GoogleOrgSelect: { googleSessionToken: string; email: string };
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

const HEADER = { headerStyle: { backgroundColor: '#1e293b' }, headerTintColor: '#e2e8f0' };

export default function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Login"           component={LoginScreen} />
      <Stack.Screen name="Register"        component={RegisterScreen} />
      <Stack.Screen name="MfaChallenge"    component={MfaChallengeScreen}
        options={{ ...HEADER, headerShown: true, title: 'Two-factor auth' }} />
      <Stack.Screen name="GoogleOrgSelect" component={GoogleOrgSelectScreen}
        options={{ ...HEADER, headerShown: true, title: 'Complete sign-in' }} />
    </Stack.Navigator>
  );
}
