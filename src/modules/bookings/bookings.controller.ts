import type { RequestHandler } from 'express';
import { authUser } from '../../middleware/auth.js';
import { parsePagination } from '../../utils/pagination.js';
import { created, list, ok } from '../../utils/respond.js';
import type {
  AssignStaffBody,
  CreateBookingBody,
  ListBookingsQuery,
  UpdateStatusBody,
} from './bookings.schema.js';
import * as bookingsService from './bookings.service.js';

type IdParams = { id: string };

export const listBookings: RequestHandler = async (req, res) => {
  const query = req.query as ListBookingsQuery;
  const pagination = parsePagination(query);
  const { items, total } = await bookingsService.listBookings(authUser(req), query, pagination);
  list(res, items, { total, page: pagination.page, limit: pagination.limit });
};

export const getBooking: RequestHandler<IdParams> = async (req, res) => {
  ok(res, await bookingsService.getBooking(authUser(req), req.params.id));
};

export const createBooking: RequestHandler = async (req, res) => {
  created(res, await bookingsService.createBooking(authUser(req), req.body as CreateBookingBody));
};

export const updateStatus: RequestHandler<IdParams> = async (req, res) => {
  const { status } = req.body as UpdateStatusBody;
  ok(res, await bookingsService.updateStatus(authUser(req), req.params.id, status));
};

export const assignStaff: RequestHandler<IdParams> = async (req, res) => {
  ok(res, await bookingsService.assignStaff(req.params.id, (req.body as AssignStaffBody).staffId));
};
