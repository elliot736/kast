import type { ReconcilePlan, ResourceType } from './reconciler';
import type { ExecutionResult } from './executor';

const SYMBOLS = {
  create: '+',
  update: '~',
  unchanged: '=',
} as const;

const LABELS = {
  create: 'CREATE',
  update: 'UPDATE',
  unchanged: 'UNCHANGED',
} as const;

export function printPlan(plan: ReconcilePlan) {
  const groups: Record<string, typeof plan.actions> = {};
  const order: ResourceType[] = ['team', 'monitor', 'job', 'workflow', 'alert'];

  for (const type of order) {
    const actions = plan.actions.filter((a) => a.resourceType === type);
    if (actions.length > 0) {
      groups[type] = actions;
    }
  }

  const sectionNames: Record<string, string> = {
    team: 'Teams',
    monitor: 'Monitors',
    job: 'Jobs',
    workflow: 'Workflows',
    alert: 'Alerts',
  };

  for (const [type, actions] of Object.entries(groups)) {
    console.log(`\n  ${sectionNames[type]}:`);
    for (const action of actions) {
      const sym = SYMBOLS[action.action];
      const label = LABELS[action.action];
      const changeDetail = action.changes?.length
        ? ` (${action.changes.join(', ')})`
        : '';
      console.log(`    ${sym} ${action.slug.padEnd(35)} ${label}${changeDetail}`);
    }
  }
}

export function printSummary(results: ExecutionResult[]) {
  const succeeded = results.filter((r) => r.success);
  const failed = results.filter((r) => !r.success);

  console.log('\n' + '─'.repeat(60));

  if (succeeded.length > 0) {
    const creates = succeeded.filter((r) => r.action.action === 'create').length;
    const updates = succeeded.filter((r) => r.action.action === 'update').length;
    const parts: string[] = [];
    if (creates > 0) parts.push(`${creates} created`);
    if (updates > 0) parts.push(`${updates} updated`);
    console.log(`Done: ${parts.join(', ')}`);
  }

  if (failed.length > 0) {
    console.log(`\nFailed (${failed.length}):`);
    for (const f of failed) {
      console.log(`  ${f.action.resourceType} "${f.action.slug}": ${f.error}`);
    }
    process.exit(1);
  }
}
