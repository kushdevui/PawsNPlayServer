import { Schema, model } from 'mongoose';
import { baseSchemaOptions } from '../../db/toJSON.js';
import { newId } from '../../utils/ids.js';

export const SPECIES = ['dog', 'cat'] as const;
export type Species = (typeof SPECIES)[number];

export const PET_GENDERS = ['male', 'female'] as const;
export type PetGender = (typeof PET_GENDERS)[number];

/** Stored shape. Public shape = app `Pet`. */
export interface PetDoc {
  _id: string;
  ownerId: string;
  name: string;
  species: Species;
  breed: string;
  gender: PetGender;
  /** Date only, `YYYY-MM-DD` (kept as a string, exactly like the app), or '' when unknown. */
  dateOfBirth: string;
  weightKg: number;
  vaccinated: boolean;
  notes: string;
  photoUrl: string | null;
  createdAt: Date;
}

const petSchema = new Schema<PetDoc>(
  {
    _id: { type: String, default: () => newId('p') },
    ownerId: { type: String, ref: 'User', required: true, index: true },
    name: { type: String, required: true, trim: true },
    species: { type: String, enum: SPECIES, required: true },
    breed: { type: String, default: '', trim: true },
    gender: { type: String, enum: PET_GENDERS, default: 'male' },
    // '' when unknown (the app mock allows it).
    dateOfBirth: { type: String, default: '', match: /^(\d{4}-\d{2}-\d{2})?$/ },
    weightKg: { type: Number, default: 0, min: 0 },
    vaccinated: { type: Boolean, default: false },
    notes: { type: String, default: '' },
    photoUrl: { type: String, default: null },
    createdAt: { type: Date, default: () => new Date() },
  },
  { ...baseSchemaOptions, collection: 'pets' },
);

petSchema.index({ species: 1 });

export const PetModel = model<PetDoc>('Pet', petSchema);
