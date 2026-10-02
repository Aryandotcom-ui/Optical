import {
  authSessionSchema,
  forgotPasswordSchema,
  loginSchema,
  registerFromOrderSchema,
  registerSchema,
  resetPasswordSchema,
  userSchema,
} from '@optical/shared/account';
import { apiErrorSchema } from '@optical/shared/api';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { rateLimit, rateLimits, type RateLimiter } from '../../lib/rate-limit';
import { REFRESH_COOKIE } from '../../plugins/auth';
import type { AuthService, ClientContext, IssuedSession } from './auth.service';

const errors = {
  401: apiErrorSchema,
  403: apiErrorSchema,
  409: apiErrorSchema,
  422: apiErrorSchema,
  429: apiErrorSchema,
};

function context(request: FastifyRequest): ClientContext {
  return {
    sessionHash: request.sessionHash,
    userAgent: request.headers['user-agent'] ?? null,
  };
}

function issue(reply: FastifyReply, issued: IssuedSession) {
  reply.setAuthCookies({
    access: issued.access,
    ...(issued.refresh ? { refresh: issued.refresh } : {}),
  });
  return issued.session;
}

export const authRoutes: FastifyPluginAsyncZod<{ service: AuthService; limiter: RateLimiter }> = (
  app,
  { service, limiter },
) => {
  app.addHook('onSend', (_request, reply, payload, done) => {
    void reply.header('cache-control', 'no-store');
    done(null, payload);
  });

  app.post(
    '/auth/register',
    {
      preHandler: rateLimit(limiter, rateLimits.register),
      schema: {
        tags: ['auth'],
        summary: 'Create an account',
        description:
          'Creates an account and signs in. Anything in this browser’s guest bag, and any prescription uploads, move into the account.',
        body: registerSchema,
        response: { 201: authSessionSchema, ...errors },
      },
    },
    async (request, reply) => {
      const issued = await service.register(request.body, context(request));
      return reply.status(201).send(issue(reply, issued));
    },
  );

  app.post(
    '/auth/login',
    {
      preHandler: rateLimit(limiter, rateLimits.login),
      schema: {
        tags: ['auth'],
        summary: 'Sign in',
        description:
          'Sets the access and refresh cookies and merges the guest bag. After five wrong passwords in a row, sign-in to that account pauses for 1, 2, 4 … up to 60 minutes (`RATE_LIMITED`).',
        body: loginSchema,
        response: { 200: authSessionSchema, ...errors },
      },
    },
    async (request, reply) => issue(reply, await service.login(request.body, context(request))),
  );

  app.post(
    '/auth/refresh',
    {
      preHandler: rateLimit(limiter, rateLimits.refresh),
      schema: {
        tags: ['auth'],
        summary: 'Refresh the sign-in',
        description:
          'Exchanges the refresh cookie for new access and refresh cookies. Presenting a refresh token that was already exchanged ends that sign-in on every device.',
        response: { 200: authSessionSchema, ...errors },
      },
    },
    async (request, reply) => {
      try {
        return issue(
          reply,
          await service.refresh(
            request.cookies[REFRESH_COOKIE],
            request.headers['user-agent'] ?? null,
          ),
        );
      } catch (error) {
        reply.clearAuthCookies();
        throw error;
      }
    },
  );

  app.post(
    '/auth/logout',
    {
      schema: {
        tags: ['auth'],
        summary: 'Sign out',
        description: 'Ends this device’s sign-in and clears the cookies. Always succeeds.',
        response: { 204: z.null(), 403: apiErrorSchema },
      },
    },
    async (request, reply) => {
      await service.logout(request.cookies[REFRESH_COOKIE], request.accessClaims?.familyId ?? null);
      reply.clearAuthCookies();
      return reply.status(204).send(null);
    },
  );

  app.get(
    '/auth/me',
    {
      schema: {
        tags: ['auth'],
        summary: 'Who is signed in',
        response: { 200: userSchema, 401: apiErrorSchema },
      },
    },
    async (request) => service.me((await request.requireUser()).userId),
  );

  app.post(
    '/auth/forgot-password',
    {
      preHandler: rateLimit(limiter, rateLimits.forgotPassword),
      schema: {
        tags: ['auth'],
        summary: 'Email a reset link',
        description:
          'Always answers 202, whether or not the email has an account. At most three links per account per hour; each works once, for 30 minutes.',
        body: forgotPasswordSchema,
        response: { 202: z.object({ sent: z.literal(true) }), ...errors },
      },
    },
    async (request, reply) => {
      await service.forgotPassword(request.body.email);
      return reply.status(202).send({ sent: true });
    },
  );

  app.post(
    '/auth/reset-password',
    {
      preHandler: rateLimit(limiter, rateLimits.resetPassword),
      schema: {
        tags: ['auth'],
        summary: 'Choose a new password',
        description:
          'Uses the token from the emailed link. Signs out every device and lifts any sign-in pause; sign in again afterwards.',
        body: resetPasswordSchema,
        response: { 204: z.null(), ...errors },
      },
    },
    async (request, reply) => {
      await service.resetPassword(request.body);
      return reply.status(204).send(null);
    },
  );

  app.post(
    '/auth/register-from-order',
    {
      preHandler: rateLimit(limiter, rateLimits.register),
      schema: {
        tags: ['auth'],
        summary: 'Create an account after a guest order',
        description:
          'Uses the order’s access token and email: the customer only chooses a password. The order moves into the new account.',
        body: registerFromOrderSchema,
        response: { 201: authSessionSchema, 404: apiErrorSchema, ...errors },
      },
    },
    async (request, reply) => {
      const issued = await service.registerFromOrder(request.body, context(request));
      return reply.status(201).send(issue(reply, issued));
    },
  );

  return Promise.resolve();
};
