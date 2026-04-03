import { z } from 'zod';

export const createJobSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().optional(),
  schedule: z.string().min(1),
  timezone: z.string().max(100).default('UTC'),
  // Retry policy
  maxRetries: z.number().int().min(0).max(10).default(0),
  retryDelaySeconds: z.number().int().positive().default(60),
  retryBackoffMultiplier: z.number().int().positive().default(2),
  retryMaxDelaySeconds: z.number().int().positive().default(3600),
  // Concurrency control
  concurrencyLimit: z.number().int().positive().default(1),
  concurrencyPolicy: z.enum(['queue', 'skip', 'cancel']).default('queue'),
  monitorId: z.string().uuid().optional(),
  teamId: z.string().uuid().optional(),
  tags: z.array(z.string()).default([]),
});

export const updateJobSchema = createJobSchema.partial();

export type CreateJobDto = z.infer<typeof createJobSchema>;
export type UpdateJobDto = z.infer<typeof updateJobSchema>;
