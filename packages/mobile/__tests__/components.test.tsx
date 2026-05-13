import { render, screen } from '@testing-library/react-native';
import SeverityBadge from '../src/components/SeverityBadge';
import StatusBadge from '../src/components/StatusBadge';

describe('SeverityBadge', () => {
  const severities = ['critical', 'high', 'medium', 'low', 'info'] as const;

  severities.forEach((sev) => {
    it(`renders ${sev} severity`, () => {
      render(<SeverityBadge value={sev} />);
      expect(screen.getByText(sev.toUpperCase())).toBeTruthy();
    });
  });
});

describe('StatusBadge', () => {
  it('renders open status', () => {
    render(<StatusBadge value="open" />);
    expect(screen.getByText('Open')).toBeTruthy();
  });

  it('renders acknowledged status', () => {
    render(<StatusBadge value="acknowledged" />);
    expect(screen.getByText('Acknowledged')).toBeTruthy();
  });

  it('renders confirmed status', () => {
    render(<StatusBadge value="confirmed" />);
    expect(screen.getByText('Confirmed')).toBeTruthy();
  });

  it('renders false_positive status', () => {
    render(<StatusBadge value="false_positive" />);
    expect(screen.getByText('False Positive')).toBeTruthy();
  });
});
