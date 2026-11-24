import { API_PREFIX, createApp } from './app.js';
import { env } from './config/env.js';
import { connectDB, disconnectDB } from './db/connect.js';
import { logger } from './utils/logger.js';

async function main(): Promise<void> {
  try {
    await connectDB();
  } catch (err) {
    logger.fatal({ err }, 'Could not connect to MongoDB. Is it running? Check MONGODB_URI in .env.');
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(env.PORT, (error?: Error) => {
    if (error) {
      logger.fatal({ err: error }, `Could not start the server on port ${env.PORT}`);
      process.exit(1);
    }
    logger.info(`PawsNPlay API listening on http://localhost:${env.PORT}${API_PREFIX}`);
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
