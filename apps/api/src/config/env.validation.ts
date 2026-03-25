import { z } from 'zod';

const DEV_AUTH_SECRET = 'kast-dev-secret-change-in-production-32chars';

export const envSchema = z
  .object({
    DATABASE_URL: z.string().min(1),
    KAFKA_BROKERS: z.string().default('localhost:29092'),
    KAFKA_CLIENT_ID: z.string().default('kast-api'),
    API_PORT: z.coerce.number().default(3001),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    CORS_ORIGIN: z.string().default('http://localhost:3002'),
    PING_RETENTION_DAYS: z.coerce.number().default(30),
    BETTER_AUTH_SECRET: z.string().default(DEV_AUTH_SECRET),
    BETTER_AUTH_URL: z.string().default('http://localhost:3001'),
  })
  .refine(
    (env) => env.NODE_ENV !== 'production' || env.BETTER_AUTH_SECRET !== DEV_AUTH_SECRET,
    { message: 'BETTER_AUTH_SECRET must be set in production', path: ['BETTER_AUTH_SECRET'] },
  );

export type EnvConfig = z.infer<typeof envSchema>;
