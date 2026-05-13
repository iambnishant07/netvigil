import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-utils.tsx';
import PendingPage from './PendingPage.tsx';

describe('PendingPage', () => {
  it('renders the awaiting approval heading', () => {
    renderWithProviders(<PendingPage />, { authenticated: true });
    expect(screen.getByText(/awaiting approval/i)).toBeInTheDocument();
  });

  it('renders the user email', () => {
    renderWithProviders(<PendingPage />, { authenticated: true });
    expect(screen.getByText(/test@example\.com/i)).toBeInTheDocument();
  });

  it('renders a sign out button', () => {
    renderWithProviders(<PendingPage />, { authenticated: true });
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('clears tokens when sign out is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(<PendingPage />, { authenticated: true });
    await user.click(screen.getByRole('button', { name: /sign out/i }));
    expect(localStorage.getItem('nv_access_token')).toBeNull();
  });
});
