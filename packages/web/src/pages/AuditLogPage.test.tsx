import { screen, waitFor } from '@testing-library/react';
import { renderWithProviders } from '../test-utils.tsx';
import AuditLogPage from './AuditLogPage.tsx';

describe('AuditLogPage', () => {
  it('renders the page heading', async () => {
    renderWithProviders(<AuditLogPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: /audit log/i })).toBeInTheDocument();
    });
  });

  it('renders log entries after load', async () => {
    renderWithProviders(<AuditLogPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText('admin@example.com')).toBeInTheDocument();
    });
  });

  it('renders action column header', async () => {
    renderWithProviders(<AuditLogPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getAllByText(/action/i).length).toBeGreaterThan(0);
    });
  });
});
