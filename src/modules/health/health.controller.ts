import type { RequestHandler } from 'express';
import { isDbConnected } from '../../db/connect.js';
import { ok } from '../../utils/respond.js';

/** GET /health -> { data: { status: 'ok', db: 'connected' | 'disconnected' } } */
export const getHealth: RequestHandler = (_req, res) => {
  ok(res, { status: 'ok', db: isDbConnected() ? 'connected' : 'disconnected' });
};
