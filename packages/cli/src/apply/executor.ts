import { request } from '../client';
import type { ReconcilePlan, PlanAction, ActionType } from './reconciler';

export interface ExecutionResult {
  action: PlanAction;
  success: boolean;
  error?: string;
}

export async function execute(plan: ReconcilePlan): Promise<ExecutionResult[]> {
  const results: ExecutionResult[] = [];

  // Track created resource IDs for cross-reference resolution
  const createdIds = new Map<string, string>(); // "type:slug" -> id

  // Execute in dependency order: teams -> monitors -> jobs -> workflows -> alerts
  const order: Array<PlanAction['resourceType']> = ['team', 'monitor', 'job', 'workflow', 'alert'];

  for (const resourceType of order) {
    const actions = plan.actions.filter(
      (a) => a.resourceType === resourceType && a.action !== 'unchanged',
    );

    for (const action of actions) {
      try {
        const result = await executeAction(action, createdIds);
        results.push({ action, success: true });

        // Track created IDs
        if (action.action === 'create' && result?.id) {
          createdIds.set(`${resourceType}:${action.slug}`, result.id);
        }
      } catch (err) {
        results.push({
          action,
          success: false,
          error: (err as Error).message,
        });
        // Fail fast: stop on first error
        console.error(`\nFailed to ${action.action} ${action.resourceType} "${action.slug}": ${(err as Error).message}`);
        return results;
      }
    }
  }

  return results;
}

async function executeAction(
  action: PlanAction,
  createdIds: Map<string, string>,
): Promise<{ id?: string }> {
  const payload = action.payload as Record<string, unknown> | undefined;

  switch (action.resourceType) {
    case 'team': {
      if (action.action === 'create') {
        return requestWithResult('/api/v1/teams', 'POST', payload);
      }
      return {};
    }

    case 'monitor': {
      // Resolve team ref if it was created in this run
      if (payload?.teamId === undefined && payload) {
        resolveTeamRef(payload, createdIds);
      }

      if (action.action === 'create') {
        return requestWithResult('/api/v1/monitors', 'POST', payload);
      }
      return requestWithResult(`/api/v1/monitors/${action.remoteId}`, 'PATCH', payload);
    }

    case 'job': {
      // Resolve team + monitor refs
      if (payload) {
        resolveTeamRef(payload, createdIds);
        resolveMonitorRef(payload, createdIds);
      }

      if (action.action === 'create') {
        return requestWithResult('/api/v1/jobs', 'POST', payload);
      }
      return requestWithResult(`/api/v1/jobs/${action.remoteId}`, 'PATCH', payload);
    }

    case 'workflow': {
      // Resolve the job ID — either from remote or just-created
      let jobId = action.parentId;
      if (!jobId) {
        jobId = createdIds.get(`job:${action.slug}`);
      }
      if (!jobId) {
        throw new Error(`Cannot resolve job ID for workflow "${action.slug}"`);
      }

      // Resolve any __slug:xxx__ placeholders in spawn step targetJobId
      if (payload) {
        resolveSpawnTargets(payload, createdIds);
      }

      // Workflow uses PUT (upsert)
      return requestWithResult(`/api/v1/jobs/${jobId}/workflow`, 'PUT', payload);
    }

    case 'alert': {
      // Resolve monitor ID
      let monitorId = action.parentId;
      if (!monitorId && payload) {
        // Find from created monitors
        for (const [key, id] of createdIds) {
          if (key.startsWith('monitor:') && payload.monitorId === undefined) {
            // Match by slug from the display slug "monitorSlug/channel/dest"
            const monitorSlug = action.slug.split('/')[0];
            if (key === `monitor:${monitorSlug}`) {
              monitorId = id;
              break;
            }
          }
        }
      }

      if (monitorId && payload) {
        payload.monitorId = monitorId;
      }

      if (action.action === 'create') {
        return requestWithResult('/api/v1/alert-configs', 'POST', payload);
      }
      return requestWithResult(`/api/v1/alert-configs/${action.remoteId}`, 'PATCH', payload);
    }
  }

  return {};
}

function resolveTeamRef(payload: Record<string, unknown>, createdIds: Map<string, string>) {
  // If teamId is not set, check if the team was created in this run
  // The reconciler would have set teamId if the team already existed remotely
  // This handles the case where both team and resource are new
  if (!payload.teamId) {
    for (const [key, id] of createdIds) {
      if (key.startsWith('team:')) {
        // Can't auto-resolve without knowing which team slug was referenced
        // The payload should already have teamId set by the reconciler
        break;
      }
    }
  }
}

function resolveMonitorRef(payload: Record<string, unknown>, createdIds: Map<string, string>) {
  if (!payload.monitorId) {
    // Check if we know the monitor slug from the payload
    // The reconciler didn't set it because the monitor didn't exist yet
    for (const [key, id] of createdIds) {
      if (key.startsWith('monitor:')) {
        // Same limitation — need the slug to match
        break;
      }
    }
  }
}

function resolveSpawnTargets(payload: Record<string, unknown>, createdIds: Map<string, string>) {
  const steps = (payload as { steps?: Array<{ type: string; config: Record<string, unknown> }> }).steps;
  if (!steps) return;

  for (const step of steps) {
    if (step.type === 'spawn' && typeof step.config.targetJobId === 'string') {
      const match = step.config.targetJobId.match(/^__slug:(.+)__$/);
      if (match) {
        const slug = match[1];
        const jobId = createdIds.get(`job:${slug}`);
        if (jobId) {
          step.config.targetJobId = jobId;
        } else {
          throw new Error(`Cannot resolve targetJob slug "${slug}" — job was not created`);
        }
      }
    }
  }
}

async function requestWithResult(path: string, method: string, payload?: unknown): Promise<{ id?: string }> {
  const result = await request(path, {
    method,
    body: payload ? JSON.stringify(payload) : undefined,
  });
  return result ?? {};
}
