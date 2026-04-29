import { render, screen } from '@testing-library/react-native';
import App from '../App';

describe('App', () => {
  it('renders NetVigil text', () => {
    render(<App />);
    expect(screen.getByText('NetVigil')).toBeTruthy();
  });
});
