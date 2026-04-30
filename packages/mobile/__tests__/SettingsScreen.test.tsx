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

const mockLogout     = jest.fn().mockResolvedValue(undefined);
const mockSetBiometric = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/contexts/auth-context', () => ({
  useAuth: () => ({
    user:             { id: 'u-1', email: 'admin@example.com' },
    biometricEnabled: false,
    setBiometric:     mockSetBiometric,
    logout:           mockLogout,
  }),
}));

describe('SettingsScreen', () => {
  it('renders without crashing', () => {
    render(<SettingsScreen />);
  });

  it('displays user email', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('admin@example.com')).toBeTruthy();
  });

  it('shows biometric lock row', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Biometric lock')).toBeTruthy();
  });

  it('shows push notifications row', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Enable push notifications')).toBeTruthy();
  });

  it('shows sign out button', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Sign out')).toBeTruthy();
  });

  it('calls logout when sign out pressed', async () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByText('Sign out'));
    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  it('shows push token after permission granted', async () => {
    render(<SettingsScreen />);
    fireEvent.press(screen.getByText('Enable push notifications'));
    await waitFor(() => {
      expect(screen.getByText('ExponentPushToken[test-token]')).toBeTruthy();
    });
  });

  it('shows sections: Account, Security, Notifications', () => {
    render(<SettingsScreen />);
    expect(screen.getByText('Account')).toBeTruthy();
    expect(screen.getByText('Security')).toBeTruthy();
    expect(screen.getByText('Notifications')).toBeTruthy();
  });
});
