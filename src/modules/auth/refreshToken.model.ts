import { Schema, model } from 'mongoose';

/**
 * One document per issued refresh token (one per login/register, i.e. per device session).
 * `_id` is the JWT `jti`; only a SHA-256 hash of the token is stored. Logout deletes documents;
 * MongoDB removes expired ones automatically (TTL index on expiresAt). Internal, never returned.
 */
export interface RefreshTokenDoc {
  _id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenDoc>(
  {
    _id: { type: String, required: true },
    userId: { type: String, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false, collection: 'refreshtokens' },
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshTokenModel = model<RefreshTokenDoc>('RefreshToken', refreshTokenSchema);
