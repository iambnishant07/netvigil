import { render } from '@testing-library/react-native';
import App from '../App';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn(() => () => {}),
  fetch:            jest.fn().mockResolvedValue({ isConnected: true }),
}));

jest.mock('expo-secure-store', () => ({
  getItemAsync:    jest.fn().mockResolvedValue(null),
  setItemAsync:    jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync:  jest.fn().mockResolvedValue(false),
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('expo-notifications', () => ({
  setNotificationHandler:  jest.fn(),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync:   jest.fn().mockResolvedValue({ data: 'ExponentPushToken[test]' }),
}));

jest.mock('../src/navigation/RootNavigator', () => () => null);

jest.mock('@react-navigation/native', () => {
  const actual = jest.requireActual('@react-navigation/native') as Record<string, unknown>;
  return {
    ...actual,
    NavigationContainer: ({ children }: { children: React.ReactNode }) => children,
  };
});

describe('App', () => {
  it('renders without crashing', () => {
    render(<App />);
  });
});
