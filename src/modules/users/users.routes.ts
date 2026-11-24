import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './users.controller.js';
import { listUsersQuery, updateUserBody, userIdParams } from './users.schema.js';

export const usersRouter = Router();

// roles: admin (docs/endpoints.json)
usersRouter.use(requireAuth, requireRole('admin'));

usersRouter.get('/', validate({ query: listUsersQuery }), controller.listUsers);
usersRouter.get('/:id', validate({ params: userIdParams }), controller.getUser);
usersRouter.patch('/:id', validate({ params: userIdParams, body: updateUserBody }), controller.updateUser);
