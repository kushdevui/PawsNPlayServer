import { Router } from 'express';
import { methodNotAllowed } from '../../middleware/methodNotAllowed.js';
import { getHealth } from './health.controller.js';

export const healthRouter = Router();

// Public (spec §7.1).
healthRouter.route('/').get(getHealth).all(methodNotAllowed);
