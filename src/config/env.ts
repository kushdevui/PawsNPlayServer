import 'dotenv/config';
import { z } from 'zod';

const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65535).default(4000),
    MONGODB_URI: z
      .string()
      .regex(/^mongodb(\+srv)?:\/\//, 'must start with mongodb:// or mongodb+srv://'),
    JWT_ACCESS_SECRET: z.string().min(16, 'must be at least 16 characters'),
    JWT_REFRESH_SECRET: z.string().min(16, 'must be at least 16 characters'),
    JWT_ACCESS_TTL: z.string().min(1).default('15m'),
    JWT_REFRESH_TTL: z.string().min(1).default('7d'),
    // Comma-separated list, e.g. "http://localhost:8081,http://localhost:19006"
    CORS_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean),
      ),
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
