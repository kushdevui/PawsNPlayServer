import { Router } from 'express';
import { adminRouter } from './modules/admin/admin.routes.js';
import { authRouter, meRouter } from './modules/auth/auth.routes.js';
import { bookingsRouter } from './modules/bookings/bookings.routes.js';
import { dogsRouter } from './modules/dogs/dogs.routes.js';
import { healthRouter } from './modules/health/health.routes.js';
import { questionnairesRouter } from './modules/questionnaires/questionnaires.routes.js';
import { settingsRouter } from './modules/settings/settings.routes.js';
import { uploadsRouter } from './modules/uploads/uploads.routes.js';
import { usersRouter } from './modules/users/users.routes.js';

/** Everything under /api/v1 - the routes of docs/BACKEND_API_SPEC.md §13 (27 core + questionnaires). */
export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/me', meRouter);
apiRouter.use('/users', usersRouter);
apiRouter.use('/dogs', dogsRouter);
apiRouter.use('/bookings', bookingsRouter);
apiRouter.use('/settings', settingsRouter);
apiRouter.use('/admin', adminRouter);
apiRouter.use('/uploads', uploadsRouter);
apiRouter.use('/questionnaires', questionnairesRouter);
