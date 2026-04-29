import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils.tsx';
import DashboardPage from './DashboardPage.tsx';

describe('DashboardPage', () => {
  it('shows loading spinner initially then renders KPI tiles', async () => {
    renderWithProviders(<DashboardPage />, { authenticated: true });
    expect(screen.getByRole('status')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/events \/ sec/i)).toBeInTheDocument();
    });
    expect(screen.getByText(/critical open/i)).toBeInTheDocument();
    expect(screen.getByText(/high open/i)).toBeInTheDocument();
  });

  it('renders top internal talkers after load', async () => {
    renderWithProviders(<DashboardPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText(/top internal talkers/i)).toBeInTheDocument();
    });
    expect(screen.getByText('10.0.0.5')).toBeInTheDocument();
  });

  it('renders top external destinations after load', async () => {
    renderWithProviders(<DashboardPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText(/top external destinations/i)).toBeInTheDocument();
    });
  });

  it('renders recent incidents section', async () => {
    renderWithProviders(<DashboardPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText(/recent incidents/i)).toBeInTheDocument();
    });
  });

  it('has a View all link to /incidents', async () => {
    renderWithProviders(<DashboardPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute('href', '/incidents');
    });
  });
});
