import { readFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { kastConfigSchema, type KastConfig } from './schema';

export async function parseYamlFile(filePath: string): Promise<KastConfig> {
  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch {
    throw new Error(`Cannot read file: ${filePath}`);
  }

  let doc: unknown;
  try {
    doc = parseYaml(raw);
  } catch (err) {
    throw new Error(`YAML parse error: ${(err as Error).message}`);
  }

  // Validate schema
  const result = kastConfigSchema.safeParse(doc);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Validation errors:\n${issues}`);
  }

  const config = result.data;

  // Validate cross-references within the file
  validateCrossRefs(config);

  return config;
}

function validateCrossRefs(config: KastConfig) {
  const teamSlugs = new Set(Object.keys(config.teams));
  const monitorSlugs = new Set(Object.keys(config.monitors));
  const jobSlugs = new Set(Object.keys(config.jobs));
  const errors: string[] = [];

  // Validate slug format (lowercase alphanumeric + hyphens)
  const slugPattern = /^[a-z0-9-]+$/;
  for (const slug of [...teamSlugs, ...monitorSlugs, ...jobSlugs]) {
    if (!slugPattern.test(slug)) {
      errors.push(`Invalid slug "${slug}": must be lowercase alphanumeric with hyphens`);
    }
  }

  // Monitor team refs
  for (const [slug, monitor] of Object.entries(config.monitors)) {
    if (monitor.team && !teamSlugs.has(monitor.team)) {
      errors.push(`monitors.${slug}.team: team "${monitor.team}" not defined in this file (will check remote)`);
    }
  }

  // Job team + monitor refs
  for (const [slug, job] of Object.entries(config.jobs)) {
    if (job.team && !teamSlugs.has(job.team)) {
      errors.push(`jobs.${slug}.team: team "${job.team}" not defined in this file (will check remote)`);
    }
    if (job.monitor && !monitorSlugs.has(job.monitor)) {
      errors.push(`jobs.${slug}.monitor: monitor "${job.monitor}" not defined in this file (will check remote)`);
    }

    // Workflow spawn step refs
    if (job.workflow) {
      for (const step of job.workflow.steps) {
        if (step.type === 'spawn') {
          const targetJob = (step.config as { targetJob?: string }).targetJob;
          if (targetJob && !jobSlugs.has(targetJob)) {
            errors.push(`jobs.${slug}.workflow.steps.${step.id}: targetJob "${targetJob}" not defined in this file (will check remote)`);
          }
        }
        // signal_child must reference a spawn step id within the same workflow
        if (step.type === 'signal_child') {
          const spawnStepId = (step.config as { spawnStepId?: string }).spawnStepId;
          const stepIds = job.workflow.steps.map((s) => s.id);
          if (spawnStepId && !stepIds.includes(spawnStepId)) {
            errors.push(`jobs.${slug}.workflow.steps.${step.id}: spawnStepId "${spawnStepId}" not found in workflow steps`);
          }
        }
        // onFailureGoto must reference a step id within the same workflow
        if (step.onFailure === 'goto' && step.onFailureGoto) {
          const stepIds = job.workflow.steps.map((s) => s.id);
          if (!stepIds.includes(step.onFailureGoto)) {
            errors.push(`jobs.${slug}.workflow.steps.${step.id}: onFailureGoto "${step.onFailureGoto}" not found in workflow steps`);
          }
        }
      }
    }
  }

  // Cross-ref warnings are not fatal — they may exist on the remote
  // Only fatal errors are slug format and within-workflow refs
  const fatal = errors.filter(
    (e) => !e.includes('(will check remote)') && !e.includes('not defined in this file'),
  );

  if (fatal.length > 0) {
    throw new Error(`Cross-reference errors:\n${fatal.map((e) => `  ${e}`).join('\n')}`);
  }
}
