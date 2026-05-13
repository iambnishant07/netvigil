import { render, screen, act } from '@testing-library/react-native';
import OfflineBanner from '../src/components/OfflineBanner';

let netInfoCallback: ((state: { isConnected: boolean | null }) => void) | null = null;

jest.mock('@react-native-community/netinfo', () => ({
  addEventListener: jest.fn().mockImplementation((cb: (state: { isConnected: boolean | null }) => void) => {
    netInfoCallback = cb;
    return jest.fn(); // unsubscribe
  }),
}));

describe('OfflineBanner', () => {
  beforeEach(() => {
    netInfoCallback = null;
    jest.clearAllMocks();
  });

  it('renders nothing when online', () => {
    const { toJSON } = render(<OfflineBanner />);
    act(() => {
      netInfoCallback?.({ isConnected: true });
    });
    expect(toJSON()).toBeNull();
  });

  it('shows banner when offline', () => {
    render(<OfflineBanner />);
    act(() => {
      netInfoCallback?.({ isConnected: false });
    });
    expect(screen.getByText('No internet connection — showing cached data')).toBeTruthy();
  });

  it('hides banner when connection restored', () => {
    render(<OfflineBanner />);
    act(() => {
      netInfoCallback?.({ isConnected: false });
    });
    expect(screen.getByText('No internet connection — showing cached data')).toBeTruthy();
    act(() => {
      netInfoCallback?.({ isConnected: true });
    });
    expect(screen.queryByText('No internet connection — showing cached data')).toBeNull();
  });
});
