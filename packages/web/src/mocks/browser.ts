import { setupWorker } from 'msw/browser';
import { handlers } from '@aankhanet/mock-api';

export const worker = setupWorker(...handlers);
