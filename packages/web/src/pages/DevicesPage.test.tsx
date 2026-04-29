import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-utils.tsx';
import DevicesPage from './DevicesPage.tsx';

describe('DevicesPage', () => {
  it('shows loading spinner then renders device table', async () => {
    renderWithProviders(<DevicesPage />, { authenticated: true });
    expect(screen.getByRole('status')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('pfSense-Edge')).toBeInTheDocument();
    });
  });

  it('renders all seeded devices', async () => {
    renderWithProviders(<DevicesPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText('pfSense-Edge')).toBeInTheDocument();
    });
    expect(screen.getByText('MikroTik-Core')).toBeInTheDocument();
  });

  it('shows Register device button', async () => {
    renderWithProviders(<DevicesPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /register device/i })).toBeInTheDocument();
    });
  });

  it('toggles registration form on button click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DevicesPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /register device/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /register device/i }));
    expect(screen.getByLabelText(/device name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/public ip/i)).toBeInTheDocument();
  });

  it('shows validation error on invalid IP', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DevicesPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /register device/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /register device/i }));
    await user.type(screen.getByLabelText(/device name/i), 'Test Router');
    await user.type(screen.getByLabelText(/public ip/i), 'not-an-ip');
    await user.click(screen.getByRole('button', { name: /^register$/i }));
    expect(await screen.findByText(/valid ipv4/i)).toBeInTheDocument();
  });

  it('shows shared secret after successful device creation', async () => {
    const user = userEvent.setup();
    renderWithProviders(<DevicesPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /register device/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /register device/i }));
    await user.type(screen.getByLabelText(/device name/i), 'New Router');
    await user.type(screen.getByLabelText(/public ip/i), '1.2.3.4');
    await user.click(screen.getByRole('button', { name: /^register$/i }));
    await waitFor(() => {
      expect(screen.getByText(/copy your shared secret/i)).toBeInTheDocument();
    });
  });
});
