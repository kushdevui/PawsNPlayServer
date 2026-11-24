import bcrypt from 'bcrypt';
import type { HydratedDocument } from 'mongoose';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/AppError.js';
import { isObjectId } from '../../utils/objectId.js';
import { UserModel, type UserDoc } from '../users/users.model.js';
import { serializeUser, type PublicUser } from '../users/users.serializer.js';
import type { LoginBody, RegisterBody, UpdateMeBody } from './auth.schema.js';
import { newTokenId, RefreshTokenModel } from './refreshToken.model.js';
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from './tokens.js';

// Compared against when the email is unknown, so both cases take about the same time.
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', env.BCRYPT_COST);

type UserDocument = HydratedDocument<UserDoc>;

/** App `AuthResponse`. */
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: PublicUser;
}

const invalidCredentials = () => new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.');
const invalidToken = () => new AppError(401, 'INVALID_TOKEN', 'Session expired.');
const isDuplicateKeyError = (err: unknown) =>
  typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 11000;

export const hashPassword = (password: string) => bcrypt.hash(password, env.BCRYPT_COST);

async function issueTokens(user: UserDocument, userAgent?: string): Promise<AuthResult> {
  const jti = newTokenId();
  const userId = user._id.toHexString();
  const refresh = signRefreshToken(userId, user.tokenVersion, jti.toHexString());
  await RefreshTokenModel.create({
    _id: jti,
    userId: user._id,
    tokenHash: hashToken(refresh.token),
    expiresAt: refresh.expiresAt,
    userAgent: userAgent?.slice(0, 300) ?? null,
  });
  return {
    accessToken: signAccessToken(userId, user.role, user.tokenVersion),
    refreshToken: refresh.token,
    user: serializeUser(user),
  };
}

export async function login({ email, password }: LoginBody, userAgent?: string): Promise<AuthResult> {
  const user = email ? await UserModel.findOne({ email }) : null;
  const passwordOk = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk) throw invalidCredentials();
  if (user.status !== 'active') {
    throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account is inactive. Contact support.');
  }
  return issueTokens(user, userAgent);
}

/** Always creates role `user`, status `active`. */
export async function register(input: RegisterBody, userAgent?: string): Promise<AuthResult> {
  const emailTaken = () => new AppError(422, 'EMAIL_TAKEN', 'This email is already registered.');
  if (await UserModel.exists({ email: input.email })) throw emailTaken();

  const passwordHash = await hashPassword(input.password);
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
  return issueTokens(user, userAgent);
}

/** No rotation (the app ignores extra fields; spec §7.2 makes rotation optional): new access token only. */
export async function refresh(refreshToken: string): Promise<{ accessToken: string }> {
  const claims = refreshToken ? verifyRefreshToken(refreshToken) : null;
  if (!claims || !isObjectId(claims.jti) || !isObjectId(claims.userId)) throw invalidToken();

  const stored = await RefreshTokenModel.findOne({
    _id: claims.jti,
    userId: claims.userId,
    tokenHash: hashToken(refreshToken),
  }).lean();
  if (!stored || stored.expiresAt.getTime() <= Date.now()) throw invalidToken(); // revoked or expired

  const user = await UserModel.findById(claims.userId, { role: 1, status: 1, tokenVersion: 1 }).lean();
  if (!user || user.status !== 'active' || user.tokenVersion !== claims.tokenVersion) throw invalidToken();

  return { accessToken: signAccessToken(claims.userId, user.role, user.tokenVersion) };
}

/**
 * With a refresh token: revoke that session only. Without (the app sends no body): log out everywhere -
 * delete all refresh tokens and bump tokenVersion so outstanding access tokens stop working too.
 */
export async function logout(userId: string, refreshToken?: string): Promise<{ success: true }> {
  if (refreshToken) {
    await RefreshTokenModel.deleteOne({ userId, tokenHash: hashToken(refreshToken) });
  } else {
    await revokeAllSessions(userId);
  }
  return { success: true };
}

/** Ends every session of a user (logout-all, deactivation): bump tokenVersion + delete refresh tokens. */
export async function revokeAllSessions(userId: string): Promise<void> {
  await UserModel.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } });
  await RefreshTokenModel.deleteMany({ userId });
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await UserModel.findById(userId);
  if (!user) throw AppError.unauthorized();
  return serializeUser(user);
}

/** Only name, phone and avatarUrl can change (the schema strips everything else). */
export async function updateMe(userId: string, changes: UpdateMeBody): Promise<PublicUser> {
  const update: Partial<Pick<UpdateMeBody, 'name' | 'phone' | 'avatarUrl'>> = {};
  if (changes.name !== undefined) update.name = changes.name;
  if (changes.phone !== undefined) update.phone = changes.phone;
  if (changes.avatarUrl !== undefined) update.avatarUrl = changes.avatarUrl;

  const user =
    Object.keys(update).length === 0
      ? await UserModel.findById(userId)
      : await UserModel.findByIdAndUpdate(userId, { $set: update }, { new: true, runValidators: true });
  if (!user) throw AppError.unauthorized();
  return serializeUser(user);
}
