import { randomUUID } from 'node:crypto';
import type { AuthSession } from '@optical/shared/account';
import type { App } from '../src/app';
import { TestBrowser } from './browser';

export const PASSWORD = 'Spectacle-Harbour-42';

export const uniqueEmail = (label = 'customer') => `${label}-${randomUUID()}@example.com`;

/** A browser that has just created an account (and is signed in). */
export async function signUp(
  app: App,
  options: { email?: string; name?: string; browser?: TestBrowser } = {},
) {
  const browser = options.browser ?? new TestBrowser(app);
  const email = options.email ?? uniqueEmail();
  const response = await browser.post('/v1/auth/register', {
    name: options.name ?? 'Meera Iyer',
    email,
    password: PASSWORD,
  });
  if (response.statusCode !== 201)
    throw new Error(`Sign-up failed: ${response.statusCode} ${response.body}`);
  return { browser, email, session: response.json<AuthSession>() };
}

/** A mutable clock for tests that move time forward. */
export function testClock(start = new Date()) {
  let current = start;
  return {
    now: () => current,
    advance(ms: number) {
      current = new Date(current.getTime() + ms);
    },
  };
}
