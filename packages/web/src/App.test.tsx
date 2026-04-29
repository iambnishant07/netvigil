import { screen } from '@testing-library/react';
import { renderWithProviders, TEST_USER } from './test-utils.tsx';
import { useAuth } from './contexts/auth-context.tsx';

function AuthState() {
  const { isAuthenticated, user } = useAuth();
  return (
    <div>
      <span data-testid="state">{isAuthenticated ? 'authed' : 'anon'}</span>
      {user !== null && <span data-testid="email">{user.email}</span>}
    </div>
  );
}

describe('AuthProvider', () => {
  it('is anonymous by default', () => {
    renderWithProviders(<AuthState />);
    expect(screen.getByTestId('state')).toHaveTextContent('anon');
  });

  it('is authenticated when token is pre-loaded', () => {
    renderWithProviders(<AuthState />, { authenticated: true });
    expect(screen.getByTestId('state')).toHaveTextContent('authed');
    expect(screen.getByTestId('email')).toHaveTextContent(TEST_USER.email);
  });
});
