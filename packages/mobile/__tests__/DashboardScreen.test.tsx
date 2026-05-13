import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { Alert } from 'react-native';
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

const mockIncidents = {
  items: [
    {
      id: 'inc-1',
      severity: 'critical' as const,
      attackLabel: 'port_scan',
      detectedAt: new Date().toISOString(),
      status: 'open' as const,
    },
  ],
  total: 1,
};

// All data must be inline — outer const refs are undefined at jest.mock hoist time
jest.mock('../src/lib/api-client', () => ({
  apiClient: {
    get: jest.fn().mockImplementation((path: string) => {
      if (path === '/dashboard/kpis') return Promise.resolve({
        eventsPerSecond: 1234,
        openIncidentsBySeverity: { critical: 2, high: 3, medium: 5, low: 1, info: 0 },
        topInternalTalkers:      [{ ip: '192.168.1.100', bytes: 1_500_000 }],
        topExternalDestinations: [{ ip: '8.8.8.8', country: 'US', bytes: 200_000 }],
      });
      return Promise.resolve({ items: [], total: 0 });
    }),
    post: jest.fn().mockResolvedValue({ seeded: { incidents: 20, devices: 2, alertRules: 3 } }),
  },
}));

jest.spyOn(Alert, 'alert');

beforeEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
  const { apiClient } = require('../src/lib/api-client');
  (apiClient.get as jest.Mock).mockImplementation((path: string) => {
    if (path === '/dashboard/kpis') return Promise.resolve(mockKpis);
    return Promise.resolve({ items: [], total: 0 });
  });
  (apiClient.post as jest.Mock).mockResolvedValue({ seeded: { incidents: 20, devices: 2, alertRules: 3 } });
});

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
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
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('Events/sec')).toBeTruthy();
    });
    expect(screen.getByText('Critical')).toBeTruthy();
    expect(screen.getByText('Total open')).toBeTruthy();
  });

  it('renders top internal talker IP', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('192.168.1.100')).toBeTruthy();
    });
  });

  it('renders severity bar labels', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('critical')).toBeTruthy();
      expect(screen.getByText('high')).toBeTruthy();
    });
  });

  it('renders "Simulate Attack" button', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('Simulate Attack')).toBeTruthy());
  });

  it('calls POST /seed when Simulate Attack is pressed', async () => {
    const { apiClient } = require('../src/lib/api-client');
    renderScreen();
    await waitFor(() => expect(screen.getByText('Simulate Attack')).toBeTruthy());
    fireEvent.press(screen.getByTestId('simulate-attack-btn'));
    await waitFor(() => expect(apiClient.post).toHaveBeenCalledWith('/seed', {}));
  });

  it('shows success alert after seed completes', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('Simulate Attack')).toBeTruthy());
    fireEvent.press(screen.getByTestId('simulate-attack-btn'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'Attack simulated',
        expect.stringContaining('20 incidents'),
      ),
    );
  });

  it('shows error alert when seed fails', async () => {
    const { apiClient } = require('../src/lib/api-client');
    (apiClient.post as jest.Mock).mockRejectedValueOnce(new Error('Server error'));
    renderScreen();
    await waitFor(() => expect(screen.getByText('Simulate Attack')).toBeTruthy());
    fireEvent.press(screen.getByTestId('simulate-attack-btn'));
    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith('Simulation failed', 'Server error'),
    );
  });

  it('renders "No recent incidents" when list is empty', async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText('No recent incidents')).toBeTruthy());
  });

  it('renders "No data" when top talkers is empty', async () => {
    const { apiClient } = require('../src/lib/api-client');
    (apiClient.get as jest.Mock).mockImplementation((path: string) => {
      if (path === '/dashboard/kpis') {
        return Promise.resolve({ ...mockKpis, topInternalTalkers: [] });
      }
      return Promise.resolve({ items: [], total: 0 });
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText('No data')).toBeTruthy());
  });

  it('renders recent incident label when data is present', async () => {
    const { apiClient } = require('../src/lib/api-client');
    (apiClient.get as jest.Mock).mockImplementation((path: string) => {
      if (path === '/dashboard/kpis') return Promise.resolve(mockKpis);
      return Promise.resolve(mockIncidents);
    });
    renderScreen();
    await waitFor(() => expect(screen.getByText('port scan')).toBeTruthy());
  });
});
