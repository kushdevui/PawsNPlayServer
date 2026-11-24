/**
 * An expected error that becomes the API error envelope:
 * `{ "error": { "code": "NOT_FOUND", "message": "Booking not found" } }`.
 * `message` is shown to end users, so keep it short and friendly.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }

  static unauthorized(message = 'Please log in again.') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'You do not have access to this.') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  /** Also used when the record exists but belongs to someone else (never leak existence). */
  static notFound(label: string) {
    return new AppError(404, 'NOT_FOUND', `${label} not found`);
  }

  static validation(message = 'Please check the details and try again.') {
    return new AppError(422, 'VALIDATION_ERROR', message);
  }

  static invalidState(message: string) {
    return new AppError(422, 'INVALID_STATE', message);
  }
}
