import { createHash } from 'node:crypto';
import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { env } from '../../config/env.js';
import { newId } from '../../utils/ids.js';
import { isRole, type Role } from './roles.js';

const ALGORITHM = 'HS256' as const;

type ExpiresIn = NonNullable<SignOptions['expiresIn']>;

export interface AccessClaims {
  userId: string;
  role: Role;
}

export interface RefreshClaims {
  userId: string;
  jti: string;
  expiresAt: Date;
}

/** SHA-256 is enough here: tokens are long random-signed strings, not user passwords. */
export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export function signAccessToken(userId: string, role: Role): string {
  return jwt.sign({ role }, env.JWT_ACCESS_SECRET, {
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
    return { userId: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

export function signRefreshToken(userId: string): { token: string; jti: string; expiresAt: Date } {
  const jti = newId('rt');
  const token = jwt.sign({}, env.JWT_REFRESH_SECRET, {
    algorithm: ALGORITHM,
    subject: userId,
    jwtid: jti,
    expiresIn: env.JWT_REFRESH_TTL as ExpiresIn,
  });
  const { exp } = jwt.decode(token) as JwtPayload;
  return { token, jti, expiresAt: new Date((exp ?? 0) * 1000) };
}

/** Returns null for any invalid, expired or malformed token. */
export function verifyRefreshToken(token: string): RefreshClaims | null {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: [ALGORITHM] });
    if (typeof payload === 'string' || !payload.sub || !payload.jti || !payload.exp) return null;
    return { userId: payload.sub, jti: payload.jti, expiresAt: new Date(payload.exp * 1000) };
  } catch {
    return null;
  }
}
