import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MfaChallengeScreen from '../src/screens/MfaChallengeScreen';

const mockLogin = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/contexts/auth-context', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

const mockPost = jest.fn().mockResolvedValue({
  accessToken: 'at', refreshToken: 'rt', expiresIn: 900,
  user: { id: 'u-1', email: 'a@b.com', role: 'admin', status: 'active', mfaEnrolled: true, createdAt: '2026-01-01T00:00:00Z' },
  mfaRequired: false,
});

jest.mock('../src/lib/api-client', () => ({
  apiClient: { post: jest.fn() },
}));

jest.spyOn(Alert, 'alert');

const mockRoute = { params: { mfaToken: 'mfa-token-123' } };

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function renderScreen() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <MfaChallengeScreen route={mockRoute as never} navigation={{} as never} />
    </QueryClientProvider>,
  );
}

describe('MfaChallengeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { apiClient } = require('../src/lib/api-client');
    (apiClient.post as jest.Mock).mockResolvedValue(mockPost());
  });

  it('renders without crashing', () => {
    renderScreen();
  });

  it('shows the title and description', () => {
    renderScreen();
    expect(screen.getByText('Two-factor authentication')).toBeTruthy();
    expect(screen.getByText(/Enter the 6-digit code/)).toBeTruthy();
  });

  it('renders the code input', () => {
    renderScreen();
    expect(screen.getByPlaceholderText('123456')).toBeTruthy();
  });

  it('shows Verify button', () => {
    renderScreen();
    expect(screen.getByText('Verify')).toBeTruthy();
  });

  it('verify button is disabled when code is less than 6 digits', () => {
    renderScreen();
    fireEvent.changeText(screen.getByPlaceholderText('123456'), '123');
    const btn = screen.getByText('Verify').parent?.parent;
    expect(btn?.props.accessibilityState?.disabled ?? btn?.props.disabled).toBeTruthy();
  });

  it('calls POST /auth/mfa/challenge when valid code entered and verify pressed', async () => {
    const { apiClient } = require('../src/lib/api-client');
    renderScreen();
    fireEvent.changeText(screen.getByPlaceholderText('123456'), '654321');
    fireEvent.press(screen.getByText('Verify'));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/auth/mfa/challenge',
        { mfaToken: 'mfa-token-123', code: '654321' },
      ),
    );
  });

  it('calls login on success', async () => {
    const { apiClient } = require('../src/lib/api-client');
    (apiClient.post as jest.Mock).mockResolvedValueOnce({
      accessToken: 'at', refreshToken: 'rt', expiresIn: 900,
      user: { id: 'u-1', email: 'a@b.com', role: 'admin', status: 'active', mfaEnrolled: true, createdAt: '2026-01-01T00:00:00Z' },
      mfaRequired: false,
    });
    renderScreen();
    fireEvent.changeText(screen.getByPlaceholderText('123456'), '654321');
    fireEvent.press(screen.getByText('Verify'));
    await waitFor(() => expect(mockLogin).toHaveBeenCalled());
  });

  it('shows error alert on invalid code', async () => {
    const { apiClient } = require('../src/lib/api-client');
    (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('Invalid code'));
    renderScreen();
    fireEvent.changeText(screen.getByPlaceholderText('123456'), '000000');
    fireEvent.press(screen.getByText('Verify'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Invalid code', expect.any(String)),
    );
  });
});
