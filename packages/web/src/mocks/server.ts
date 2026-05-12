import { setupServer } from 'msw/node';
import { handlers } from '@aankhanet/mock-api';

export const server = setupServer(...handlers);
