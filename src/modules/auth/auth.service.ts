import bcrypt from 'bcrypt';
import type { HydratedDocument } from 'mongoose';
import { AppError } from '../../utils/AppError.js';
import { UserModel, type UserDoc } from '../users/users.model.js';
import type { LoginBody, RegisterBody, UpdateMeBody } from './auth.schema.js';
import { RefreshTokenModel } from './refreshToken.model.js';
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from './tokens.js';

const BCRYPT_COST = 10;
// Compared against when the email is unknown, so both cases take about the same time.
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', BCRYPT_COST);

type UserDocument = HydratedDocument<UserDoc>;

/** Same shape as the app's AuthResponse; `user` is serialised by the model's toJSON. */
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: UserDocument;
}

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
const invalidToken = () => new AppError(401, 'INVALID_TOKEN', 'Session expired.');
const isDuplicateKeyError = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;

async function issueTokens(user: UserDocument): Promise<AuthResult> {
  const refresh = signRefreshToken(user._id);
  await RefreshTokenModel.create({
    _id: refresh.jti,
    userId: user._id,
    tokenHash: hashToken(refresh.token),
    expiresAt: refresh.expiresAt,
  });
  return { accessToken: signAccessToken(user._id, user.role), refreshToken: refresh.token, user };
}

export async function login({ email, password }: LoginBody): Promise<AuthResult> {
  const user = email ? await UserModel.findOne({ email }) : null;
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk) throw invalidCredentials();
  if (user.status !== 'active') {
    throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account is inactive. Contact support.');
  }
  return issueTokens(user);
}

/** Always creates role `user`, status `active`. */
export async function register(input: RegisterBody): Promise<AuthResult> {
  const emailTaken = () => new AppError(422, 'EMAIL_TAKEN', 'This email is already registered.');
  if (await UserModel.exists({ email: input.email })) throw emailTaken();

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  let user: UserDocument;
  try {
    user = await UserModel.create({
      name: input.name,
      email: input.email,
      phone: input.phone,
      passwordHash,
      role: 'user',
      status: 'active',
    });
  } catch (err) {
    if (isDuplicateKeyError(err)) throw emailTaken(); // two sign-ups racing for one email
    throw err;
  }
  return issueTokens(user);
}

/** No rotation (per contract): returns a new access token only. */
export async function refresh(refreshToken: string): Promise<{ accessToken: string }> {
  const claims = refreshToken ? verifyRefreshToken(refreshToken) : null;
  if (!claims) throw invalidToken();

  const stored = await RefreshTokenModel.findOne({
    _id: claims.jti,
    userId: claims.userId,
    tokenHash: hashToken(refreshToken),
  }).lean();
  if (!stored) throw invalidToken(); // revoked by logout or deactivation

  const user = await UserModel.findById(claims.userId, { role: 1, status: 1 }).lean();
  if (!user || user.status !== 'active') throw invalidToken();

  return { accessToken: signAccessToken(user._id, user.role) };
}

/** Revokes the given refresh token of this user, or all of the user's tokens when none is given. */
export async function logout(userId: string, refreshToken?: string): Promise<{ success: true }> {
  if (refreshToken) {
    await RefreshTokenModel.deleteOne({ userId, tokenHash: hashToken(refreshToken) });
  } else {
    await RefreshTokenModel.deleteMany({ userId });
  }
  return { success: true };
}

/** Ends every session of a user (used when an admin deactivates them). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await RefreshTokenModel.deleteMany({ userId });
}

export async function getMe(userId: string): Promise<UserDocument> {
  const user = await UserModel.findById(userId);
  if (!user) throw AppError.unauthorized();
  return user;
}

/** Only name, phone and avatarUrl can change (the schema strips everything else). */
export async function updateMe(userId: string, changes: UpdateMeBody): Promise<UserDocument> {
  const update: Partial<Pick<UpdateMeBody, 'name' | 'phone' | 'avatarUrl'>> = {};
  if (changes.name !== undefined) update.name = changes.name;
  if (changes.phone !== undefined) update.phone = changes.phone;
  if (changes.avatarUrl !== undefined) update.avatarUrl = changes.avatarUrl;

  const user =
    Object.keys(update).length === 0
      ? await UserModel.findById(userId)
      : await UserModel.findByIdAndUpdate(userId, { $set: update }, { new: true, runValidators: true });
  if (!user) throw AppError.unauthorized();
  return user;
}
