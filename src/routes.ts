import { Router } from 'express';
import { healthRouter } from './modules/health/health.routes.js';

/** Everything under /api/v1. Feature routers are added here milestone by milestone. */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
