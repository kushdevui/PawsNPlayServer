import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import { notFound } from './middleware/notFound.js';
import { apiRouter } from './routes.js';
import { logger } from './utils/logger.js';

export const API_PREFIX = '/api/v1';

/** Builds the Express app without listening, so tests can use it with Supertest. */
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      // Native apps send no Origin header; browsers (Expo web) must be in CORS_ORIGINS.
      // TODO(contract): confirm with app - whether LAN origins (e.g. http://192.168.x.x:8081) need a pattern.
      origin: (origin, callback) => callback(null, !origin || env.CORS_ORIGINS.includes(origin)),
    }),
  );
  app.use(pinoHttp({ logger }));
  app.use(express.json({ limit: '1mb' }));

  app.use(API_PREFIX, apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
