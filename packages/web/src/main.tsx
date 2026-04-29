import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

async function prepare(): Promise<void> {
  if (import.meta.env.DEV) {
    const { worker } = await import('./mocks/browser.ts');
    await worker.start({ onUnhandledRequest: 'bypass' });
  }
}

const rootEl = document.getElementById('root');
if (rootEl === null) throw new Error('Root element #root not found');

prepare()
  .then(() => {
    createRoot(rootEl).render(
      <StrictMode>
        <App />
      </StrictMode>,
    );
  })
  .catch((err: unknown) => console.error(err));
