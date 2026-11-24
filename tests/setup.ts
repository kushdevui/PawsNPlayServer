/**
 * Runs before every test file. Env values are set before src/config/env.ts is imported
 * (dotenv never overrides values that already exist), then an in-memory MongoDB is started.
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, beforeAll } from 'vitest';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/pawsnplay-test-placeholder';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789';
process.env.CORS_ORIGINS = 'http://localhost:8081';

let mongo: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'pawsnplay-test' });
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
