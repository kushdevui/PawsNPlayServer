import { Router } from 'express';
import { env } from '../../config/env.js';
import { requireAuth } from '../../middleware/auth.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './auth.controller.js';
import { loginBody, logoutBody, refreshBody, registerBody, updateMeBody } from './auth.schema.js';

const isTest = env.NODE_ENV === 'test';
// Per IP, 15-minute window. Refresh is looser because the app calls it every time the access token expires.
const credentialsLimiter = createRateLimiter({ limit: isTest ? 10_000 : 20 });
const refreshLimiter = createRateLimiter({ limit: isTest ? 10_000 : 60 });

export const authRouter = Router();

authRouter.post('/login', credentialsLimiter, validate({ body: loginBody }), controller.login);
authRouter.post('/register', credentialsLimiter, validate({ body: registerBody }), controller.register);
authRouter.post('/refresh', refreshLimiter, validate({ body: refreshBody }), controller.refresh);
authRouter.post('/logout', requireAuth, validate({ body: logoutBody }), controller.logout); // roles: any

export const meRouter = Router();

meRouter.get('/', requireAuth, controller.getMe); // roles: any
meRouter.patch('/', requireAuth, validate({ body: updateMeBody }), controller.updateMe); // roles: any
