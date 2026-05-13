import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { renderWithProviders } from '../test-utils.tsx';
import TeamPage from './TeamPage.tsx';

describe('TeamPage', () => {
  it('renders the page heading', async () => {
    renderWithProviders(<TeamPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText('Team')).toBeInTheDocument();
    });
  });

  it('renders user email from mock data', async () => {
    renderWithProviders(<TeamPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText('analyst@example.com')).toBeInTheDocument();
    });
  });

  it('renders Members and Pending tabs for admin', async () => {
    renderWithProviders(<TeamPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /members/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /pending/i })).toBeInTheDocument();
    });
  });

  it('renders table column headers', async () => {
    renderWithProviders(<TeamPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getAllByText(/email/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/role/i).length).toBeGreaterThan(0);
      expect(screen.getAllByText(/status/i).length).toBeGreaterThan(0);
    });
  });

  it('renders Edit role and Disable buttons for admin', async () => {
    renderWithProviders(<TeamPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit role/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument();
    });
  });

  it('switches to Pending tab when clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeamPage />, { authenticated: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /pending/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /pending/i }));
    await waitFor(() => {
      expect(screen.getByText(/requested role/i)).toBeInTheDocument();
    });
  });

  it('shows role edit select when Edit role is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeamPage />, { authenticated: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /edit role/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /edit role/i }));
    expect(screen.getByRole('combobox', { name: /select role/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^save$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('cancels role edit when Cancel is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeamPage />, { authenticated: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /edit role/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /edit role/i }));
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('combobox', { name: /select role/i })).not.toBeInTheDocument();
  });

  it('saves role edit when Save is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeamPage />, { authenticated: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /edit role/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /edit role/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(screen.queryByRole('combobox', { name: /select role/i })).not.toBeInTheDocument();
    });
  });

  it('disables a user when Disable is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeamPage />, { authenticated: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /disable/i }));
    // After mutation resolves the button should still be rendered (mock returns same user)
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /edit role/i })).toBeInTheDocument();
    });
  });

  it('approves a pending user', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeamPage />, { authenticated: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /pending/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /pending/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /approve/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /approve/i }));
    await waitFor(() => {
      expect(screen.queryByText(/network error/i)).not.toBeInTheDocument();
    });
  });

  it('rejects a pending user', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TeamPage />, { authenticated: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /pending/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /pending/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /reject/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /reject/i }));
    await waitFor(() => {
      expect(screen.queryByText(/network error/i)).not.toBeInTheDocument();
    });
  });
});
