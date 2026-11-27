/**
 * Runs before every test file. Env values are set before src/config/env.ts is imported
 * (dotenv never overrides values that already exist), then an in-memory MongoDB is started.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';
import { setNow } from '../src/utils/clock.js';

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.MONGODB_URI = 'mongodb://127.0.0.1:27017/pawsnplay-test-placeholder';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-0123456789';
process.env.CORS_ORIGINS = 'http://localhost:8081';
process.env.BCRYPT_COST = '4'; // spec uses 12; 4 keeps the suite fast
process.env.UPLOAD_PROVIDER = 'local';
process.env.UPLOAD_DIR = mkdtempSync(path.join(tmpdir(), 'pawsnplay-uploads-'));
delete process.env.PUBLIC_BASE_URL;
// High by default; tests/questionnaires-ratelimit.test.ts lowers them with vi.hoisted().
process.env.QUESTIONNAIRE_RATE_PER_HOUR = '1000';
process.env.QUESTIONNAIRE_RATE_PER_DAY = '1000';
process.env.WAIVER_RATE_PER_HOUR = '1000';
process.env.WAIVER_RATE_PER_DAY = '1000';

let mongo: MongoMemoryServer | undefined;

beforeAll(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri(), { dbName: 'pawsnplay-test' });
});

afterEach(() => {
  setNow(null);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});
