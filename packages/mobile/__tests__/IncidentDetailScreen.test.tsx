import { render, screen, waitFor, fireEvent } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IncidentDetailScreen from '../src/screens/IncidentDetailScreen';

// Inline data so there's no outer-variable reference issue at hoist time
jest.mock('../src/lib/api-client', () => ({
  apiClient: {
    get: jest.fn().mockImplementation(() =>
      Promise.resolve({
        id: 'inc-1', severity: 'critical', status: 'open',
        attackLabel: 'port_scan', mitreTechnique: 'T1046',
        detectedAt: new Date().toISOString(),
        anomalyScore: 0.92, sourceIp: '10.0.0.1', destinationIp: '203.0.113.5',
        narrative: 'A sustained port scan was detected from an internal host.',
      })
    ),
    patch: jest.fn().mockImplementation(() =>
      Promise.resolve({
        id: 'inc-1', severity: 'critical', status: 'acknowledged',
        attackLabel: 'port_scan', mitreTechnique: 'T1046',
        detectedAt: new Date().toISOString(),
        anomalyScore: 0.92, sourceIp: '10.0.0.1', destinationIp: '203.0.113.5',
      })
    ),
  },
}));

const mockRoute      = { params: { id: 'inc-1' } };
const mockNavigation = { navigate: jest.fn(), goBack: jest.fn() };

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function renderScreen() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <IncidentDetailScreen route={mockRoute as never} navigation={mockNavigation as never} />
    </QueryClientProvider>,
  );
}

describe('IncidentDetailScreen', () => {
  it('renders without crashing', () => {
    renderScreen();
  });

  it('renders incident attack label after loading', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('port scan')).toBeTruthy();
    });
  });

  it('renders MITRE technique', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('T1046')).toBeTruthy();
    });
  });

  it('renders source and destination IPs', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('10.0.0.1')).toBeTruthy();
      expect(screen.getByText('203.0.113.5')).toBeTruthy();
    });
  });

  it('renders AI narrative', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('A sustained port scan was detected from an internal host.')).toBeTruthy();
    });
  });

  it('renders status update section', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('Update status')).toBeTruthy();
    });
  });

  it('shows status options excluding current (open)', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('Acknowledged')).toBeTruthy();
    });
    expect(screen.getByText('Confirmed')).toBeTruthy();
  });

  it('enables save after status chip pressed', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('Acknowledged')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('Acknowledged'));
    expect(screen.getByText('Save status')).toBeTruthy();
  });
});
