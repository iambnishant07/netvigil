import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test-utils.tsx';
import IncidentDetailPage from './IncidentDetailPage.tsx';

const INCIDENT_ID = '018e1234-0000-7000-8000-000000000020';

function renderDetail() {
  return renderWithProviders(
    <Routes>
      <Route path="/incidents/:id" element={<IncidentDetailPage />} />
    </Routes>,
    { authenticated: true, initialPath: `/incidents/${INCIDENT_ID}` },
  );
}

describe('IncidentDetailPage', () => {
  it('shows loading spinner then renders incident details', async () => {
    renderDetail();
    expect(screen.getByRole('status')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText(/c2 beaconing/i)).toBeInTheDocument();
    });
  });

  it('renders MITRE technique badge', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('T1071')).toBeInTheDocument();
    });
  });

  it('renders source and destination IPs', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText('198.51.100.99')).toBeInTheDocument();
    });
    expect(screen.getByText('10.0.0.5')).toBeInTheDocument();
  });

  it('renders AI narrative for incidents that have one', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/AI Narrative/i)).toBeInTheDocument();
    });
  });

  it('renders the status update form', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/update status/i)).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /save status/i })).toBeInTheDocument();
  });

  it('save status button is disabled when no status selected', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save status/i })).toBeDisabled();
    });
  });

  it('save status button enables when status is selected', async () => {
    const user = userEvent.setup();
    renderDetail();
    await waitFor(() => {
      expect(screen.getByText(/update status/i)).toBeInTheDocument();
    });
    const select = screen.getAllByRole('combobox')[0]!;
    await user.selectOptions(select, 'acknowledged');
    expect(screen.getByRole('button', { name: /save status/i })).not.toBeDisabled();
  });

  it('has a back link to incidents list', async () => {
    renderDetail();
    await waitFor(() => {
      expect(screen.getByRole('link', { name: /back to incidents/i })).toHaveAttribute(
        'href',
        '/incidents',
      );
    });
  });
});
