import { apiErrorStatus, type ApiErrorCode, type FieldIssue } from '@optical/shared/api';

/**
 * A known, expected failure. Services throw these; the error handler turns
 * them into the standard envelope. The message must be safe to show to
 * customers: say what happened and how to recover.
 */
export class AppError extends Error {
  override name = 'AppError';
  readonly statusCode: number;

  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: FieldIssue[],
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.statusCode = apiErrorStatus[code];
  }

  static notFound(message = 'We could not find what you were looking for.') {
    return new AppError('NOT_FOUND', message);
  }
}
