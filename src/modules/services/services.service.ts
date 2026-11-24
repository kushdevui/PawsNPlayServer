import type { FilterQuery, HydratedDocument } from 'mongoose';
import type { AuthUser } from '../../middleware/auth.js';
import { AppError } from '../../utils/AppError.js';
import type { Pagination } from '../../utils/pagination.js';
import { ServiceModel, type ServiceDoc } from './services.model.js';
import type { CreateServiceBody, ListServicesQuery, UpdateServiceBody } from './services.schema.js';

type ServiceDocument = HydratedDocument<ServiceDoc>;

/** Non-admins only ever see active services. */
const visibleTo = (caller: AuthUser): FilterQuery<ServiceDoc> => (caller.role === 'admin' ? {} : { active: true });

export async function listServices(
  caller: AuthUser,
  { category }: ListServicesQuery,
  { skip, limit }: Pagination,
): Promise<{ items: ServiceDocument[]; total: number }> {
  const filter: FilterQuery<ServiceDoc> = { ...visibleTo(caller), ...(category ? { category } : {}) };
  // Services have no createdAt in the contract; sort by id (seed order s_001, s_002, ...).
  const [items, total] = await Promise.all([
    ServiceModel.find(filter).sort({ _id: 1 }).skip(skip).limit(limit),
    ServiceModel.countDocuments(filter),
  ]);
  return { items, total };
}

/** An inactive service is "not found" for non-admins. */
export async function getService(caller: AuthUser, id: string): Promise<ServiceDocument> {
  const service = await ServiceModel.findOne({ _id: id, ...visibleTo(caller) });
  if (!service) throw AppError.notFound('Service');
  return service;
}

export async function createService(input: CreateServiceBody): Promise<ServiceDocument> {
  return ServiceModel.create(input);
}

export async function updateService(id: string, changes: UpdateServiceBody): Promise<ServiceDocument> {
  const update = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
  const service =
    Object.keys(update).length === 0
      ? await ServiceModel.findById(id)
      : await ServiceModel.findByIdAndUpdate(id, { $set: update }, { new: true, runValidators: true });
  if (!service) throw AppError.notFound('Service');
  return service;
}
