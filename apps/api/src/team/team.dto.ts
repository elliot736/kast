import { z } from 'zod';

export const createTeamSchema = z.object({
  name: z.string().min(1).max(255),
  slug: z
    .string()
    .min(1)
    .max(255)
    .regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
});

export const updateTeamSchema = createTeamSchema.partial();

export type CreateTeamDto = z.infer<typeof createTeamSchema>;
export type UpdateTeamDto = z.infer<typeof updateTeamSchema>;
