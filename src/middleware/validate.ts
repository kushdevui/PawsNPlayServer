import type { RequestHandler } from 'express';
import type { ZodError, ZodTypeAny } from 'zod';
import { AppError } from '../utils/AppError.js';

export interface RequestSchemas {
  params?: ZodTypeAny;
  query?: ZodTypeAny;
  body?: ZodTypeAny;
}

const FALLBACK_MESSAGE = 'Please check the details and try again.';

/**
 * The message shown to the user. Feature schemas should set friendly messages
 * (e.g. `z.string().min(1, 'Name is required.')`) because this text reaches the app.
 */
export function firstIssueMessage(error: ZodError): string {
  return error.issues[0]?.message ?? FALLBACK_MESSAGE;
}

/**
 * Validates and replaces req.params / req.query / req.body with the parsed values.
 * Failures -> 422 VALIDATION_ERROR.
 */
export const validate =
  (schemas: RequestSchemas): RequestHandler =>
  (req, _res, next) => {
    for (const key of ['params', 'query', 'body'] as const) {
      const schema = schemas[key];
      if (!schema) continue;

      // Express 5 leaves req.body undefined when no body was sent.
      const result = schema.safeParse(req[key] ?? {});
      if (!result.success) throw AppError.validation(firstIssueMessage(result.error));

      if (key === 'query') {
        // In Express 5 req.query is a read-only getter, so redefine it on this request.
        Object.defineProperty(req, 'query', {
          value: result.data,
          writable: true,
          configurable: true,
          enumerable: true,
        });
      } else {
        req[key] = result.data;
      }
    }
    next();
  };
