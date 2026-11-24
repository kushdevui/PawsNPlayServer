import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { methodNotAllowed } from '../../middleware/methodNotAllowed.js';
import { validate } from '../../middleware/validate.js';
import * as controller from './users.controller.js';
import { listUsersQuery, updateUserBody, userIdParams } from './users.schema.js';

export const usersRouter = Router();

// roles: admin (spec §4)
usersRouter.use(requireAuth, requireRole('admin'));

usersRouter.route('/').get(validate({ query: listUsersQuery }), controller.listUsers).all(methodNotAllowed);
usersRouter
  .route('/:id')
  .get(validate({ params: userIdParams }), controller.getUser)
  .patch(validate({ params: userIdParams, body: updateUserBody }), controller.updateUser)
  .all(methodNotAllowed);
