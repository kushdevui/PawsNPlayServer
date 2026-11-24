import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

mongoose.set('strictQuery', true);

export async function connectDB(uri: string = env.MONGODB_URI): Promise<typeof mongoose> {
  const connection = await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  // Log host and db name only - the URI may contain credentials.
  logger.info({ host: mongoose.connection.host, db: mongoose.connection.name }, 'MongoDB connected');
  return connection;
}

export async function disconnectDB(): Promise<void> {
  await mongoose.disconnect();
}

export const isDbConnected = (): boolean => mongoose.connection.readyState === 1; // 1 = connected;

/** Round-trips a ping to MongoDB (health check). Resolves false instead of throwing. */
export async function pingDb(timeoutMs = 2000): Promise<boolean> {
  const db = mongoose.connection.db;
  if (!isDbConnected() || !db) return false;
  const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), timeoutMs).unref());
  const ping = db
    .admin()
    .ping()
    .then(() => true)
    .catch(() => false);
  return Promise.race([ping, timeout]);
}
