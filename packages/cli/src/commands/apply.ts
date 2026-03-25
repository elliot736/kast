import { parseYamlFile } from '../apply/parser';
import { reconcile } from '../apply/reconciler';
import { execute } from '../apply/executor';
import { printPlan, printSummary } from '../apply/printer';

export async function applyCommand(args: string[]) {
  const filePath = extractFilePath(args);
  const dryRun = args.includes('--dry-run');

  const config = await parseYamlFile(filePath);
  const plan = await reconcile(config);

  printPlan(plan);

  if (dryRun) {
    const total = plan.actions.length;
    const creates = plan.actions.filter((a) => a.action === 'create').length;
    const updates = plan.actions.filter((a) => a.action === 'update').length;
    const unchanged = plan.actions.filter((a) => a.action === 'unchanged').length;
    console.log(`\nSummary: ${creates} to create, ${updates} to update, ${unchanged} unchanged`);
    console.log('Run without --dry-run to apply changes.');
    return;
  }

  const results = await execute(plan);
  printSummary(results);
}

function extractFilePath(args: string[]): string {
  const fIndex = args.indexOf('-f');
  if (fIndex === -1 || !args[fIndex + 1]) {
    console.error('Usage: kast apply -f <file> [--dry-run]');
    process.exit(1);
  }
  return args[fIndex + 1];
}
