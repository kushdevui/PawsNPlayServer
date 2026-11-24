import { Router, type RequestHandler } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { methodNotAllowed } from '../../middleware/methodNotAllowed.js';
import { validate } from '../../middleware/validate.js';
import { parsePagination } from '../../utils/pagination.js';
import { created, list, ok } from '../../utils/respond.js';
import { idParams } from '../../utils/schemas.js';
import {
  createDogBody,
  listDogsQuery,
  updateDogBody,
  type CreateDogBody,
  type ListDogsQuery,
  type UpdateDogBody,
} from './dogs.schema.js';
import * as dogsService from './dogs.service.js';

type IdParams = { id: string };

const listDogs: RequestHandler = async (req, res) => {
  const query = req.query as ListDogsQuery;
  const pagination = parsePagination(query);
  const { items, total } = await dogsService.listDogs(query, pagination);
  list(res, items, { total, page: pagination.page, limit: pagination.limit });
};
const getDog: RequestHandler<IdParams> = async (req, res) => ok(res, await dogsService.getDog(req.params.id));
const createDog: RequestHandler = async (req, res) =>
  created(res, await dogsService.createDog(req.body as CreateDogBody));
const updateDog: RequestHandler<IdParams> = async (req, res) =>
  ok(res, await dogsService.updateDog(req.params.id, req.body as UpdateDogBody));

export const dogsRouter = Router();

// roles: read admin+staff, write admin (spec §4). No DELETE - archive instead (405).
dogsRouter.use(requireAuth);
const read = requireRole('admin', 'staff');
const write = requireRole('admin');

dogsRouter
  .route('/')
  .get(read, validate({ query: listDogsQuery }), listDogs)
  .post(write, validate({ body: createDogBody }), createDog)
  .all(methodNotAllowed);
dogsRouter
  .route('/:id')
  .get(read, validate({ params: idParams }), getDog)
  .patch(write, validate({ params: idParams, body: updateDogBody }), updateDog)
  .all(methodNotAllowed);
