import { setupServer } from 'msw/node';
import { handlers } from '@netvigil/mock-api';

export const server = setupServer(...handlers);
