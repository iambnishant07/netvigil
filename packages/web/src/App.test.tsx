import { render, screen } from '@testing-library/react';
import App from './App.tsx';

describe('App', () => {
  it('renders the NetVigil heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: /netvigil/i })).toBeInTheDocument();
  });
});
