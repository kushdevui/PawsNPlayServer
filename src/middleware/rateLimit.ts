import { rateLimit } from 'express-rate-limit';

export interface RateLimitOptions {
  windowMs?: number;
  limit?: number;
}

/**
 * Per-IP limiter with the error envelope. Memory store: fine for one instance; use a shared store
 * (e.g. Redis) if the API runs on several instances. Behind a proxy, set `app.set('trust proxy', ...)`.
 */
export function createRateLimiter({ windowMs = 15 * 60 * 1000, limit = 20 }: RateLimitOptions = {}) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (_req, res) => {
      // TODO(contract): confirm with app - 429 RATE_LIMITED is not in the contract yet.
      res.status(429).json({
        error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please wait a few minutes and try again.' },
      });
    },
  });
}
