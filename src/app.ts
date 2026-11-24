import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { randomUUID } from 'node:crypto';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import { notFound } from './middleware/notFound.js';
import { localUploadRoot } from './modules/uploads/storage.js';
import { apiRouter } from './routes.js';
import { logger } from './utils/logger.js';

export const API_PREFIX = '/api/v1';

const allowAnyOrigin = env.CORS_ORIGINS.includes('*');

/** Builds the Express app without listening, so tests can use it with Supertest. */
export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(
    cors({
      // Native apps send no Origin header; browsers (Expo web) must match CORS_ORIGINS ("*" = any, dev only).
      origin: (origin, callback) => callback(null, allowAnyOrigin || !origin || env.CORS_ORIGINS.includes(origin)),
    }),
  );
  // Request id on every log line (spec §9); echoed back as X-Request-Id.
  app.use(
    pinoHttp({
      logger,
      genReqId: (req, res) => {
        const incoming = req.headers['x-request-id'];
        const id = typeof incoming === 'string' && /^[\w-]{1,64}$/.test(incoming) ? incoming : randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
    }),
  );
  app.use(express.json({ limit: '1mb' }));

  if (env.UPLOAD_PROVIDER === 'local') {
    // Dev storage for POST /uploads. Names are random UUIDs; files are public to whoever has the URL.
    app.use(
      '/uploads',
      express.static(localUploadRoot(), {
        index: false,
        dotfiles: 'deny',
        fallthrough: true,
        setHeaders: (res) => {
          res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
          res.setHeader('Cache-Control', 'private, max-age=86400');
        },
      }),
    );
  }

  app.use(API_PREFIX, apiRouter);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
