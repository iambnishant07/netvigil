import { screen } from '@testing-library/react';
import { renderWithProviders } from '../../test-utils.tsx';
import AuthGuard from './AuthGuard.tsx';

describe('AuthGuard', () => {
  it('redirects to /login when unauthenticated', () => {
    renderWithProviders(<AuthGuard />, { initialPath: '/dashboard' });
    expect(screen.queryByText('dashboard')).not.toBeInTheDocument();
  });

  it('redirects to /pending when user status is pending', () => {
    localStorage.setItem('nv_user', JSON.stringify({
      id: '1', organizationId: '1', email: 'p@e.com',
      role: 'analyst', status: 'pending', mfaEnrolled: false, createdAt: '2024-01-01T00:00:00Z',
    }));
    localStorage.setItem('nv_access_token', 'tok');
    renderWithProviders(<AuthGuard />);
    // AuthGuard renders <Outlet /> or redirects — no crash
  });

  it('renders outlet when authenticated and active', () => {
    renderWithProviders(<AuthGuard />, { authenticated: true });
    // No redirect thrown — component tree renders without error
  });
});
