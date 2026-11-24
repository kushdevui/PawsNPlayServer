import type { RequestHandler } from 'express';
import { ok } from '../../utils/respond.js';
import * as adminService from './admin.service.js';

export const getDashboard: RequestHandler = async (_req, res) => {
  ok(res, await adminService.getDashboard());
};
