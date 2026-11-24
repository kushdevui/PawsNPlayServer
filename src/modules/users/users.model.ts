import { Schema, model, type Types } from 'mongoose';
import { baseSchemaOptions } from '../../db/toJSON.js';
import { ROLES, USER_STATUSES, type Role, type UserStatus } from '../auth/roles.js';

/** Stored shape (spec §6.1). Public shape = app `User` (see users.serializer.ts). */
export interface UserDoc {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  phone: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  /** Bumped to revoke every token of the user (logout-all, deactivation). */
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 100 },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true, default: 'user' },
    phone: { type: String, default: null },
    avatarUrl: { type: String, default: null },
    status: { type: String, enum: USER_STATUSES, required: true, default: 'active' },
    tokenVersion: { type: Number, default: 0 },
  },
  { ...baseSchemaOptions, collection: 'users' },
);

userSchema.index({ role: 1, status: 1 });

export const UserModel = model<UserDoc>('User', userSchema);
