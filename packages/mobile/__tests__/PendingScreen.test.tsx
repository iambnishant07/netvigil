import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import PendingScreen from '../src/screens/PendingScreen';

const mockLogout = jest.fn().mockResolvedValue(undefined);

jest.mock('../src/contexts/auth-context', () => ({
  useAuth: () => ({
    user:   { id: 'u-1', email: 'pending@example.com', role: 'analyst', status: 'pending', mfaEnrolled: false, createdAt: '2026-01-01T00:00:00Z' },
    logout: mockLogout,
  }),
}));

describe('PendingScreen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('renders without crashing', () => {
    render(<PendingScreen />);
  });

  it('shows awaiting approval message', () => {
    render(<PendingScreen />);
    expect(screen.getByText('Awaiting approval')).toBeTruthy();
  });

  it('shows user email in the body', () => {
    render(<PendingScreen />);
    expect(screen.getByText('pending@example.com')).toBeTruthy();
  });

  it('shows sign out button', () => {
    render(<PendingScreen />);
    expect(screen.getByText('Sign out')).toBeTruthy();
  });

  it('calls logout when sign out pressed', async () => {
    render(<PendingScreen />);
    fireEvent.press(screen.getByText('Sign out'));
    await waitFor(() => expect(mockLogout).toHaveBeenCalled());
  });

  it('shows admin contact hint text', () => {
    render(<PendingScreen />);
    expect(screen.getByText(/organisation administrator/)).toBeTruthy();
  });
});
