/**
 * The shared demo account. The login page signs into it via the
 * "Demo Account" button; `scripts/seed-demo.ts` creates it and fills it
 * with a year of generated data.
 */
export const DEMO_USER = {
  email: 'consistent@example.com',
  name: 'Demo User',
  password: 'testpassword123',
} as const
