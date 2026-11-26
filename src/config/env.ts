import 'dotenv/config';
import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

// A duration with a unit, e.g. 900s, 15m, 12h, 7d. Units are required: jsonwebtoken reads "900" as 900 ms.
const TTL_PATTERN = /^\d+(s|m|h|d|w|y)$/;
const TTL_MESSAGE = 'must be a duration with a unit, like 15m, 12h or 7d';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    // 0.0.0.0 = reachable from other devices on the network (phones running the app).
    HOST: z.string().min(1).default('0.0.0.0'),
    MONGODB_URI: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://'),
    JWT_ACCESS_SECRET: z.string().min(16, 'must be at least 16 characters'),
    JWT_REFRESH_SECRET: z.string().min(16, 'must be at least 16 characters'),
    JWT_ACCESS_TTL: z.string().regex(TTL_PATTERN, TTL_MESSAGE).default('15m'),
    JWT_REFRESH_TTL: z.string().regex(TTL_PATTERN, TTL_MESSAGE).default('30d'),
    // bcrypt work factor (spec: 12). Tests lower it to keep the suite fast.
    BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
    // "*" = allow any origin (dev). Otherwise a comma-separated list, e.g. "http://localhost:8081,http://localhost:19006"
    CORS_ORIGINS: z
      .string()
      .default('*')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
    // Number of reverse proxies in front of the API (Nginx on EC2 = 1). 0 = none (local dev).
    // Needed so rate limits and logs see the real client IP instead of the proxy's.
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    // Uploads: local (dev, files in UPLOAD_DIR served at /uploads) | s3 | cloudinary (not implemented yet).
    UPLOAD_PROVIDER: z.enum(['local', 's3', 'cloudinary']).default('local'),
    UPLOAD_DIR: z.string().min(1).default('uploads'),
    // Optional public origin used in upload URLs, e.g. https://api.example.com (default: the request's host).
    PUBLIC_BASE_URL: z
      .string()
      .url('must be a URL like https://api.example.com')
      .transform((value) => value.replace(/\/+$/, ''))
      .optional(),
    S3_BUCKET: z.string().optional(),
    S3_REGION: z.string().optional(),
    S3_ACCESS_KEY_ID: z.string().optional(),
    S3_SECRET_ACCESS_KEY: z.string().optional(),
    CLOUDINARY_URL: z.string().optional(),
    // Public "Know Your Dog" questionnaire: submissions allowed per IP.
    QUESTIONNAIRE_RATE_PER_HOUR: z.coerce.number().int().min(1).default(5),
    QUESTIONNAIRE_RATE_PER_DAY: z.coerce.number().int().min(1).default(20),
    LOG_LEVEL: z.enum(LOG_LEVELS).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.JWT_ACCESS_SECRET === value.JWT_REFRESH_SECRET) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['JWT_REFRESH_SECRET'],
        message: 'must be different from JWT_ACCESS_SECRET',
      });
    }
    if (value.NODE_ENV === 'production') {
      for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET'] as const) {
        if (value[key].startsWith('change-me')) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [key], message: 'replace the placeholder secret' });
        }
      }
    }
  });

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // The logger depends on env, so report with console here. Never print the values themselves.
  console.error('Invalid environment variables:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  throw new Error('Invalid environment variables. Copy .env.example to .env and fill it in.');
}

export const env = {
  ...parsed.data,
  LOG_LEVEL: parsed.data.LOG_LEVEL ?? (parsed.data.NODE_ENV === 'test' ? 'silent' : 'info'),
};

export type Env = typeof env;
