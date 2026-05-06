import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DashboardScreen from '../src/screens/DashboardScreen';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: jest.fn() }),
}));

jest.mock('@react-navigation/bottom-tabs', () => ({
  useBottomTabBarHeight: () => 0,
}));

jest.mock('../src/hooks/use-incident-stream', () => ({
  useIncidentStream: jest.fn(),
}));

const mockKpis = {
  eventsPerSecond: 1234,
  openIncidentsBySeverity: { critical: 2, high: 3, medium: 5, low: 1, info: 0 },
  topInternalTalkers:      [{ ip: '192.168.1.100', bytes: 1_500_000 }],
  topExternalDestinations: [{ ip: '8.8.8.8', country: 'US', bytes: 200_000 }],
};

jest.mock('../src/lib/api-client', () => ({
  apiClient: {
    get: jest.fn().mockImplementation((path: string) => {
      if (path === '/dashboard/kpis') return Promise.resolve(mockKpis);
      return Promise.resolve({ items: [], total: 0 });
    }),
  },
}));

beforeEach(() => { jest.useFakeTimers(); });
afterEach(() => { jest.useRealTimers(); });

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderScreen() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <DashboardScreen />
    </QueryClientProvider>,
  );
}

describe('DashboardScreen', () => {
  it('renders without crashing', () => {
    renderScreen();
  });

  it('renders KPI tiles after data loads', async () => {
    jest.useRealTimers();
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('Events/sec')).toBeTruthy();
    });
    expect(screen.getByText('Critical')).toBeTruthy();
    expect(screen.getByText('Total open')).toBeTruthy();
  });

  it('renders top internal talker IP', async () => {
    jest.useRealTimers();
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('192.168.1.100')).toBeTruthy();
    });
  });

  it('renders severity bar labels', async () => {
    jest.useRealTimers();
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('critical')).toBeTruthy();
      expect(screen.getByText('high')).toBeTruthy();
    });
  });
});
