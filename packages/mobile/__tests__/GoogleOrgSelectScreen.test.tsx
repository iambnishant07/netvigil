import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GoogleOrgSelectScreen from '../src/screens/GoogleOrgSelectScreen';

const mockLogin = jest.fn().mockResolvedValue(undefined);
jest.mock('../src/contexts/auth-context', () => ({
  useAuth: () => ({ login: mockLogin }),
}));

jest.mock('../src/lib/api-client', () => ({
  apiClient: {
    get: jest.fn().mockResolvedValue([
      { id: 'org-1', name: 'Acme Pty Ltd' },
      { id: 'org-2', name: 'Globex Corp'  },
    ]),
    post: jest.fn().mockResolvedValue({
      accessToken: 'at', refreshToken: 'rt', expiresIn: 900,
      user: { id: 'u-1', email: 'g@example.com', role: 'analyst', status: 'pending', mfaEnrolled: false, createdAt: '2026-01-01T00:00:00Z' },
      mfaRequired: false,
    }),
  },
}));

jest.spyOn(Alert, 'alert');

const mockNav   = { goBack: jest.fn(), navigate: jest.fn() };
const mockRoute = { params: { googleSessionToken: 'gst-abc', email: 'google@example.com' } };

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function renderScreen() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <GoogleOrgSelectScreen route={mockRoute as never} navigation={mockNav as never} />
    </QueryClientProvider>,
  );
}

describe('GoogleOrgSelectScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const { apiClient } = require('../src/lib/api-client');
    (apiClient.get as jest.Mock).mockResolvedValue([
      { id: 'org-1', name: 'Acme Pty Ltd' },
    ]);
    (apiClient.post as jest.Mock).mockResolvedValue({
      accessToken: 'at', refreshToken: 'rt', expiresIn: 900,
      user: { id: 'u-1', email: 'g@example.com', role: 'analyst', status: 'active', mfaEnrolled: false, createdAt: '2026-01-01T00:00:00Z' },
      mfaRequired: false,
    });
  });

  it('renders without crashing', () => {
    renderScreen();
  });

  it('shows the title and email', () => {
    renderScreen();
    expect(screen.getByText('One more step')).toBeTruthy();
    expect(screen.getByText('google@example.com')).toBeTruthy();
  });

  it('shows mode toggle buttons', () => {
    renderScreen();
    expect(screen.getByText('Join org')).toBeTruthy();
    expect(screen.getByText('Create org')).toBeTruthy();
  });

  it('shows "Request access" in join mode', () => {
    renderScreen();
    expect(screen.getByText('Request access')).toBeTruthy();
  });

  it('switches to create mode', () => {
    renderScreen();
    fireEvent.press(screen.getByText('Create org'));
    expect(screen.getByPlaceholderText('Acme Pty Ltd')).toBeTruthy();
    expect(screen.getByText('Create & continue')).toBeTruthy();
  });

  it('shows alert when submitting join mode without selecting org', async () => {
    renderScreen();
    fireEvent.press(screen.getByText('Request access'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Select an organisation', expect.any(String)),
    );
  });

  it('shows alert when submitting create mode without org name', async () => {
    renderScreen();
    fireEvent.press(screen.getByText('Create org'));
    fireEvent.press(screen.getByText('Create & continue'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Organisation name required', expect.any(String)),
    );
  });

  it('shows back button', () => {
    renderScreen();
    expect(screen.getByText('← Back')).toBeTruthy();
  });

  it('calls navigation.goBack on back press', () => {
    renderScreen();
    fireEvent.press(screen.getByText('← Back'));
    expect(mockNav.goBack).toHaveBeenCalled();
  });

  it('opens org picker in join mode', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('Select an organisation…')).toBeTruthy());
    fireEvent.press(screen.getByText('Select an organisation…'));
    await waitFor(() => expect(screen.getByText('Acme Pty Ltd')).toBeTruthy());
  });

  it('selects an org from dropdown', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('Select an organisation…')).toBeTruthy());
    fireEvent.press(screen.getByText('Select an organisation…'));
    await waitFor(() => expect(screen.getByText('Acme Pty Ltd')).toBeTruthy());
    fireEvent.press(screen.getByText('Acme Pty Ltd'));
    await waitFor(() => expect(screen.queryByText('Select an organisation…')).toBeNull());
  });

  it('submits join form with selected org', async () => {
    const { apiClient } = require('../src/lib/api-client');
    renderScreen();
    await waitFor(() => expect(screen.getByText('Select an organisation…')).toBeTruthy());
    fireEvent.press(screen.getByText('Select an organisation…'));
    await waitFor(() => expect(screen.getByText('Acme Pty Ltd')).toBeTruthy());
    fireEvent.press(screen.getByText('Acme Pty Ltd'));
    fireEvent.press(screen.getByText('Request access'));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/auth/google/complete',
        expect.objectContaining({ organizationId: 'org-1', googleSessionToken: 'gst-abc' }),
      ),
    );
  });

  it('submits create form with org name', async () => {
    const { apiClient } = require('../src/lib/api-client');
    renderScreen();
    fireEvent.press(screen.getByText('Create org'));
    fireEvent.changeText(screen.getByPlaceholderText('Acme Pty Ltd'), 'My New Org');
    fireEvent.press(screen.getByText('Create & continue'));
    await waitFor(() =>
      expect(apiClient.post).toHaveBeenCalledWith(
        '/auth/google/complete',
        expect.objectContaining({ organizationName: 'My New Org', googleSessionToken: 'gst-abc' }),
      ),
    );
  });

  it('shows error alert when mutation fails', async () => {
    const { apiClient } = require('../src/lib/api-client');
    (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('Server error'));
    renderScreen();
    fireEvent.press(screen.getByText('Create org'));
    fireEvent.changeText(screen.getByPlaceholderText('Acme Pty Ltd'), 'My New Org');
    fireEvent.press(screen.getByText('Create & continue'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Setup failed', 'Server error'),
    );
  });

  it('opens role picker and selects a role', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('Analyst')).toBeTruthy());
    fireEvent.press(screen.getByText('Analyst'));
    await waitFor(() => expect(screen.getByText('Senior Analyst')).toBeTruthy());
    fireEvent.press(screen.getByText('Senior Analyst'));
    await waitFor(() => expect(screen.queryByText('Forensic Investigator')).toBeNull());
  });
});
