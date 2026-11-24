import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import { AppError } from '../utils/AppError.js';
import { logger } from '../utils/logger.js';
import { firstIssueMessage } from './validate.js';

interface BodyParserError {
  type: string;
  status: number;
}

/** Errors thrown by express.json() (malformed JSON, payload too large, ...). */
function isBodyParserError(err: unknown): err is BodyParserError {
  return (
    typeof err === 'object' &&
    err !== null &&
    typeof (err as Partial<BodyParserError>).type === 'string' &&
    typeof (err as Partial<BodyParserError>).status === 'number' &&
    (err as BodyParserError).status < 500
  );
}

/** Central error handler: every error leaves as `{ error: { code, message, details? } }`. */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) {
    next(err);
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, ...(err.details ? { details: err.details } : {}) },
    });
    return;
  }

  if (err instanceof ZodError) {
    res.status(422).json({ error: { code: 'VALIDATION_ERROR', message: firstIssueMessage(err) } });
    return;
  }

  if (isBodyParserError(err)) {
    // The spec asks for 422 (not 400) for bad input.
    const message =
      err.type === 'entity.too.large' ? 'The request is too large.' : 'The request body is not valid JSON.';
    res.status(422).json({ error: { code: 'VALIDATION_ERROR', message } });
    return;
  }

  logger.error({ err, method: req.method, url: req.originalUrl }, 'Unhandled error');
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong. Please try again.' } });
};
