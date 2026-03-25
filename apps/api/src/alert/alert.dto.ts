import { z } from 'zod';

export const createAlertConfigSchema = z.object({
  monitorId: z.string().uuid(),
  channel: z.enum(['slack', 'discord', 'email', 'webhook', 'pagerduty', 'telegram']),
  destination: z.string().min(1),
  config: z.record(z.unknown()).default({}),
  cooldownMinutes: z.number().int().positive().default(30),
  thresholdFailures: z.number().int().positive().default(1),
  isEnabled: z.boolean().default(true),
});

export const updateAlertConfigSchema = createAlertConfigSchema.partial().omit({
  monitorId: true,
});

export type CreateAlertConfigDto = z.infer<typeof createAlertConfigSchema>;
export type UpdateAlertConfigDto = z.infer<typeof updateAlertConfigSchema>;
