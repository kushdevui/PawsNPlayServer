import { Router, type Request } from 'express';
import { env } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { methodNotAllowed } from '../../middleware/methodNotAllowed.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './auth.controller.js';
import { loginBody, logoutBody, refreshBody, registerBody, updateMeBody } from './auth.schema.js';

const isTest = env.NODE_ENV === 'test';
const emailOf = (req: Request) => {
  const email: unknown = (req.body as { email?: unknown } | undefined)?.email;
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
};
// Spec §7.2: login 10 attempts / 15 min / IP+email. Register: per IP. Refresh is looser (the app calls it often).
const loginLimiter = createRateLimiter({
  limit: isTest ? 10_000 : 10,
  keyGenerator: (req) => `${req.ip ?? 'unknown'}|${emailOf(req)}`,
});
const registerLimiter = createRateLimiter({ limit: isTest ? 10_000 : 20 });
const refreshLimiter = createRateLimiter({ limit: isTest ? 10_000 : 60 });

export const authRouter = Router();

authRouter.route('/login').post(loginLimiter, validate({ body: loginBody }), controller.login).all(methodNotAllowed);
authRouter
  .route('/register')
  .post(registerLimiter, validate({ body: registerBody }), controller.register)
  .all(methodNotAllowed);
authRouter
  .route('/refresh')
  .post(refreshLimiter, validate({ body: refreshBody }), controller.refresh)
  .all(methodNotAllowed);
// roles: any authenticated
authRouter.route('/logout').post(requireAuth, validate({ body: logoutBody }), controller.logout).all(methodNotAllowed);

export const meRouter = Router();

// roles: any authenticated
meRouter
  .route('/')
  .get(requireAuth, controller.getMe)
  .patch(requireAuth, validate({ body: updateMeBody }), controller.updateMe)
  .all(methodNotAllowed);
