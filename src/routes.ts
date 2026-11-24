import { Router } from 'express';
import { adminRouter } from './modules/admin/admin.routes.js';
import { authRouter, meRouter } from './modules/auth/auth.routes.js';
import { bookingsRouter } from './modules/bookings/bookings.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { notificationsRouter } from './modules/notifications/notifications.routes.js';
import { petsRouter } from './modules/pets/pets.routes.js';
import { servicesRouter } from './modules/services/services.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

/** Everything under /api/v1 (docs/endpoints.json). */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/me', meRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/pets', petsRouter);
apiRouter.use('/services', servicesRouter);
apiRouter.use('/bookings', bookingsRouter);
apiRouter.use('/notifications', notificationsRouter);
apiRouter.use('/admin', adminRouter);
