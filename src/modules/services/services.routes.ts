import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../utils/schemas.js';
import * as controller from './services.controller.js';
import { createServiceBody, listServicesQuery, updateServiceBody } from './services.schema.js';

export const servicesRouter = Router();

// Roles per docs/endpoints.json: reads = any logged-in role (non-admins see active only), writes = admin.
servicesRouter.use(requireAuth);

servicesRouter.get('/', validate({ query: listServicesQuery }), controller.listServices);
servicesRouter.get('/:id', validate({ params: idParams }), controller.getService);
servicesRouter.post('/', requireRole('admin'), validate({ body: createServiceBody }), controller.createService);
servicesRouter.patch(
  '/:id',
  requireRole('admin'),
  validate({ params: idParams, body: updateServiceBody }),
  controller.updateService,
);
