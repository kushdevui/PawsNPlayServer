import type { RequestHandler } from 'express';
import { authUser } from '../../middleware/auth.js';
import { parsePagination } from '../../utils/pagination.js';
import { created, list, ok } from '../../utils/respond.js';
import type { CreatePetBody, ListPetsQuery, UpdatePetBody } from './pets.schema.js';
import * as petsService from './pets.service.js';

type IdParams = { id: string };

export const listPets: RequestHandler = async (req, res) => {
  const query = req.query as ListPetsQuery;
  const pagination = parsePagination(query);
  const { items, total } = await petsService.listPets(authUser(req), query, pagination);
  list(res, items, { total, page: pagination.page, limit: pagination.limit });
};

export const getPet: RequestHandler<IdParams> = async (req, res) => {
  ok(res, await petsService.getPet(authUser(req), req.params.id));
};

export const createPet: RequestHandler = async (req, res) => {
  created(res, await petsService.createPet(authUser(req), req.body as CreatePetBody));
};

export const updatePet: RequestHandler<IdParams> = async (req, res) => {
  ok(res, await petsService.updatePet(authUser(req), req.params.id, req.body as UpdatePetBody));
};

export const deletePet: RequestHandler<IdParams> = async (req, res) => {
  ok(res, await petsService.deletePet(authUser(req), req.params.id));
};
