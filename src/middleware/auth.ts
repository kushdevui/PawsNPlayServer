import type { Request, RequestHandler } from 'express';
import type { Role } from '../modules/auth/roles.js';
import { verifyAccessToken } from '../modules/auth/tokens.js';
import { UserModel } from '../modules/users/users.model.js';
import { AppError } from '../utils/AppError.js';
import { isObjectId } from '../utils/objectId.js';

/** The authenticated caller. `role` comes from the database, so role changes apply immediately. */
export interface AuthUser {
  id: string;
  role: Role;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace -- Express request augmentation
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

function bearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : null;
}

/**
 * 401 UNAUTHORIZED unless the request has a valid access token for a user who still exists and is
 * active (a user deactivated or deleted after login is rejected on the next request).
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = bearerToken(req);
  const claims = token ? verifyAccessToken(token) : null;
  if (!claims || !isObjectId(claims.userId)) throw AppError.unauthorized();

  // Spec §9: load the user on every request; inactive, deleted or revoked (tokenVersion bumped) -> 401.
  const user = await UserModel.findById(claims.userId, { role: 1, status: 1, tokenVersion: 1 }).lean();
  if (!user || user.status !== 'active' || user.tokenVersion !== claims.tokenVersion) {
    throw AppError.unauthorized();
  }

  req.user = { id: user._id.toHexString(), role: user.role };
  next();
};

/** 403 FORBIDDEN unless the caller has one of the roles. Use after requireAuth. */
export const requireRole =
  (...roles: Role[]): RequestHandler =>
  (req, _res, next) => {
    if (!req.user) throw AppError.unauthorized();
    if (!roles.includes(req.user.role)) throw AppError.forbidden();
    next();
  };

/** The caller set by requireAuth (throws 401 if a route forgot requireAuth). */
export function authUser(req: Request): AuthUser {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}
