import { z } from 'zod';

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  KAFKA_BROKERS: z.string().default('localhost:29092'),
  KAFKA_CLIENT_ID: z.string().default('kast-api'),
  API_PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CORS_ORIGIN: z.string().default('*'),
  PING_RETENTION_DAYS: z.coerce.number().default(30),
  BETTER_AUTH_SECRET: z.string().default('kast-dev-secret-change-in-production-32chars'),
  BETTER_AUTH_URL: z.string().default('http://localhost:3001'),
});

export type EnvConfig = z.infer<typeof envSchema>;
