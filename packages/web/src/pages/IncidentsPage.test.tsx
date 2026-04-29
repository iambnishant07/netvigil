import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-utils.tsx';
import IncidentsPage from './IncidentsPage.tsx';

describe('IncidentsPage', () => {
  it('shows loading spinner then renders table', async () => {
    renderWithProviders(<IncidentsPage />, { authenticated: true });
    expect(screen.getByRole('status')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/detected/i)).toBeInTheDocument();
    });
  });

  it('renders incident rows from mock data', async () => {
    renderWithProviders(<IncidentsPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText(/c2 beaconing/i)).toBeInTheDocument();
    });
    expect(screen.getByText('T1071')).toBeInTheDocument();
  });

  it('renders severity filter select', async () => {
    renderWithProviders(<IncidentsPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText(/all severities/i)).toBeInTheDocument();
    });
  });

  it('renders status filter select', async () => {
    renderWithProviders(<IncidentsPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText(/all statuses/i)).toBeInTheDocument();
    });
  });

  it('shows clear filters button when a filter is active', async () => {
    const user = userEvent.setup();
    renderWithProviders(<IncidentsPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText(/all severities/i)).toBeInTheDocument();
    });
    const severitySelect = screen.getAllByRole('combobox')[0]!;
    await user.selectOptions(severitySelect, 'critical');
    expect(await screen.findByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });
});
