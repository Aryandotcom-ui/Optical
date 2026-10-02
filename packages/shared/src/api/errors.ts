import { z } from 'zod';

/**
 * Every error the API returns carries one of these codes. Clients branch on
 * the code, never on the message. Documented in docs/API.md.
 */
export const apiErrorCodes = [
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'CONFLICT',
  'PRICE_CHANGED',
  'OUT_OF_STOCK',
  'PAYLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA_TYPE',
  'RATE_LIMITED',
  'INTERNAL_ERROR',
  'SERVICE_UNAVAILABLE',
] as const;

export type ApiErrorCode = (typeof apiErrorCodes)[number];

/** HTTP status each code maps to. */
export const apiErrorStatus: Record<ApiErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  METHOD_NOT_ALLOWED: 405,
  CONFLICT: 409,
  PRICE_CHANGED: 409,
  OUT_OF_STOCK: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA_TYPE: 415,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
};

export const fieldIssueSchema = z.object({
  path: z.string().describe('Dot-separated location of the invalid field, e.g. "address.pinCode".'),
  message: z.string(),
});
export type FieldIssue = z.infer<typeof fieldIssueSchema>;

export const apiErrorSchema = z
  .object({
    error: z.object({
      code: z.enum(apiErrorCodes),
      message: z.string().describe('Human-readable explanation, safe to show to customers.'),
      details: z.array(fieldIssueSchema).optional(),
      requestId: z.string().describe('Quote this when contacting support.'),
    }),
  })
  .meta({ id: 'ApiError' });
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

/** Narrows an unknown JSON body to the API error envelope. */
export function isApiErrorBody(value: unknown): value is ApiErrorBody {
  return apiErrorSchema.safeParse(value).success;
}
