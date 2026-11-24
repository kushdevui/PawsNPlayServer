import { Router } from 'express';
import { requireAuth } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../utils/schemas.js';
import * as controller from './notifications.controller.js';
import { listNotificationsQuery } from './notifications.schema.js';

export const notificationsRouter = Router();

// roles: any logged-in user; only their own notifications (notifications.service.ts).
notificationsRouter.use(requireAuth);

notificationsRouter.get('/', validate({ query: listNotificationsQuery }), controller.listNotifications);
notificationsRouter.patch('/:id/read', validate({ params: idParams }), controller.markRead);
