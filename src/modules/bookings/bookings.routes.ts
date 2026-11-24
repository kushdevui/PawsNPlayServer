import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../utils/schemas.js';
import * as controller from './bookings.controller.js';
import { assignStaffBody, createBookingBody, listBookingsQuery, updateStatusBody } from './bookings.schema.js';

export const bookingsRouter = Router();

// Roles per docs/endpoints.json. Visibility (staff: assigned, user: own) is enforced in bookings.service.ts.
const anyRole = requireRole('user', 'staff', 'admin');

bookingsRouter.use(requireAuth);

bookingsRouter.get('/', anyRole, validate({ query: listBookingsQuery }), controller.listBookings);
bookingsRouter.get('/:id', anyRole, validate({ params: idParams }), controller.getBooking);
bookingsRouter.post('/', requireRole('user'), validate({ body: createBookingBody }), controller.createBooking);
bookingsRouter.patch(
  '/:id/status',
  anyRole,
  validate({ params: idParams, body: updateStatusBody }),
  controller.updateStatus,
);
bookingsRouter.patch(
  '/:id/assign',
  requireRole('admin'),
  validate({ params: idParams, body: assignStaffBody }),
  controller.assignStaff,
);
