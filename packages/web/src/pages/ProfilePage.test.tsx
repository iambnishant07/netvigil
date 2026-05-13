import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-utils.tsx';
import ProfilePage from './ProfilePage.tsx';

describe('ProfilePage', () => {
  it('renders the page heading', async () => {
    renderWithProviders(<ProfilePage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText(/my profile/i)).toBeInTheDocument();
    });
  });

  it('renders account details after load', async () => {
    renderWithProviders(<ProfilePage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getAllByText(/account details/i).length).toBeGreaterThan(0);
    });
  });

  it('renders personal information form', async () => {
    renderWithProviders(<ProfilePage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getAllByText(/personal information/i).length).toBeGreaterThan(0);
    });
    expect(screen.getByLabelText(/full name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
  });

  it('renders sign-in methods section', async () => {
    renderWithProviders(<ProfilePage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText(/sign-in methods/i)).toBeInTheDocument();
    });
  });

  it('renders save changes button', async () => {
    renderWithProviders(<ProfilePage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save changes/i })).toBeInTheDocument();
    });
  });

  it('saves profile when form is submitted with changed field', async () => {
    const user = userEvent.setup();
    renderWithProviders(<ProfilePage />, { authenticated: true });
    await waitFor(() => expect(screen.getByLabelText(/full name/i)).toBeInTheDocument());
    await user.clear(screen.getByLabelText(/full name/i));
    await user.type(screen.getByLabelText(/full name/i), 'New Name');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => {
      expect(screen.queryByText(/network error/i)).not.toBeInTheDocument();
    });
  });
});
