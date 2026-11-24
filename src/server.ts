import { networkInterfaces } from 'node:os';
import { API_PREFIX, createApp } from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './db/connect.js';
import { logger } from './utils/logger.js';

/** IPv4 addresses of this machine on the local network (e.g. 192.168.1.104). */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((net) => net && net.family === 'IPv4' && !net.internal)
    .map((net) => net!.address);
}

async function main(): Promise<void> {
  try {
    await connectDB();
  } catch (err) {
    logger.fatal({ err }, 'Could not connect to MongoDB. Is it running? Check MONGODB_URI in .env.');
    process.exit(1);
  }

  if (env.NODE_ENV === 'production' && env.UPLOAD_PROVIDER === 'local') {
    logger.warn('UPLOAD_PROVIDER=local in production: uploaded files are stored on this machine only.');
  }

  const app = createApp();
  const server = app.listen(env.PORT, env.HOST, (error?: Error) => {
    if (error) {
      logger.fatal({ err: error }, `Could not start the server on ${env.HOST}:${env.PORT}`);
      process.exit(1);
    }
    logger.info(`PawsNPlay API listening on http://localhost:${env.PORT}${API_PREFIX}`);
    if (env.HOST === '0.0.0.0') {
      for (const ip of lanAddresses()) {
        logger.info(`On your network (phone/app): http://${ip}:${env.PORT}${API_PREFIX}`);
      }
    }
  });

  const shutdown = (signal: string) => {
    logger.info(`${signal} received, shutting down`);
    server.close(() => {
      disconnectDB()
        .catch((err: unknown) => logger.error({ err }, 'Error while disconnecting MongoDB'))
        .finally(() => process.exit(0));
    });
  };
  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err: unknown) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});
