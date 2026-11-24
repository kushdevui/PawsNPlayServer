import type { RequestHandler } from 'express';
import { parsePagination } from '../../utils/pagination.js';
import { list, ok } from '../../utils/respond.js';
import type { ListUsersQuery, UpdateUserBody } from './users.schema.js';
import * as usersService from './users.service.js';

export const listUsers: RequestHandler = async (req, res) => {
  const query = req.query as ListUsersQuery;
  const pagination = parsePagination(query);
  const { items, total } = await usersService.listUsers(query, pagination);
  list(res, items, { total, page: pagination.page, limit: pagination.limit });
};

export const getUser: RequestHandler<{ id: string }> = async (req, res) => {
  ok(res, await usersService.getUser(req.params.id));
};

export const updateUser: RequestHandler<{ id: string }> = async (req, res) => {
  ok(res, await usersService.updateUser(req.params.id, req.body as UpdateUserBody));
};
