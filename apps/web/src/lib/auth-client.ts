import { createAuthClient } from 'better-auth/react';

export const authClient = createAuthClient({
  // Auth requests go to /api/auth/* on same origin, proxied to backend
  baseURL: typeof window !== 'undefined'
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002'),
});
