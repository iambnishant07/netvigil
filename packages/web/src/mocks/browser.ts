import { setupWorker } from 'msw/browser';
import { handlers } from '@netvigil/mock-api';

export const worker = setupWorker(...handlers);
