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
