import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-utils.tsx';
import RegisterPage from './RegisterPage.tsx';

describe('RegisterPage', () => {
  it('renders all form fields', () => {
    renderWithProviders(<RegisterPage />);
    expect(screen.getByLabelText(/organisation name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/timezone/i)).toBeInTheDocument();
  });

  it('shows error when password is too short', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await user.type(screen.getByLabelText(/organisation name/i), 'Acme');
    await user.type(screen.getByLabelText(/email/i), 'test@example.com');
    await user.type(screen.getByLabelText(/password/i), 'short');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/at least 12 characters/i)).toBeInTheDocument();
  });

  it('shows error when org name is too short', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await user.type(screen.getByLabelText(/organisation name/i), 'A');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/at least 2 characters/i)).toBeInTheDocument();
  });

  it('submits successfully and stores token', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RegisterPage />);
    await user.type(screen.getByLabelText(/organisation name/i), 'Acme Pty Ltd');
    await user.type(screen.getByLabelText(/email/i), 'admin@example.com');
    await user.type(screen.getByLabelText(/password/i), 'supersecurepass!');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => {
      expect(localStorage.getItem('nv_access_token')).toBe('mock-access-token');
    });
  });

  it('has a link to sign in page', () => {
    renderWithProviders(<RegisterPage />);
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });
});
