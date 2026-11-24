import { Router, type RequestHandler } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { methodNotAllowed } from '../../middleware/methodNotAllowed.js';
import { ok } from '../../utils/respond.js';
import { getBilling } from './billing.service.js';
import { getDashboard } from './dashboard.service.js';
import { getOccupancy } from './occupancy.service.js';

const dashboard: RequestHandler = async (_req, res) => ok(res, await getDashboard());
const occupancy: RequestHandler = async (req, res) => ok(res, await getOccupancy(req.query.from, req.query.to));
const billing: RequestHandler = async (req, res) => ok(res, await getBilling(req.query.from, req.query.to));

export const adminRouter = Router();

// Roles per spec §4: dashboard + occupancy = admin, staff; billing = admin.
adminRouter.use(requireAuth);

adminRouter.route('/dashboard').get(requireRole('admin', 'staff'), dashboard).all(methodNotAllowed);
adminRouter.route('/occupancy').get(requireRole('admin', 'staff'), occupancy).all(methodNotAllowed);
adminRouter.route('/billing').get(requireRole('admin'), billing).all(methodNotAllowed);
