import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { AuthSession, User } from '@optical/shared/account';
import type { Cart } from '@optical/shared/checkout';
import { MemoryRateLimiter } from '../src/lib/rate-limit';
import { lockoutMinutes } from '../src/modules/auth/auth.service';
import { buildDbTestApp } from './helpers';
import { PASSWORD, signUp, testClock, uniqueEmail } from './accounts';
import { stockedVariant, TestBrowser } from './browser';

const clock = testClock();
let context: Awaited<ReturnType<typeof buildDbTestApp>>;

beforeAll(async () => {
  context = await buildDbTestApp({ now: clock.now });
});
afterAll(async () => {
  await context.app.close();
});

const login = (browser: TestBrowser, email: string, password = PASSWORD) =>
  browser.post('/v1/auth/login', { email, password });

describe('registration', () => {
  it('creates an account, signs in with hardened cookies and stores only an argon2id hash', async () => {
    const browser = new TestBrowser(context.app);
    const email = uniqueEmail();
    const response = await browser.post('/v1/auth/register', {
      name: 'Meera Iyer',
      email: email.toUpperCase(),
      password: PASSWORD,
    });
    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const session = response.json<AuthSession>();
    expect(session.user).toMatchObject({ email, name: 'Meera Iyer', role: 'CUSTOMER' });
    expect(JSON.stringify(session)).not.toContain('passwordHash');

    const cookies = Object.fromEntries(response.cookies.map((cookie) => [cookie.name, cookie]));
    expect(cookies.lo_access).toMatchObject({ httpOnly: true, sameSite: 'Strict', path: '/' });
    expect(cookies.lo_refresh).toMatchObject({
      httpOnly: true,
      sameSite: 'Strict',
      path: '/v1/auth',
    });
    // The hint cookie is readable by scripts but carries no secret.
    expect(cookies.lo_auth).toMatchObject({ value: '1' });
    expect(cookies.lo_auth?.httpOnly).toBeFalsy();

    const row = await context.db.user.findUniqueOrThrow({ where: { email } });
    expect(row.passwordHash).toMatch(/^\$argon2id\$/);
    expect(row.passwordHash).not.toContain(PASSWORD);
    expect(await context.db.emailOutbox.count({ where: { to: email, template: 'welcome' } })).toBe(
      1,
    );

    expect((await browser.get('/v1/auth/me')).json<User>().email).toBe(email);
  });

  it('refuses a second account with the same email', async () => {
    const { email } = await signUp(context.app);
    const response = await new TestBrowser(context.app).post('/v1/auth/register', {
      name: 'Someone Else',
      email,
      password: 'Another-Good-Passphrase',
    });
    expect(response.statusCode).toBe(409);
  });

  it.each([
    ['too short', 'short1'],
    ['a common password', 'password123'],
    ['containing the email name', 'kavya.rao-2026!'],
  ])('rejects a password that is %s', async (_label, password) => {
    const response = await new TestBrowser(context.app).post('/v1/auth/register', {
      name: 'Kavya Rao',
      email: `kavya.rao@${Date.now()}.example.com`,
      password,
    });
    expect(response.statusCode).toBe(422);
    expect(response.json<{ error: { details: { path: string }[] } }>().error.details[0]?.path).toBe(
      'body.password',
    );
  });
});

describe('sign-in and lockout', () => {
  it('gives the same answer for an unknown email and a wrong password', async () => {
    const { email } = await signUp(context.app);
    const wrong = await login(new TestBrowser(context.app), email, 'not-the-password');
    const unknown = await login(new TestBrowser(context.app), uniqueEmail('nobody'));
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json<{ error: { message: string } }>().error.message).toBe(
      unknown.json<{ error: { message: string } }>().error.message,
    );
  });

  it('backs off exponentially after five failures, and refuses even the right password meanwhile', async () => {
    expect([4, 5, 6, 7, 10, 11, 20].map(lockoutMinutes)).toEqual([0, 1, 2, 4, 32, 60, 60]);

    const { email } = await signUp(context.app);
    const browser = new TestBrowser(context.app);
    for (let attempt = 1; attempt <= 4; attempt += 1)
      expect((await login(browser, email, `wrong-${attempt}`)).statusCode).toBe(401);
    expect((await login(browser, email, 'wrong-5')).statusCode).toBe(429);
    expect((await login(browser, email)).statusCode).toBe(429);

    clock.advance(61_000);
    expect((await login(browser, email, 'wrong-6')).statusCode).toBe(429);
    const user = await context.db.user.findUniqueOrThrow({ where: { email } });
    expect(user.failedLoginCount).toBe(6);
    expect(user.lockedUntil!.getTime() - clock.now().getTime()).toBe(2 * 60_000);

    clock.advance(2 * 60_000 + 1000);
    expect((await login(browser, email)).statusCode).toBe(200);
    const after = await context.db.user.findUniqueOrThrow({ where: { email } });
    expect(after).toMatchObject({ failedLoginCount: 0, lockedUntil: null });
  });

  it('limits sign-in attempts per address', async () => {
    const limited = await buildDbTestApp({ rateLimiter: new MemoryRateLimiter() });
    try {
      const browser = new TestBrowser(limited.app);
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 11; attempt += 1)
        statuses.push((await login(browser, uniqueEmail('limit'))).statusCode);
      expect(statuses.slice(0, 10).every((status) => status === 401)).toBe(true);
      expect(statuses[10]).toBe(429);
    } finally {
      await limited.app.close();
    }
  });

  it('refuses sign-in and account writes from another site, even without cookies', async () => {
    const { email } = await signUp(context.app);
    const evil = await new TestBrowser(context.app).request('POST', '/v1/auth/login', {
      body: { email, password: PASSWORD },
      origin: 'https://evil.example',
    });
    expect(evil.statusCode).toBe(403);
    const missing = await new TestBrowser(context.app).request('POST', '/v1/auth/login', {
      body: { email, password: PASSWORD },
      origin: null,
    });
    expect(missing.statusCode).toBe(403);
  });
});

