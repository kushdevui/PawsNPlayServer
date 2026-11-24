import { Router, type RequestHandler } from 'express';
import { authUser, requireAuth, requireRole } from '../../middleware/auth.js';
import { methodNotAllowed } from '../../middleware/methodNotAllowed.js';
import { validate } from '../../middleware/validate.js';
import { parsePagination } from '../../utils/pagination.js';
import { created, list, ok } from '../../utils/respond.js';
import { idParams } from '../../utils/schemas.js';
import {
  createBookingBody,
  createPaymentBody,
  listBookingsQuery,
  paymentParams,
  updateBookingBody,
  updateStatusBody,
  type CreateBookingBody,
  type CreatePaymentBody,
  type ListBookingsQuery,
  type UpdateBookingBody,
  type UpdateStatusBody,
} from './bookings.schema.js';
import * as bookingsService from './bookings.service.js';
import * as paymentsService from './payments.service.js';

type IdParams = { id: string };

const listBookings: RequestHandler = async (req, res) => {
  const query = req.query as ListBookingsQuery;
  const pagination = parsePagination(query);
  const { items, total } = await bookingsService.listBookings(query, pagination);
  list(res, items, { total, page: pagination.page, limit: pagination.limit });
};
const getBooking: RequestHandler<IdParams> = async (req, res) =>
  ok(res, await bookingsService.getBooking(req.params.id));
const createBooking: RequestHandler = async (req, res) =>
  created(res, await bookingsService.createBooking(authUser(req), req.body as CreateBookingBody));
const updateBooking: RequestHandler<IdParams> = async (req, res) =>
  ok(res, await bookingsService.updateBooking(req.params.id, req.body as UpdateBookingBody));
const updateStatus: RequestHandler<IdParams> = async (req, res) =>
  ok(res, await bookingsService.updateStatus(authUser(req), req.params.id, (req.body as UpdateStatusBody).status));
const addPayment: RequestHandler<IdParams> = async (req, res) =>
  created(res, await paymentsService.addPayment(authUser(req), req.params.id, req.body as CreatePaymentBody));
const removePayment: RequestHandler<IdParams & { paymentId: string }> = async (req, res) =>
  ok(res, await paymentsService.removePayment(req.params.id, req.params.paymentId));

export const bookingsRouter = Router();

// Roles per spec §4: read + status = admin, staff; create/edit/payments = admin. No DELETE (cancel instead).
bookingsRouter.use(requireAuth);
const staffOrAdmin = requireRole('admin', 'staff');
const adminOnly = requireRole('admin');

bookingsRouter
  .route('/')
  .get(staffOrAdmin, validate({ query: listBookingsQuery }), listBookings)
  .post(adminOnly, validate({ body: createBookingBody }), createBooking)
  .all(methodNotAllowed);
bookingsRouter
  .route('/:id')
  .get(staffOrAdmin, validate({ params: idParams }), getBooking)
  .patch(adminOnly, validate({ params: idParams, body: updateBookingBody }), updateBooking)
  .all(methodNotAllowed);
bookingsRouter
  .route('/:id/status')
  .patch(staffOrAdmin, validate({ params: idParams, body: updateStatusBody }), updateStatus)
  .all(methodNotAllowed);
bookingsRouter
  .route('/:id/payments')
  .post(adminOnly, validate({ params: idParams, body: createPaymentBody }), addPayment)
  .all(methodNotAllowed);
bookingsRouter
  .route('/:id/payments/:paymentId')
  .delete(adminOnly, validate({ params: paymentParams }), removePayment)
  .all(methodNotAllowed);
