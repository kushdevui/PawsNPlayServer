import { Router, type RequestHandler } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { methodNotAllowed } from '../../middleware/methodNotAllowed.js';
import { validate } from '../../middleware/validate.js';
import { ok } from '../../utils/respond.js';
import { updateSettingsBody, type UpdateSettingsBody } from './settings.schema.js';
import * as settingsService from './settings.service.js';

const getSettings: RequestHandler = async (_req, res) => {
  ok(res, await settingsService.getSettings());
};

const updateSettings: RequestHandler = async (req, res) => {
  ok(res, await settingsService.updateSettings(req.body as UpdateSettingsBody));
};

export const settingsRouter = Router();

// roles: read admin+staff, write admin (spec §4)
settingsRouter.use(requireAuth);

settingsRouter
  .route('/')
  .get(requireRole('admin', 'staff'), getSettings)
  .patch(requireRole('admin'), validate({ body: updateSettingsBody }), updateSettings)
  .all(methodNotAllowed);
