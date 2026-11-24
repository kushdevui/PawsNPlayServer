import type { RequestHandler } from 'express';
import { authUser } from '../../middleware/auth.js';
import { parsePagination } from '../../utils/pagination.js';
import { list, ok } from '../../utils/respond.js';
import type { ListNotificationsQuery } from './notifications.schema.js';
import * as notificationsService from './notifications.service.js';

export const listNotifications: RequestHandler = async (req, res) => {
  const query = req.query as ListNotificationsQuery;
  const pagination = parsePagination(query);
  const { items, total } = await notificationsService.listNotifications(authUser(req), query, pagination);
  list(res, items, { total, page: pagination.page, limit: pagination.limit });
};

export const markRead: RequestHandler<{ id: string }> = async (req, res) => {
  ok(res, await notificationsService.markRead(authUser(req), req.params.id));
};
