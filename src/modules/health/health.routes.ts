import { Router } from 'express';
import { getHealth } from './health.controller.js';

export const healthRouter = Router();

// Public, not part of the app contract (used by developers and uptime checks).
healthRouter.get('/', getHealth);
