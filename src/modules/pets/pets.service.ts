import type { FilterQuery, HydratedDocument } from 'mongoose';
import type { AuthUser } from '../../middleware/auth.js';
import { AppError } from '../../utils/AppError.js';
import type { Pagination } from '../../utils/pagination.js';
import { BookingModel } from '../bookings/bookings.model.js';
import { UserModel } from '../users/users.model.js';
import { PetModel, type PetDoc } from './pets.model.js';
import type { CreatePetBody, ListPetsQuery, UpdatePetBody } from './pets.schema.js';

type PetDocument = HydratedDocument<PetDoc>;

/** user: own pets only; staff and admin: all pets. */
const visibleTo = (caller: AuthUser): FilterQuery<PetDoc> =>
  caller.role === 'user' ? { ownerId: caller.id } : {};

export async function listPets(
  caller: AuthUser,
  { species, ownerId }: ListPetsQuery,
  { skip, limit }: Pagination,
): Promise<{ items: PetDocument[]; total: number }> {
  // Both conditions must hold, so a user filtering by someone else's ownerId gets an empty list.
  const filter: FilterQuery<PetDoc> = {
    $and: [visibleTo(caller), species ? { species } : {}, ownerId ? { ownerId } : {}],
  };
  const [items, total] = await Promise.all([
    PetModel.find(filter).sort({ createdAt: 1, _id: 1 }).skip(skip).limit(limit),
    PetModel.countDocuments(filter),
  ]);
  return { items, total };
}

/** Someone else's pet is reported as not found (never leak existence). */
export async function getPet(caller: AuthUser, id: string): Promise<PetDocument> {
  const pet = await PetModel.findOne({ _id: id, ...visibleTo(caller) });
  if (!pet) throw AppError.notFound('Pet');
  return pet;
}

export async function createPet(caller: AuthUser, { ownerId, ...input }: CreatePetBody): Promise<PetDocument> {
  let owner = caller.id;
  if (caller.role === 'admin' && ownerId) {
    if (!(await UserModel.exists({ _id: ownerId }))) throw AppError.validation('Choose an existing owner.');
    owner = ownerId;
  }
  return PetModel.create({ ...input, ownerId: owner });
}

export async function updatePet(caller: AuthUser, id: string, changes: UpdatePetBody): Promise<PetDocument> {
  const update = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
  const filter = { _id: id, ...visibleTo(caller) };
  const pet =
    Object.keys(update).length === 0
      ? await PetModel.findOne(filter)
      : await PetModel.findOneAndUpdate(filter, { $set: update }, { new: true, runValidators: true });
  if (!pet) throw AppError.notFound('Pet');
  return pet;
}

/**
 * TODO(contract): confirm with app - the mock deletes unconditionally. The server refuses while the pet
 * has pending/confirmed bookings (422 INVALID_STATE); completed/cancelled bookings stay as history.
 */
export async function deletePet(caller: AuthUser, id: string): Promise<{ success: true }> {
  const pet = await getPet(caller, id);
  if (await BookingModel.exists({ petId: pet._id, status: { $in: ['pending', 'confirmed'] } })) {
    throw AppError.invalidState('This pet has upcoming bookings. Cancel them first.');
  }
  await PetModel.deleteOne({ _id: pet._id });
  return { success: true };
}
