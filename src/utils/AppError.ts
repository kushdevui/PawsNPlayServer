/**
 * An expected error that becomes the API error envelope:
 * `{ "error": { "code": "CAPACITY_FULL", "message": "...", "details": { ... } } }` (details optional).
 * `message` is shown to end users, so keep it short and friendly (docs/BACKEND_API_SPEC.md §5).
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static unauthorized(message = 'Please log in again.') {
    return new AppError(401, 'UNAUTHORIZED', message);
  }

  static forbidden(message = 'You do not have access to this.') {
    return new AppError(403, 'FORBIDDEN', message);
  }

  /** Message format from the spec: "Dog not found", "Booking not found", ... */
  static notFound(label: string) {
    return new AppError(404, 'NOT_FOUND', `${label} not found`);
  }

  static validation(message = 'Please check the details and try again.', details?: Record<string, unknown>) {
    return new AppError(422, 'VALIDATION_ERROR', message, details);
  }

  /** Other 422 rule violations: INVALID_STATE, CAPACITY_FULL, DOG_ALREADY_BOOKED, OVERPAYMENT, ... */
  static rule(code: string, message: string, details?: Record<string, unknown>) {
    return new AppError(422, code, message, details);
  }
}
