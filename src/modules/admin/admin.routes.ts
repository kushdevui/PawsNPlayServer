import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import * as controller from './admin.controller.js';

export const adminRouter = Router();

// roles: admin (docs/endpoints.json)
adminRouter.use(requireAuth, requireRole('admin'));

adminRouter.get('/dashboard', controller.getDashboard);
