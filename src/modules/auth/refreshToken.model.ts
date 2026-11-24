import { Schema, model, Types } from 'mongoose';

/**
 * One document per issued refresh token (one per login/register = one device session), spec §6.5.
 * `_id` is the JWT `jti`; only a SHA-256 hash of the token is stored. Logout deletes the document(s);
 * MongoDB removes expired ones automatically (TTL index on expiresAt). Internal, never returned.
 */
export interface RefreshTokenDoc {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
  createdAt: Date;
  updatedAt: Date;
}

const refreshTokenSchema = new Schema<RefreshTokenDoc>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, default: null, maxlength: 300 },
  },
  { versionKey: false, timestamps: true, collection: 'refreshTokens' },
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshTokenModel = model<RefreshTokenDoc>('RefreshToken', refreshTokenSchema);

export const newTokenId = () => new Types.ObjectId();
