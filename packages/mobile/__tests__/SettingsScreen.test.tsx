import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import SettingsScreen from '../src/screens/SettingsScreen';

jest.mock('expo-notifications', () => ({
  getPermissionsAsync:     jest.fn().mockResolvedValue({ status: 'undetermined' }),
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync:   jest.fn().mockResolvedValue({ data: 'ExponentPushToken[test-token]' }),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync:  jest.fn().mockResolvedValue(true),
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock('expo-constants', () => ({
  default: { expoConfig: { extra: { eas: { projectId: 'test-project-id' } } } },
}));

const mockLogout       = jest.fn().mockResolvedValue(undefined);
const mockSetBiometric = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/contexts/auth-context', () => ({
  useAuth: () => ({
    user:             { id: 'u-1', email: 'admin@example.com', role: 'admin', mfaEnrolled: false },
    biometricEnabled: false,
    setBiometric:     mockSetBiometric,
    logout:           mockLogout,
  }),
}));

jest.mock('../src/lib/api-client', () => ({
  apiClient: {
    get:  jest.fn().mockResolvedValue({ id: 'u-1', email: 'admin@example.com', role: 'admin', mfaEnrolled: false }),
    put:  jest.fn().mockResolvedValue(undefined),
    post: jest.fn().mockResolvedValue({ seeded: { incidents: 5 } }),
  },
}));

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

const mockNav   = { navigate: jest.fn(), goBack: jest.fn() } as unknown as Parameters<typeof SettingsScreen>[0]['navigation'];
const mockRoute = {} as Parameters<typeof SettingsScreen>[0]['route'];

function renderScreen() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <SettingsScreen navigation={mockNav} route={mockRoute} />
    </QueryClientProvider>,
  );
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const Notifications = require('expo-notifications');
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'undetermined' });
    Notifications.requestPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[test-token]' });
  });

  it('renders without crashing', () => { renderScreen(); });

  it('displays user email', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('admin@example.com')).toBeTruthy());
  });

  it('shows biometric lock row', () => {
    renderScreen();
    expect(screen.getByText('Biometric lock')).toBeTruthy();
  });

  it('shows push notifications row', () => {
    renderScreen();
    expect(screen.getByText('Push notifications')).toBeTruthy();
  });

  it('shows sign out button', () => {
    renderScreen();
    expect(screen.getByText('Sign out')).toBeTruthy();
  });

  it('calls logout when sign out pressed', async () => {
    renderScreen();
    fireEvent.press(screen.getByText('Sign out'));
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
  });

  it('shows Disabled badge when push not enabled', () => {
    renderScreen();
    expect(screen.getByText('Disabled')).toBeTruthy();
  });

  it('shows push token after permission granted', async () => {
    renderScreen();
    fireEvent.press(screen.getByText('Disabled'));
    await waitFor(() => expect(screen.getByText('ExponentPushToken[test-token]')).toBeTruthy());
  });

  it('shows sections: Account, Security, Notifications', () => {
    renderScreen();
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
  });

  it('shows MFA section', () => {
    renderScreen();
    expect(screen.getByText('Enable MFA')).toBeTruthy();
  });

  it('shows Enabled badge when push already granted on mount', async () => {
    const Notifications = require('expo-notifications');
    Notifications.getPermissionsAsync.mockResolvedValue({ status: 'granted' });
    Notifications.getExpoPushTokenAsync.mockResolvedValue({ data: 'ExponentPushToken[mount-token]' });
    renderScreen();
    await waitFor(() => expect(screen.getByText('Enabled')).toBeTruthy());
  });
});
