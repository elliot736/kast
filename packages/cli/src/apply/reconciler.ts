import { request } from '../client';
import type { KastConfig, JobDef, MonitorDef } from './schema';

export type ActionType = 'create' | 'update' | 'unchanged';
export type ResourceType = 'team' | 'monitor' | 'job' | 'workflow' | 'alert';

export interface PlanAction {
  action: ActionType;
  resourceType: ResourceType;
  slug: string;       // display identifier
  payload?: unknown;  // body to send to API
  remoteId?: string;  // existing UUID for updates
  parentId?: string;  // e.g. monitorId for alerts, jobId for workflows
  changes?: string[]; // human-readable list of changed fields
}

export interface ReconcilePlan {
  actions: PlanAction[];
}

interface RemoteResource {
  id: string;
  slug: string;
  [key: string]: unknown;
}

// Fetch all remote state in parallel
async function fetchRemoteState() {
  const [teams, monitors, jobs] = await Promise.all([
    request('/api/v1/teams').catch(() => []) as Promise<RemoteResource[]>,
    request('/api/v1/monitors').catch(() => []) as Promise<RemoteResource[]>,
    request('/api/v1/jobs').catch(() => []) as Promise<RemoteResource[]>,
  ]);

  const teamMap = new Map(teams.map((t) => [t.slug, t]));
  const monitorMap = new Map(monitors.map((m) => [m.slug, m]));
  const jobMap = new Map(jobs.map((j) => [j.slug, j]));

  // Fetch workflows for existing jobs
  const workflowMap = new Map<string, unknown>();
  await Promise.all(
    jobs.map(async (j) => {
      try {
        const wf = await request(`/api/v1/jobs/${j.id}/workflow`);
        if (wf) workflowMap.set(j.slug, wf);
      } catch {
        // No workflow for this job
      }
    }),
  );

  // Fetch all alert configs, then group by monitorId -> slug
  const alertMap = new Map<string, RemoteResource[]>();
  try {
    const allAlerts = await request('/api/v1/alert-configs') as RemoteResource[];
    for (const alert of allAlerts) {
      const monitor = monitors.find((m) => m.id === alert.monitorId);
      if (monitor) {
        const existing = alertMap.get(monitor.slug) ?? [];
        existing.push(alert);
        alertMap.set(monitor.slug, existing);
      }
    }
  } catch {
    // No alerts
  }

  return { teamMap, monitorMap, jobMap, workflowMap, alertMap };
}

function resolveTeamId(
  teamSlug: string | undefined,
  teamMap: Map<string, RemoteResource>,
  createdTeams: Map<string, string>,
): string | undefined {
  if (!teamSlug) return undefined;
  if (createdTeams.has(teamSlug)) return createdTeams.get(teamSlug);
  const remote = teamMap.get(teamSlug);
  if (remote) return remote.id;
  return undefined; // will be resolved after creation
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == b;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEqual(v, b[i]));
  }
  if (typeof a === 'object' && typeof b === 'object') {
    const aObj = a as Record<string, unknown>;
    const bObj = b as Record<string, unknown>;
    const keys = new Set([...Object.keys(aObj), ...Object.keys(bObj)]);
    return [...keys].every((k) => deepEqual(aObj[k], bObj[k]));
  }
  return false;
}

function diffFields(local: Record<string, unknown>, remote: Record<string, unknown>, keys: string[]): string[] {
  const changes: string[] = [];
  for (const key of keys) {
    if (local[key] !== undefined && !deepEqual(local[key], remote[key])) {
      changes.push(key);
    }
  }
  return changes;
}

