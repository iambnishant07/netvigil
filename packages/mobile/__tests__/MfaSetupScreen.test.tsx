import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MfaSetupScreen from '../src/screens/MfaSetupScreen';

jest.mock('react-native-qrcode-svg', () => {
  const { View } = require('react-native');
  return { __esModule: true, default: () => <View testID="qr-code" /> };
});

jest.mock('../src/lib/api-client', () => ({
  apiClient: {
    post: jest.fn(),
  },
}));

jest.spyOn(Alert, 'alert');

const mockNav = { goBack: jest.fn(), navigate: jest.fn() };

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function renderScreen() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MfaSetupScreen navigation={mockNav as never} route={{} as never} />
    </QueryClientProvider>,
  );
}

describe('MfaSetupScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { apiClient } = require('../src/lib/api-client');
    (apiClient.post as jest.Mock).mockResolvedValue({ provisioningUri: 'otpauth://totp/test?secret=ABC' });
  });

  it('renders without crashing', () => {
    renderScreen();
  });

  it('shows the setup title', () => {
    renderScreen();
    expect(screen.getByText('Set up two-factor authentication')).toBeTruthy();
  });

  it('shows "Generate QR code" button initially', () => {
    renderScreen();
    expect(screen.getByText('Generate QR code')).toBeTruthy();
  });

  it('shows QR code and code input after generating', async () => {
    renderScreen();
    fireEvent.press(screen.getByText('Generate QR code'));
    await waitFor(() => expect(screen.getByTestId('qr-code')).toBeTruthy());
    expect(screen.getByPlaceholderText('123456')).toBeTruthy();
    expect(screen.getByText('Verify and enable')).toBeTruthy();
  });

  it('shows error alert when setup fails', async () => {
    const { apiClient } = require('../src/lib/api-client');
    (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('Setup failed'));
    renderScreen();
    fireEvent.press(screen.getByText('Generate QR code'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Setup failed', 'Setup failed'),
    );
  });

  it('calls /auth/mfa/verify with code on verify press', async () => {
    const { apiClient } = require('../src/lib/api-client');
    (apiClient.post as jest.Mock)
      .mockResolvedValueOnce({ provisioningUri: 'otpauth://totp/test?secret=ABC' })
      .mockResolvedValueOnce(undefined);

    renderScreen();
    fireEvent.press(screen.getByText('Generate QR code'));
    await waitFor(() => expect(screen.getByPlaceholderText('123456')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('123456'), '654321');
    fireEvent.press(screen.getByText('Verify and enable'));

    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith('/auth/mfa/verify', { code: '654321' }),
    );
  });

  it('shows success alert and navigates back on verify success', async () => {
    const { apiClient } = require('../src/lib/api-client');
    (apiClient.post as jest.Mock)
      .mockResolvedValueOnce({ provisioningUri: 'otpauth://totp/test?secret=ABC' })
      .mockResolvedValueOnce(undefined);

    renderScreen();
    fireEvent.press(screen.getByText('Generate QR code'));
    await waitFor(() => expect(screen.getByPlaceholderText('123456')).toBeTruthy());

    fireEvent.changeText(screen.getByPlaceholderText('123456'), '654321');
    fireEvent.press(screen.getByText('Verify and enable'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('MFA enabled', expect.any(String), expect.any(Array)),
    );
  });
});
