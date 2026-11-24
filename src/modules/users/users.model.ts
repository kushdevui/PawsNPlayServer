import { Schema, model } from 'mongoose';
import { baseSchemaOptions } from '../../db/toJSON.js';
import { newId } from '../../utils/ids.js';
import { ROLES, USER_STATUSES, type Role, type UserStatus } from '../auth/roles.js';

/** Stored shape. Public shape = app `User` (passwordHash is stripped by toJSON). */
export interface UserDoc {
  _id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: Role;
  phone: string | null;
  avatarUrl: string | null;
  status: UserStatus;
  createdAt: Date;
}

const userSchema = new Schema<UserDoc>(
  {
    _id: { type: String, default: () => newId('u') },
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true, unique: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, required: true, default: 'user' },
    phone: { type: String, default: null },
    avatarUrl: { type: String, default: null },
    status: { type: String, enum: USER_STATUSES, required: true, default: 'active' },
    createdAt: { type: Date, default: () => new Date() },
  },
  { ...baseSchemaOptions, collection: 'users' },
);

userSchema.index({ role: 1, status: 1 });

export const UserModel = model<UserDoc>('User', userSchema);
