import type { ApiErrorBody, ApiErrorCode, FieldIssue } from '@optical/shared/api';
import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { AppError } from '../lib/app-error';

const statusToCode: Partial<Record<number, ApiErrorCode>> = {
  400: 'BAD_REQUEST',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  405: 'METHOD_NOT_ALLOWED',
  409: 'CONFLICT',
  413: 'PAYLOAD_TOO_LARGE',
  415: 'UNSUPPORTED_MEDIA_TYPE',
  422: 'VALIDATION_FAILED',
  429: 'RATE_LIMITED',
  503: 'SERVICE_UNAVAILABLE',
};

const friendlyMessages: Partial<Record<ApiErrorCode, string>> = {
  BAD_REQUEST: 'The request could not be read. Check it and try again.',
  PAYLOAD_TOO_LARGE: 'That upload is too large.',
  UNSUPPORTED_MEDIA_TYPE: 'That content type is not supported here.',
  RATE_LIMITED: 'Too many requests. Wait a moment and try again.',
};

function send(
  reply: FastifyReply,
  request: FastifyRequest,
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: FieldIssue[],
) {
  const body: ApiErrorBody = {
    error: { code, message, requestId: request.id, ...(details?.length ? { details } : {}) },
  };
  return reply.status(status).type('application/json').send(body);
}

/** Converts every thrown error into the `{ error: { code, message, details, requestId } }` envelope. */
export const errorHandlerPlugin = fp(
  (app: FastifyInstance) => {
    app.setErrorHandler((error: FastifyError, request, reply) => {
      if (hasZodFastifySchemaValidationErrors(error)) {
        const details = error.validation.map((issue) => ({
          path: [error.validationContext, ...issue.instancePath.split('/').filter(Boolean)]
            .filter(Boolean)
            .join('.'),
          message: issue.message ?? 'Invalid value.',
        }));
        return send(
          reply,
          request,
          422,
          'VALIDATION_FAILED',
          'Some fields need attention.',
          details,
        );
      }

      if (error instanceof AppError) {
        if (error.statusCode >= 500) request.log.error({ err: error }, error.message);
        return send(reply, request, error.statusCode, error.code, error.message, error.details);
      }

      if (isResponseSerializationError(error)) {
        request.log.error({ err: error }, 'Response did not match its schema');
        return send(reply, request, 500, 'INTERNAL_ERROR', 'Something went wrong on our side.');
      }

      const status = error.statusCode ?? 500;
      const code = statusToCode[status];
      if (status < 500 && code) {
        return send(reply, request, status, code, friendlyMessages[code] ?? error.message);
      }

      request.log.error({ err: error }, 'Unhandled error');
      return send(
        reply,
        request,
        500,
        'INTERNAL_ERROR',
        'Something went wrong on our side. Please try again; if it keeps happening, contact support with the request ID.',
      );
    });

    app.setNotFoundHandler((request, reply) =>
      send(reply, request, 404, 'NOT_FOUND', `No route for ${request.method} ${request.url}.`),
    );
  },
  { name: 'error-handler' },
);
