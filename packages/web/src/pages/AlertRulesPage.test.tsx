import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '../test-utils.tsx';
import AlertRulesPage from './AlertRulesPage.tsx';

describe('AlertRulesPage', () => {
  it('renders seeded alert rules', async () => {
    renderWithProviders(<AlertRulesPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByText('Critical incidents — email')).toBeInTheDocument();
    });
    expect(screen.getByText('High & above — SMS')).toBeInTheDocument();
  });

  it('shows Create rule button', async () => {
    renderWithProviders(<AlertRulesPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create rule/i })).toBeInTheDocument();
    });
  });

  it('toggles creation form on button click', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AlertRulesPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create rule/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /create rule/i }));
    expect(screen.getByLabelText(/rule name/i)).toBeInTheDocument();
  });

  it('shows validation error when name is empty', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AlertRulesPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create rule/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /create rule/i }));
    await user.click(screen.getByRole('button', { name: /^create$/i }));
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
  });

  it('creates a rule successfully', async () => {
    const user = userEvent.setup();
    renderWithProviders(<AlertRulesPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /create rule/i })).toBeInTheDocument();
    });
    await user.click(screen.getByRole('button', { name: /create rule/i }));
    await user.type(screen.getByLabelText(/rule name/i), 'My New Rule');
    await user.click(screen.getByRole('button', { name: /^create$/i }));
    await waitFor(() => {
      expect(screen.queryByLabelText(/rule name/i)).not.toBeInTheDocument();
    });
  });

  it('renders enable/disable toggle buttons', async () => {
    renderWithProviders(<AlertRulesPage />, { authenticated: true });
    await waitFor(() => {
      expect(screen.getAllByRole('switch')).not.toHaveLength(0);
    });
  });
});