describe('tokens', () => {
  it('rotates the refresh token and expires access after 15 minutes', async () => {
    const { browser } = await signUp(context.app);
    clock.advance(16 * 60_000);
    const stale = await browser.get('/v1/cart');
    expect(stale.statusCode).toBe(401);
    expect(stale.json<{ error: { code: string } }>().error.code).toBe('UNAUTHENTICATED');

    const before = browser.jar.get('lo_refresh')?.value;
    const refreshed = await browser.post('/v1/auth/refresh');
    expect(refreshed.statusCode).toBe(200);
    expect(browser.jar.get('lo_refresh')?.value).not.toBe(before);
    expect((await browser.get('/v1/cart')).statusCode).toBe(200);
  });

  it('treats reuse of a rotated refresh token as theft and ends that sign-in everywhere', async () => {
    const { browser, session } = await signUp(context.app);
    const stolen = browser.jar.get('lo_refresh')!.value;
    expect((await browser.post('/v1/auth/refresh')).statusCode).toBe(200);

    // Two tabs refreshing together: a repeat within seconds still gets an access token.
    const thief = new TestBrowser(context.app);
    thief.jar.set('lo_refresh', { value: stolen, path: '/v1/auth' });
    const graced = await thief.post('/v1/auth/refresh');
    expect(graced.statusCode).toBe(200);
    expect(graced.cookies.some((cookie) => cookie.name === 'lo_refresh')).toBe(false);

    clock.advance(60_000);
    thief.jar.set('lo_refresh', { value: stolen, path: '/v1/auth' });
    const reused = await thief.post('/v1/auth/refresh');
    expect(reused.statusCode).toBe(401);
    // Cookies are cleared on failure.
    expect(thief.jar.has('lo_access')).toBe(false);

    // The legitimate browser is signed out too: its access token's family is revoked.
    expect((await browser.get('/v1/auth/me')).statusCode).toBe(401);
    expect((await browser.post('/v1/auth/refresh')).statusCode).toBe(401);
    const audit = await context.db.auditLog.count({
      where: { entityId: session.user.id, action: 'auth.refresh-token-reuse' },
    });
    expect(audit).toBe(1);
  });

  it('rejects a forged or tampered access token', async () => {
    const { browser } = await signUp(context.app);
    const token = browser.jar.get('lo_access')!.value;
    const [header, payload] = token.split('.');
    const claims = JSON.parse(Buffer.from(payload!, 'base64url').toString()) as Record<
      string,
      unknown
    >;
    const forged = Buffer.from(JSON.stringify({ ...claims, role: 'ADMIN' })).toString('base64url');
    const unsigned = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${payload}.`;
    for (const value of [`${header}.${forged}.${token.split('.')[2]}`, unsigned]) {
      const response = await context.app.inject({
        method: 'GET',
        url: '/v1/auth/me',
        headers: { cookie: `lo_access=${value}` },
      });
      expect(response.statusCode).toBe(401);
    }
  });

  it('signs out: the access token stops working at once', async () => {
    const { browser } = await signUp(context.app);
    const access = browser.jar.get('lo_access')!.value;
    const response = await browser.post('/v1/auth/logout');
    expect(response.statusCode).toBe(204);
    expect(browser.jar.size).toBe(0);
    const replay = await context.app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: { cookie: `lo_access=${access}` },
    });
    expect(replay.statusCode).toBe(401);
  });
});

describe('password recovery', () => {
  const resetToken = async (email: string) => {
    const row = await context.db.emailOutbox.findFirstOrThrow({
      where: { to: email, template: 'password-reset' },
      orderBy: { createdAt: 'desc' },
    });
    const url = (row.payload as { data: { resetUrl: string } }).data.resetUrl;
    expect(url).toContain('/reset-password#token=');
    return url.split('#token=')[1]!;
  };

  it('answers the same for unknown emails and emails a single-use link', async () => {
    const unknown = uniqueEmail('ghost');
    const ghost = await new TestBrowser(context.app).post('/v1/auth/forgot-password', {
      email: unknown,
    });
    expect(ghost.statusCode).toBe(202);
    expect(await context.db.emailOutbox.count({ where: { to: unknown } })).toBe(0);

    const { email, browser } = await signUp(context.app);
    const guest = new TestBrowser(context.app);
    expect((await guest.post('/v1/auth/forgot-password', { email })).statusCode).toBe(202);
    const token = await resetToken(email);
    const stored = await context.db.passwordResetToken.findFirstOrThrow({
      where: { user: { email } },
    });
    expect(stored.tokenHash).not.toBe(token);

    const newPassword = 'Lighthouse-Keeper-77';
    const reset = await guest.post('/v1/auth/reset-password', { token, password: newPassword });
    expect(reset.statusCode).toBe(204);
    expect(
      (await guest.post('/v1/auth/reset-password', { token, password: newPassword })).statusCode,
    ).toBe(422);

    // Every existing sign-in ends; the old password no longer works.
    expect((await browser.get('/v1/auth/me')).statusCode).toBe(401);
    expect((await login(guest, email)).statusCode).toBe(401);
    expect((await login(guest, email, newPassword)).statusCode).toBe(200);
    expect(
      await context.db.emailOutbox.count({ where: { to: email, template: 'password-changed' } }),
    ).toBe(1);
  });

  it('expires reset links and caps how many are sent', async () => {
    const { email } = await signUp(context.app);
    const guest = new TestBrowser(context.app);
    for (let attempt = 0; attempt < 5; attempt += 1)
      await guest.post('/v1/auth/forgot-password', { email });
    expect(
      await context.db.emailOutbox.count({ where: { to: email, template: 'password-reset' } }),
    ).toBe(3);
    const token = await resetToken(email);
    clock.advance(31 * 60_000);
    const late = await guest.post('/v1/auth/reset-password', {
      token,
      password: 'Lighthouse-Keeper-77',
    });
    expect(late.statusCode).toBe(422);
  });
});

describe('password change and account deletion', () => {
  it('changes the password, keeping this device and signing out the others', async () => {
    const { browser, email } = await signUp(context.app);
    const other = new TestBrowser(context.app);
    expect((await login(other, email)).statusCode).toBe(200);

    const wrong = await browser.post('/v1/account/password', {
      currentPassword: 'not-it',
      newPassword: 'Orchard-Window-2027',
    });
    expect(wrong.statusCode).toBe(422);
    const changed = await browser.post('/v1/account/password', {
      currentPassword: PASSWORD,
      newPassword: 'Orchard-Window-2027',
    });
    expect(changed.statusCode).toBe(204);
    expect((await browser.get('/v1/auth/me')).statusCode).toBe(200);
    expect((await other.get('/v1/auth/me')).statusCode).toBe(401);
  });

  it('deletes the account after checking the password', async () => {
    const { browser, email, session } = await signUp(context.app);
    expect((await browser.post('/v1/account/delete', { password: 'nope' })).statusCode).toBe(422);
    expect((await browser.post('/v1/account/delete', { password: PASSWORD })).statusCode).toBe(204);
    expect((await browser.get('/v1/auth/me')).statusCode).toBe(401);
    expect((await login(new TestBrowser(context.app), email)).statusCode).toBe(401);
    const row = await context.db.user.findUniqueOrThrow({ where: { id: session.user.id } });
    expect(row).toMatchObject({ passwordHash: null, phone: null });
    expect(row.email).not.toBe(email);
    expect(row.deletedAt).not.toBeNull();
    // The email address can be used for a new account.
    await signUp(context.app, { email });
  });
});

describe('guest bag on sign-in', () => {
  it('moves the guest bag into the account and merges matching lines', async () => {
    const frame = await stockedVariant(context.db, 'juniper');
    const { browser, email } = await signUp(context.app);
    await browser.post('/v1/cart/items', { variantId: frame.id });
    await browser.post('/v1/auth/logout');

    const guest = new TestBrowser(context.app);
    await guest.post('/v1/cart/items', { variantId: frame.id, quantity: 2 });
    const signedIn = await login(guest, email);
    expect(signedIn.json<AuthSession>().mergedCartItems).toBe(2);
    const cart = (await guest.get('/v1/cart')).json<Cart>();
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]?.quantity).toBe(3);

    // The guest bag is gone: signing out shows an empty bag, the account keeps it.
    await guest.post('/v1/auth/logout');
    expect((await guest.get('/v1/cart')).json<Cart>().itemCount).toBe(0);
  });
});
