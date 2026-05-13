import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RegisterScreen from '../src/screens/RegisterScreen';

jest.mock('expo-web-browser', () => ({ maybeCompleteAuthSession: jest.fn() }));

const mockLogin = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/contexts/auth-context', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

jest.mock('../src/lib/api-client', () => ({
  apiClient: {
    get:  jest.fn().mockResolvedValue([{ id: 'org-1', name: 'Acme Pty Ltd' }]),
    post: jest.fn().mockResolvedValue({
      accessToken: 'at', refreshToken: 'rt', expiresIn: 900,
      user: { id: 'u-1', email: 'a@b.com', role: 'analyst', status: 'active', mfaEnrolled: false, createdAt: '2026-01-01T00:00:00Z' },
      mfaRequired: false,
    }),
  },
}));

const mockNav = { navigate: jest.fn(), goBack: jest.fn() };

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function renderScreen() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <RegisterScreen navigation={mockNav as never} route={{} as never} />
    </QueryClientProvider>,
  );
}

describe('RegisterScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders without crashing', () => {
    renderScreen();
  });

  it('shows the title', () => {
    renderScreen();
    expect(screen.getByText('Create an account')).toBeTruthy();
  });

  it('shows mode toggle buttons', () => {
    renderScreen();
    expect(screen.getByText('Join org')).toBeTruthy();
    expect(screen.getByText('Create org')).toBeTruthy();
  });

  it('shows email and password fields', () => {
    renderScreen();
    expect(screen.getByPlaceholderText('you@example.com')).toBeTruthy();
    expect(screen.getByPlaceholderText('Minimum 12 characters')).toBeTruthy();
  });

  it('shows "Request access" button in join mode', () => {
    renderScreen();
    expect(screen.getByText('Request access')).toBeTruthy();
  });

  it('switches to Create org mode', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Create org'));
    expect(screen.getByPlaceholderText('Acme Pty Ltd')).toBeTruthy();
    expect(screen.getByText('Create account')).toBeTruthy();
  });

  it('shows org name validation error when empty in create mode', async () => {
    renderScreen();
    fireEvent.press(screen.getByText('Create org'));
    fireEvent.press(screen.getByText('Create account'));
    await waitFor(() =>
      expect(screen.getByText('Organisation name must be at least 2 characters')).toBeTruthy(),
    );
  });

  it('shows email validation error for invalid email', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'notanemail');
    fireEvent.press(screen.getByText('Request access'));
    await waitFor(() =>
      expect(screen.getByText('Enter a valid email address')).toBeTruthy(),
    );
  });

  it('shows password validation error for short password', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'user@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Minimum 12 characters'), 'short');
    fireEvent.press(screen.getByText('Request access'));
    await waitFor(() =>
      expect(screen.getByText('Password must be at least 12 characters')).toBeTruthy(),
    );
  });

  it('shows org selection error when no org selected in join mode', async () => {
    renderScreen();
    fireEvent.changeText(screen.getByPlaceholderText('you@example.com'), 'user@example.com');
    fireEvent.changeText(screen.getByPlaceholderText('Minimum 12 characters'), 'supersecurepassword');
    fireEvent.press(screen.getByText('Request access'));
    await waitFor(() =>
      expect(screen.getByText('Select an organisation')).toBeTruthy(),
    );
  });

  it('shows "Already have an account? Sign in" link', () => {
    renderScreen();
    expect(screen.getByText('Sign in')).toBeTruthy();
  });

  it('navigates to Login on sign-in link press', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Sign in'));
    expect(mockNav.navigate).toHaveBeenCalledWith('Login');
  });

  it('shows timezone field in create org mode', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Create org'));
    expect(screen.getByPlaceholderText('Australia/Melbourne')).toBeTruthy();
  });

  it('opens role picker in join mode', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('Analyst')).toBeTruthy());
    fireEvent.press(screen.getByText('Analyst'));
    await waitFor(() => expect(screen.getByText('Senior Analyst')).toBeTruthy());
  });
});
