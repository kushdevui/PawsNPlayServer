import { Router } from 'express';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../utils/schemas.js';
import * as controller from './pets.controller.js';
import { createPetBody, listPetsQuery, updatePetBody } from './pets.schema.js';

export const petsRouter = Router();

// Roles per docs/endpoints.json. Ownership (user: own pets only) is enforced in pets.service.ts.
const read = requireRole('user', 'staff', 'admin');
const write = requireRole('user', 'admin');

petsRouter.use(requireAuth);

petsRouter.get('/', read, validate({ query: listPetsQuery }), controller.listPets);
petsRouter.get('/:id', read, validate({ params: idParams }), controller.getPet);
petsRouter.post('/', write, validate({ body: createPetBody }), controller.createPet);
petsRouter.patch('/:id', write, validate({ params: idParams, body: updatePetBody }), controller.updatePet);
petsRouter.delete('/:id', write, validate({ params: idParams }), controller.deletePet);
