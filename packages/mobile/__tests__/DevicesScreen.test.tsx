import { render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import DevicesScreen from '../src/screens/DevicesScreen';

// Inline data inside the factory so there's no outer-variable reference at hoist time
jest.mock('../src/lib/api-client', () => ({
  apiClient: {
    get: jest.fn().mockImplementation(() =>
      Promise.resolve({
        items: [
          {
            id: 'dev-1', name: 'pfSense-Edge', vendor: 'pfsense',
            protocol: 'netflow', publicIp: '192.168.1.1',
            lastSeenAt: new Date().toISOString(), // online (just now)
          },
          {
            id: 'dev-2', name: 'MikroTik-Core', vendor: 'mikrotik',
            protocol: 'syslog', publicIp: '10.0.0.1',
            lastSeenAt: null, // offline
          },
        ],
        total: 2,
      })
    ),
  },
}));

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderScreen() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <DevicesScreen />
    </QueryClientProvider>,
  );
}

describe('DevicesScreen', () => {
  it('renders without crashing', () => {
    renderScreen();
  });

  it('renders device names after loading', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('pfSense-Edge')).toBeTruthy();
    });
    expect(screen.getByText('MikroTik-Core')).toBeTruthy();
  });

  it('shows Online for recently seen device', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByText('Online').length).toBeGreaterThan(0);
    });
  });

  it('shows Offline for device with null lastSeenAt', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getAllByText('Offline').length).toBeGreaterThan(0);
    });
  });

  it('shows public IP addresses', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('192.168.1.1')).toBeTruthy();
      expect(screen.getByText('10.0.0.1')).toBeTruthy();
    });
  });
});
