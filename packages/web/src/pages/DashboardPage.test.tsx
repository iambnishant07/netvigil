import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils.tsx';
import DashboardPage from './DashboardPage.tsx';

describe('DashboardPage', () => {
  it('shows loading spinner then renders Risk Monitor heading', async () => {
    renderWithProviders(<DashboardPage />, { authenticated: true });
    expect(screen.getByRole('status')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/risk monitor/i)).toBeInTheDocument();
    });
  });

  it('renders Risk Score panel after load', async () => {
    renderWithProviders(<DashboardPage />, { authenticated: true });
    // "RISK SCORE" appears in both the panel heading and the SVG text element
    await waitFor(() => {
      expect(screen.getAllByText(/risk score/i).length).toBeGreaterThan(0);
    });
  });

  it('renders World Threat Map after load', async () => {
    renderWithProviders(<DashboardPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByLabelText(/world threat map/i)).toBeInTheDocument();
    });
  });

  it('renders attack type boxes after load', async () => {
    renderWithProviders(<DashboardPage />, { authenticated: true });
    // Exact text match avoids multi-element matches (parent div has combined text)
    await waitFor(() => {
      expect(screen.getAllByText('C&C Beaconing').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Lateral Move').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Data Exfil').length).toBeGreaterThan(0);
    });
  });

  it('renders 7-Day Threat Trend section', async () => {
    renderWithProviders(<DashboardPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText(/7-day threat trend/i)).toBeInTheDocument();
    });
  });

  it('renders top internal talkers with IP address', async () => {
    renderWithProviders(<DashboardPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText(/top internal talkers/i)).toBeInTheDocument();
    });
    expect(screen.getByText('10.0.0.5')).toBeInTheDocument();
  });

  it('renders top external destinations', async () => {
    renderWithProviders(<DashboardPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText(/top external destinations/i)).toBeInTheDocument();
    });
  });

  it('renders Threat Feed section', async () => {
    renderWithProviders(<DashboardPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText(/threat feed/i)).toBeInTheDocument();
    });
  });

  it('has a View all link to /incidents', async () => {
    renderWithProviders(<DashboardPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /view all/i })).toHaveAttribute('href', '/incidents');
    });
  });
});
