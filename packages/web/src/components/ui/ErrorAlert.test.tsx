import { render, screen } from '@testing-library/react';
import { ErrorAlert } from './ErrorAlert.tsx';

describe('ErrorAlert', () => {
  it('renders the message', () => {
    render(<ErrorAlert message="Something went wrong" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
  });

  it('renders nothing when message is empty', () => {
    const { container } = render(<ErrorAlert message="" />);
    expect(container).toBeEmptyDOMElement();
  });
});
