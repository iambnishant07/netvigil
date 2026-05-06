import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import IncidentsScreen from '../src/screens/IncidentsScreen';

const mockNavigation = { navigate: jest.fn() };
const mockRoute      = { params: {} };

jest.mock('../src/hooks/use-incident-stream', () => ({
  useIncidentStream: jest.fn(),
}));

// Data must be inline — outer const refs are undefined at jest.mock hoist time
jest.mock('../src/lib/api-client', () => ({
  apiClient: {
    get: jest.fn().mockImplementation(() => Promise.resolve({
      items: [
        {
          id: 'inc-1', severity: 'critical', status: 'open', attackLabel: 'port_scan',
          mitreTechnique: 'T1046', detectedAt: new Date().toISOString(),
          anomalyScore: 0.95, sourceIp: '10.0.0.1', destinationIp: '10.0.0.2',
        },
      ],
      total: 1, page: 1, pageSize: 10,
    })),
  },
}));

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function renderScreen() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <IncidentsScreen navigation={mockNavigation as never} route={mockRoute as never} />
    </QueryClientProvider>,
  );
}

describe('IncidentsScreen', () => {
  it('renders severity filter chips', () => {
    renderScreen();
    expect(screen.getAllByText('All').length).toBeGreaterThan(0);
    expect(screen.getByText('Critical')).toBeTruthy();
    expect(screen.getByText('High')).toBeTruthy();
  });

  it('renders status filter chips', () => {
    renderScreen();
    expect(screen.getByText('Open')).toBeTruthy();
    expect(screen.getByText('Ack')).toBeTruthy();
    expect(screen.getByText('Confirmed')).toBeTruthy();
  });

  it('renders incident attack label after data loads', async () => {
    renderScreen();
    const item = await screen.findByText('port scan');
    expect(item).toBeTruthy();
  });

  it('navigates to IncidentDetail when item is pressed', async () => {
    renderScreen();
    const item = await screen.findByText('port scan');
    fireEvent.press(item);
    expect(mockNavigation.navigate).toHaveBeenCalledWith('IncidentDetail', { id: 'inc-1' });
  });

  it('applies severity filter on chip press without crashing', async () => {
    renderScreen();
    fireEvent.press(screen.getByText('Critical'));
    await waitFor(() => {
      expect(screen.getByText('Critical')).toBeTruthy();
    });
  });

  it('applies status filter on chip press without crashing', async () => {
    renderScreen();
    fireEvent.press(screen.getByText('Open'));
    await waitFor(() => {
      expect(screen.getByText('Open')).toBeTruthy();
    });
  });
});
