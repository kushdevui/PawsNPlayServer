import type { RequestHandler } from 'express';
import { authUser } from '../../middleware/auth.js';
import { parsePagination } from '../../utils/pagination.js';
import { created, list, ok } from '../../utils/respond.js';
import type { CreateServiceBody, ListServicesQuery, UpdateServiceBody } from './services.schema.js';
import * as servicesService from './services.service.js';

type IdParams = { id: string };

export const listServices: RequestHandler = async (req, res) => {
  const query = req.query as ListServicesQuery;
  const pagination = parsePagination(query);
  const { items, total } = await servicesService.listServices(authUser(req), query, pagination);
  list(res, items, { total, page: pagination.page, limit: pagination.limit });
};

export const getService: RequestHandler<IdParams> = async (req, res) => {
  ok(res, await servicesService.getService(authUser(req), req.params.id));
};

export const createService: RequestHandler = async (req, res) => {
  created(res, await servicesService.createService(req.body as CreateServiceBody));
};

export const updateService: RequestHandler<IdParams> = async (req, res) => {
  ok(res, await servicesService.updateService(req.params.id, req.body as UpdateServiceBody));
};
