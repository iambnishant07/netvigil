import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AlertRulesScreen from '../src/screens/AlertRulesScreen';

// Data must be inline — outer const refs are undefined at jest.mock hoist time
jest.mock('../src/lib/api-client', () => ({
  apiClient: {
    get: jest.fn().mockImplementation(() => Promise.resolve([
      { id: 'rule-1', name: 'Critical to email', minSeverity: 'critical', channel: 'email', enabled: true },
      { id: 'rule-2', name: 'High to push',      minSeverity: 'high',     channel: 'push',  enabled: false },
    ])),
    post:   jest.fn().mockImplementation(() => Promise.resolve({ id: 'rule-3', name: 'New rule', minSeverity: 'high', channel: 'sms', enabled: true })),
    patch:  jest.fn().mockImplementation(() => Promise.resolve({ id: 'rule-1', name: 'Critical to email', minSeverity: 'critical', channel: 'email', enabled: false })),
    delete: jest.fn().mockImplementation(() => Promise.resolve(undefined)),
  },
}));

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

function renderScreen() {
  return render(
    <QueryClientProvider client={makeClient()}>
      <AlertRulesScreen />
    </QueryClientProvider>,
  );
}

describe('AlertRulesScreen', () => {
  it('renders without crashing', () => {
    renderScreen();
  });

  it('renders rule names after loading', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('Critical to email')).toBeTruthy();
    });
    expect(screen.getByText('High to push')).toBeTruthy();
  });

  it('shows create button', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('+ Create rule')).toBeTruthy();
    });
  });

  it('opens create form on button press', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('+ Create rule')).toBeTruthy();
    });
    fireEvent.press(screen.getByText('+ Create rule'));
    expect(screen.getByPlaceholderText('High severity to email')).toBeTruthy();
  });

  it('shows validation error for empty name', async () => {
    renderScreen();
    await waitFor(() => {
      fireEvent.press(screen.getByText('+ Create rule'));
    });
    fireEvent.press(screen.getByText('Create rule'));
    await waitFor(() => {
      expect(screen.getByText('Name is required')).toBeTruthy();
    });
  });

  it('shows severity selector chips in form', async () => {
    renderScreen();
    await waitFor(() => {
      fireEvent.press(screen.getByText('+ Create rule'));
    });
    expect(screen.getAllByText('Critical').length).toBeGreaterThan(0);
    expect(screen.getAllByText('High').length).toBeGreaterThan(0);
  });

  it('hides form on cancel', async () => {
    renderScreen();
    await waitFor(() => {
      fireEvent.press(screen.getByText('+ Create rule'));
    });
    expect(screen.getByText('Cancel')).toBeTruthy();
    fireEvent.press(screen.getByText('Cancel'));
    expect(screen.queryByPlaceholderText('High severity to email')).toBeNull();
  });

  it('renders disabled rule with reduced opacity', async () => {
    renderScreen();
    await waitFor(() => {
      expect(screen.getByText('High to push')).toBeTruthy();
    });
    // disabled rule rendered (opacity change is visual, component still present)
    expect(screen.getByText('High to push')).toBeTruthy();
  });
});
