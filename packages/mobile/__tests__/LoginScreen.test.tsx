import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LoginScreen from '../src/screens/LoginScreen';

jest.mock('expo-secure-store', () => ({
  getItemAsync:    jest.fn().mockResolvedValue(null),
  setItemAsync:    jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('expo-local-authentication', () => ({
  authenticateAsync: jest.fn().mockResolvedValue({ success: true }),
  hasHardwareAsync:  jest.fn().mockResolvedValue(true),
}));

jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));
jest.mock('expo-auth-session/providers/google', () => ({
  useIdTokenAuthRequest: () => [null, null, jest.fn()],
}));

jest.mock('../src/contexts/auth-context', () => ({
  useAuth: () => ({
    login:            jest.fn().mockResolvedValue(undefined),
    biometricEnabled: false,
  }),
}));

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

const mockNav = { navigate: jest.fn(), goBack: jest.fn() } as unknown as Parameters<typeof LoginScreen>[0]['navigation'];

function renderScreen() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <LoginScreen navigation={mockNav} route={{} as Parameters<typeof LoginScreen>[0]['route']} />
    </QueryClientProvider>,
  );
}

describe('LoginScreen', () => {
  it('renders sign-in form', () => {
    renderScreen();
    expect(screen.getByText('Sign in to NetVigil')).toBeTruthy();
    expect(screen.getByTestId('email-input')).toBeTruthy();
    expect(screen.getByTestId('password-input')).toBeTruthy();
    expect(screen.getByTestId('login-btn')).toBeTruthy();
  });

  it('shows error for invalid email', async () => {
    renderScreen();
    fireEvent.press(screen.getByTestId('login-btn'));
    await waitFor(() => {
      expect(screen.getByText('Enter a valid email address')).toBeTruthy();
    });
  });

  it('shows error for missing password', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByTestId('email-input'), 'test@example.com');
    fireEvent.press(screen.getByTestId('login-btn'));
    await waitFor(() => {
      expect(screen.getByText('Password is required')).toBeTruthy();
    });
  });

  it('does not show biometric button when biometric disabled', () => {
    renderScreen();
    expect(screen.queryByText('Use biometrics')).toBeNull();
  });
});
