import type { Request } from 'express';
import { rateLimit } from 'express-rate-limit';

export interface RateLimitOptions {
  windowMs?: number;
  limit?: number;
  /** Default: per IP. */
  keyGenerator?: (req: Request) => string;
}

/**
 * Limiter with the error envelope (429 RATE_LIMITED, spec §5). Memory store: fine for one instance; use a
 * shared store (e.g. Redis) if the API runs on several. Behind a proxy, set `app.set('trust proxy', ...)`.
 */
export function createRateLimiter({ windowMs = 15 * 60 * 1000, limit = 20, keyGenerator }: RateLimitOptions = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ...(keyGenerator ? { keyGenerator } : {}),
    handler: (_req, res) => {
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes and try again.' },
      });
    },
  });
}
