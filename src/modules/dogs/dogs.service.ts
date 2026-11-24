import type { FilterQuery } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { now } from '../../utils/clock.js';
import { isObjectId } from '../../utils/objectId.js';
import type { Pagination } from '../../utils/pagination.js';
import { escapeRegex } from '../../utils/regex.js';
import { BookingModel, OPEN_STATUSES } from '../bookings/bookings.model.js';
import { DogModel, type DogDoc, type DogDocumentDoc } from './dogs.model.js';
import type { CreateDogBody, ListDogsQuery, UpdateDogBody } from './dogs.schema.js';
import { serializeDog, type PublicDog } from './dogs.serializer.js';

type DocumentInput = NonNullable<UpdateDogBody['documents']>[number];

/** Keeps the app's document id when it sent one (spec §6.2 allows either), defaults uploadedAt to now. */
const toStoredDocuments = (docs: DocumentInput[]): Array<Partial<DogDocumentDoc>> =>
  docs.map(({ id, uploadedAt, ...doc }) => ({ ...(id ? { _id: id } : {}), ...doc, uploadedAt: uploadedAt ?? now() }));

/** GET /dogs: status (default active | archived | all), search on name/breed/owner, sorted by name. */
export async function listDogs(
  { status, search }: ListDogsQuery,
  { skip, limit }: Pagination,
): Promise<{ items: PublicDog[]; total: number }> {
  const filter: FilterQuery<DogDoc> = status === 'all' ? {} : { status };
  if (search) {
    const pattern = new RegExp(escapeRegex(search), 'i');
    filter.$or = [{ name: pattern }, { breed: pattern }, { ownerName: pattern }, { ownerPhone: pattern }];
  }
  const [items, total] = await Promise.all([
    DogModel.find(filter)
      .collation({ locale: 'en', strength: 2 })
      .sort({ name: 1, _id: 1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    DogModel.countDocuments(filter),
  ]);
  return { items: items.map((d) => serializeDog(d as DogDoc)), total };
}

async function findDog(id: string) {
  const dog = isObjectId(id) ? await DogModel.findById(id) : null;
  if (!dog) throw AppError.notFound('Dog');
  return dog;
}

export async function getDog(id: string): Promise<PublicDog> {
  return serializeDog(await findDog(id));
}

export async function createDog({ documents, ...input }: CreateDogBody): Promise<PublicDog> {
  const dog = await DogModel.create({ ...input, documents: toStoredDocuments(documents) });
  return serializeDog(dog);
}

/** PATCH /dogs/:id: partial update; `documents` replaces the whole list; archiving needs no open stays. */
export async function updateDog(id: string, { documents, ...changes }: UpdateDogBody): Promise<PublicDog> {
  const dog = await findDog(id);
  if (changes.status === 'archived' && dog.status !== 'archived') {
    const open = await BookingModel.exists({ dogId: dog._id, status: { $in: OPEN_STATUSES } });
    if (open) {
      throw AppError.rule(
        'HAS_OPEN_BOOKINGS',
        `${dog.name} has upcoming or active bookings. Cancel or finish them first.`,
      );
    }
  }
  const update: Record<string, unknown> = Object.fromEntries(
    Object.entries(changes).filter(([, value]) => value !== undefined),
  );
  if (documents !== undefined) update.documents = toStoredDocuments(documents);
  if (Object.keys(update).length === 0) return serializeDog(dog);

  dog.set(update);
  await dog.save();
  return serializeDog(dog);
}
