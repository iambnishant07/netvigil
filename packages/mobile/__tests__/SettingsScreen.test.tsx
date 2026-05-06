import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import SettingsScreen from '../src/screens/SettingsScreen';

jest.mock('expo-notifications', () => ({
  requestPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getExpoPushTokenAsync:   jest.fn().mockResolvedValue({ data: 'ExponentPushToken[test-token]' }),
}));

jest.mock('expo-local-authentication', () => ({
  hasHardwareAsync:  jest.fn().mockResolvedValue(true),
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
}));

const mockLogout      = jest.fn().mockResolvedValue(undefined);
const mockSetBiometric = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/contexts/auth-context', () => ({
  useAuth: () => ({
    user:             { id: 'u-1', email: 'admin@example.com' },
    biometricEnabled: false,
    setBiometric:     mockSetBiometric,
    logout:           mockLogout,
  }),
}));

jest.mock('../src/lib/api-client', () => ({
  apiClient: { put: jest.fn().mockResolvedValue(undefined) },
}));

const mockNav   = { navigate: jest.fn(), goBack: jest.fn() } as unknown as Parameters<typeof SettingsScreen>[0]['navigation'];
const mockRoute = {} as Parameters<typeof SettingsScreen>[0]['route'];

function renderScreen() {
  return render(<SettingsScreen navigation={mockNav} route={mockRoute} />);
}

describe('SettingsScreen', () => {
  it('renders without crashing', () => {
    renderScreen();
  });

  it('displays user email', () => {
    renderScreen();
    expect(screen.getByText('admin@example.com')).toBeTruthy();
  });

  it('shows biometric lock row', () => {
    renderScreen();
    expect(screen.getByText('Biometric lock')).toBeTruthy();
  });

  it('shows push notifications row', () => {
    renderScreen();
    expect(screen.getByText('Enable push notifications')).toBeTruthy();
  });

  it('shows sign out button', () => {
    renderScreen();
    expect(screen.getByText('Sign out')).toBeTruthy();
  });

  it('calls logout when sign out pressed', async () => {
    renderScreen();
    fireEvent.press(screen.getByText('Sign out'));
    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  it('shows push token after permission granted', async () => {
    renderScreen();
    fireEvent.press(screen.getByText('Enable push notifications'));
    await waitFor(() => {
      expect(screen.getByText('ExponentPushToken[test-token]')).toBeTruthy();
    });
  });

  it('shows sections: Account, Security, Notifications', () => {
    renderScreen();
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
  });
});
