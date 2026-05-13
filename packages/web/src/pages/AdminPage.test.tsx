import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { vi } from 'vitest';
import { renderWithProviders } from '../test-utils.tsx';
import AdminPage from './AdminPage.tsx';
import { server } from '../mocks/server.ts';

describe('AdminPage', () => {
  it('renders the page heading', () => {
    renderWithProviders(<AdminPage />, { authenticated: true });
    expect(screen.getByText(/system administration/i)).toBeInTheDocument();
  });

  it('renders Organisations and All Users tabs', () => {
    renderWithProviders(<AdminPage />, { authenticated: true });
    expect(screen.getByRole('button', { name: /organisations/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /all users/i })).toBeInTheDocument();
  });

  it('renders org name from mock data', async () => {
    renderWithProviders(<AdminPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText('Test Org')).toBeInTheDocument();
    });
  });

  it('renders org timezone', async () => {
    renderWithProviders(<AdminPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText('Australia/Sydney')).toBeInTheDocument();
    });
  });

  it('does NOT show Simulate Attack panel for admin role', async () => {
    renderWithProviders(<AdminPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText('Test Org')).toBeInTheDocument();
    });
    expect(screen.queryByText(/simulate attack/i)).not.toBeInTheDocument();
  });

  it('shows Simulate Attack panel for super_admin', async () => {
    server.use(
      http.get('http://localhost:8000/api/v1/auth/me', () =>
        HttpResponse.json({
          id: '018e1234-0000-7000-8000-000000000001',
          organizationId: '018e1234-0000-7000-8000-000000000000',
          email: 'superadmin@example.com',
          role: 'super_admin',
          status: 'active',
          mfaEnrolled: false,
          createdAt: '2024-01-01T00:00:00Z',
        }),
      ),
    );
    renderWithProviders(<AdminPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /simulate attack/i })).toBeInTheDocument();
    });
  });

  it('switches to All Users view', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />, { authenticated: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /all users/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /all users/i }));
    await waitFor(() => {
      expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    });
  });

  it('renders View users link for each org row', async () => {
    renderWithProviders(<AdminPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /view users/i })).toBeInTheDocument();
    });
  });

  it('navigates into org users when View users clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />, { authenticated: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /view users/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /view users/i }));
    await waitFor(() => {
      // Back button appears when browsing org-scoped users
      expect(screen.getAllByText(/all organisations/i).length).toBeGreaterThan(0);
    });
  });

  it('renders Edit button in users table', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />, { authenticated: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /all users/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /all users/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument();
    });
  });

  it('opens edit selects and cancels', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />, { authenticated: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /all users/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /all users/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    expect(screen.getByRole('combobox', { name: /select role/i })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /select status/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(screen.queryByRole('combobox', { name: /select role/i })).not.toBeInTheDocument();
  });

  it('saves user edits', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />, { authenticated: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /all users/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /all users/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^edit$/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /^edit$/i }));
    await user.click(screen.getByRole('button', { name: /^save$/i }));
    await waitFor(() => {
      expect(screen.queryByRole('combobox', { name: /select role/i })).not.toBeInTheDocument();
    });
  });

  it('deletes a user when confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />, { authenticated: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /all users/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /all users/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /delete/i }));
    expect(window.confirm).toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it('toggles user active state', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AdminPage />, { authenticated: true });
    await waitFor(() => expect(screen.getByRole('button', { name: /all users/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /all users/i }));
    await waitFor(() => expect(screen.getByRole('button', { name: /disable/i })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: /disable/i }));
    await waitFor(() => {
      expect(screen.queryByText(/network error/i)).not.toBeInTheDocument();
    });
  });
});
