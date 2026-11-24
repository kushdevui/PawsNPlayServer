import { Schema, model } from 'mongoose';
import { baseSchemaOptions } from '../../db/toJSON.js';
import { newId } from '../../utils/ids.js';
import { SPECIES, type Species } from '../pets/pets.model.js';

export const SERVICE_CATEGORIES = ['daycare', 'grooming', 'play', 'walking', 'training'] as const;
export type ServiceCategory = (typeof SERVICE_CATEGORIES)[number];

/** Stored shape. Public shape = app `Service` (no createdAt in the contract). */
export interface ServiceDoc {
  _id: string;
  name: string;
  category: ServiceCategory;
  description: string;
  durationMinutes: number;
  price: number;
  currency: string;
  speciesAllowed: Species[];
  active: boolean;
}

const serviceSchema = new Schema<ServiceDoc>(
  {
    _id: { type: String, default: () => newId('s') },
    name: { type: String, required: true, trim: true },
    category: { type: String, enum: SERVICE_CATEGORIES, required: true },
    description: { type: String, default: '' },
    durationMinutes: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'INR' },
    speciesAllowed: { type: [{ type: String, enum: SPECIES }], default: [] },
    active: { type: Boolean, default: true },
  },
  { ...baseSchemaOptions, collection: 'services' },
);

serviceSchema.index({ active: 1, category: 1 });

export const ServiceModel = model<ServiceDoc>('Service', serviceSchema);
