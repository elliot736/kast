import { z } from 'zod';

export const createMonitorSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  description: z.string().optional(),
  schedule: z.string().optional(),
  intervalSeconds: z.number().int().positive().optional(),
  graceSeconds: z.number().int().positive().default(300),
  maxRuntimeSeconds: z.number().int().positive().optional(),
  tags: z.array(z.string()).default([]),
  teamId: z.string().uuid().optional(),
  logRetentionDays: z.number().int().positive().optional(),
});

export const updateMonitorSchema = createMonitorSchema.partial();

export type CreateMonitorDto = z.infer<typeof createMonitorSchema>;
export type UpdateMonitorDto = z.infer<typeof updateMonitorSchema>;