export async function reconcile(config: KastConfig): Promise<ReconcilePlan> {
  const remote = await fetchRemoteState();
  const actions: PlanAction[] = [];
  const createdTeams = new Map<string, string>();
  const createdMonitors = new Map<string, string>();
  const createdJobs = new Map<string, string>();

  // --- Phase 1: Teams ---
  for (const [slug, team] of Object.entries(config.teams)) {
    const existing = remote.teamMap.get(slug);
    if (existing) {
      actions.push({ action: 'unchanged', resourceType: 'team', slug, remoteId: existing.id });
    } else {
      actions.push({
        action: 'create',
        resourceType: 'team',
        slug,
        payload: { name: team.name, slug },
      });
    }
  }

  // --- Phase 2: Monitors ---
  for (const [slug, monitor] of Object.entries(config.monitors)) {
    const existing = remote.monitorMap.get(slug);
    const teamId = resolveTeamId(monitor.team, remote.teamMap, createdTeams);

    const payload: Record<string, unknown> = {
      name: monitor.name,
      slug,
      ...(monitor.description && { description: monitor.description }),
      ...(monitor.schedule && { schedule: monitor.schedule }),
      ...(monitor.intervalSeconds && { intervalSeconds: monitor.intervalSeconds }),
      graceSeconds: monitor.graceSeconds,
      ...(monitor.maxRuntimeSeconds && { maxRuntimeSeconds: monitor.maxRuntimeSeconds }),
      tags: monitor.tags,
      ...(teamId && { teamId }),
      ...(monitor.logRetentionDays && { logRetentionDays: monitor.logRetentionDays }),
    };

    if (existing) {
      const changes = diffFields(payload, existing, Object.keys(payload));
      if (changes.length > 0) {
        actions.push({ action: 'update', resourceType: 'monitor', slug, remoteId: existing.id, payload, changes });
      } else {
        actions.push({ action: 'unchanged', resourceType: 'monitor', slug, remoteId: existing.id });
      }
    } else {
      actions.push({ action: 'create', resourceType: 'monitor', slug, payload });
    }
  }

  // --- Phase 3: Jobs ---
  for (const [slug, job] of Object.entries(config.jobs)) {
    const existing = remote.jobMap.get(slug);
    const teamId = resolveTeamId(job.team, remote.teamMap, createdTeams);

    // Resolve monitor slug -> UUID
    let monitorId: string | undefined;
    if (job.monitor) {
      const remoteMonitor = remote.monitorMap.get(job.monitor);
      if (remoteMonitor) monitorId = remoteMonitor.id;
      // If it's being created in this apply, it will be resolved in executor
    }

    const payload: Record<string, unknown> = {
      name: job.name,
      slug,
      ...(job.description && { description: job.description }),
      schedule: job.schedule,
      timezone: job.timezone,
      url: job.url,
      method: job.method,
      headers: job.headers,
      ...(job.body && { body: job.body }),
      timeoutSeconds: job.timeoutSeconds,
      tags: job.tags,
      ...(teamId && { teamId }),
      ...(monitorId && { monitorId }),
      maxRetries: job.retry.maxRetries,
      retryDelaySeconds: job.retry.delaySeconds,
      retryBackoffMultiplier: job.retry.backoffMultiplier,
      retryMaxDelaySeconds: job.retry.maxDelaySeconds,
      concurrencyLimit: job.concurrency.limit,
      concurrencyPolicy: job.concurrency.policy,
      successStatusCodes: job.successStatusCodes,
    };

    if (existing) {
      const changes = diffFields(payload, existing, Object.keys(payload));
      if (changes.length > 0) {
        actions.push({ action: 'update', resourceType: 'job', slug, remoteId: existing.id, payload, changes });
      } else {
        actions.push({ action: 'unchanged', resourceType: 'job', slug, remoteId: existing.id });
      }
    } else {
      actions.push({ action: 'create', resourceType: 'job', slug, payload });
    }
  }

  // --- Phase 4: Workflows ---
  for (const [slug, job] of Object.entries(config.jobs)) {
    if (!job.workflow) continue;

    const existingJob = remote.jobMap.get(slug);
    const jobId = existingJob?.id;

    // Transform run_job nodes: targetJob slug -> targetJobId UUID
    const nodes = job.workflow.nodes.map((node) => {
      if (node.type === 'run_job') {
        const cfg = node.config as { targetJob: string; mode: string; input?: Record<string, unknown> };
        const targetJob = remote.jobMap.get(cfg.targetJob);
        return {
          ...node,
          name: node.name ?? node.id,
          config: {
            targetJobId: targetJob?.id ?? `__slug:${cfg.targetJob}__`,
            mode: cfg.mode,
            ...(cfg.input && { input: cfg.input }),
          },
        };
      }
      return { ...node, name: node.name ?? node.id };
    });

    // Auto-generate edge IDs if not present
    const edges = job.workflow.edges.map((edge, i) => ({
      id: `e-${edge.source}-${edge.sourceHandle ?? 'default'}-${edge.target}`,
      ...edge,
    }));

    const payload = { steps: { nodes, edges } };

    // Compare with remote workflow
    const remoteWorkflow = remote.workflowMap.get(slug) as { steps?: unknown } | undefined;
    const remoteSteps = remoteWorkflow?.steps;
    if (remoteSteps && deepEqual(remoteSteps, payload.steps)) {
      actions.push({ action: 'unchanged', resourceType: 'workflow', slug, parentId: jobId });
    } else {
      actions.push({
        action: remoteWorkflow ? 'update' : 'create',
        resourceType: 'workflow',
        slug,
        payload,
        parentId: jobId,
        changes: ['workflow'],
      });
    }
  }

  // --- Phase 5: Alerts ---
  for (const [monitorSlug, monitor] of Object.entries(config.monitors)) {
    if (!monitor.alerts || monitor.alerts.length === 0) continue;

    const existingMonitor = remote.monitorMap.get(monitorSlug);
    const monitorId = existingMonitor?.id;
    const remoteAlerts = remote.alertMap.get(monitorSlug) ?? [];

    for (const alert of monitor.alerts) {
      const displaySlug = `${monitorSlug}/${alert.channel}/${alert.destination.slice(0, 20)}`;

      // Match by (channel, destination) composite key
      const existing = remoteAlerts.find(
        (ra) => ra.channel === alert.channel && ra.destination === alert.destination,
      );

      const payload: Record<string, unknown> = {
        ...(monitorId && { monitorId }),
        channel: alert.channel,
        destination: alert.destination,
        config: alert.config,
        cooldownMinutes: alert.cooldownMinutes,
        thresholdFailures: alert.thresholdFailures,
        isEnabled: alert.isEnabled,
      };

      if (existing) {
        const changes = diffFields(payload, existing, ['config', 'cooldownMinutes', 'thresholdFailures', 'isEnabled']);
        if (changes.length > 0) {
          actions.push({ action: 'update', resourceType: 'alert', slug: displaySlug, remoteId: existing.id, payload, parentId: monitorId, changes });
        } else {
          actions.push({ action: 'unchanged', resourceType: 'alert', slug: displaySlug, remoteId: existing.id, parentId: monitorId });
        }
      } else {
        actions.push({ action: 'create', resourceType: 'alert', slug: displaySlug, payload, parentId: monitorId });
      }
    }
  }

  return { actions };
}
