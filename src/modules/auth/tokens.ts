import { createHash } from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { isRole, type Role } from './roles.js';

/**
 * JWTs per spec §9: access `{ sub, role, tv }` (15 min), refresh `{ sub, tv, jti }` (30 days).
 * `tv` = user.tokenVersion; bumping it revokes every token of that user.
 */
const ALGORITHM = 'HS256' as const;

type ExpiresIn = NonNullable<SignOptions['expiresIn']>;

export interface AccessClaims {
  userId: string;
  role: Role;
  tokenVersion: number;
}

export interface RefreshClaims {
  userId: string;
  jti: string;
  tokenVersion: number;
  expiresAt: Date;
}

/** SHA-256 is enough here: tokens are long signed random strings, not user passwords. */
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

const versionOf = (payload: JwtPayload): number | null =>
  typeof payload.tv === 'number' && Number.isInteger(payload.tv) ? payload.tv : null;

export function signAccessToken(userId: string, role: Role, tokenVersion: number): string {
  return jwt.sign({ role, tv: tokenVersion }, env.JWT_ACCESS_SECRET, {
    algorithm: ALGORITHM,
    subject: userId,
    expiresIn: env.JWT_ACCESS_TTL as ExpiresIn,
  });
}

/** Returns null for any invalid, expired or malformed token. */
export function verifyAccessToken(token: string): AccessClaims | null {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: [ALGORITHM] });
    if (typeof payload === 'string' || !payload.sub || !isRole(payload.role)) return null;
    const tokenVersion = versionOf(payload);
    if (tokenVersion === null) return null;
    return { userId: payload.sub, role: payload.role, tokenVersion };
  } catch {
    return null;
  }
}

export function signRefreshToken(
  userId: string,
  tokenVersion: number,
  jti: string,
): { token: string; expiresAt: Date } {
  const token = jwt.sign({ tv: tokenVersion }, env.JWT_REFRESH_SECRET, {
    algorithm: ALGORITHM,
    subject: userId,
    jwtid: jti,
    expiresIn: env.JWT_REFRESH_TTL as ExpiresIn,
  });
  const { exp } = jwt.decode(token) as JwtPayload;
  return { token, expiresAt: new Date((exp ?? 0) * 1000) };
}

/** Returns null for any invalid, expired or malformed token. */
export function verifyRefreshToken(token: string): RefreshClaims | null {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: [ALGORITHM] });
    if (typeof payload === 'string' || !payload.sub || !payload.jti || !payload.exp) return null;
    const tokenVersion = versionOf(payload);
    if (tokenVersion === null) return null;
    return { userId: payload.sub, jti: payload.jti, tokenVersion, expiresAt: new Date(payload.exp * 1000) };
  } catch {
    return null;
  }
}
