import { parseYamlFile } from '../apply/parser';

export async function validateCommand(args: string[]) {
  const fIndex = args.indexOf('-f');
  if (fIndex === -1 || !args[fIndex + 1]) {
    console.error('Usage: kast validate -f <file>');
    process.exit(1);
  }
  const filePath = args[fIndex + 1];

  try {
    const config = await parseYamlFile(filePath);

    const monitorCount = Object.keys(config.monitors ?? {}).length;
    const jobCount = Object.keys(config.jobs ?? {}).length;
    const teamCount = Object.keys(config.teams ?? {}).length;
    const workflowCount = Object.values(config.jobs ?? {}).filter((j) => j.workflow).length;
    const alertCount = Object.values(config.monitors ?? {}).reduce(
      (sum, m) => sum + (m.alerts?.length ?? 0),
      0,
    );

    console.log(`Valid! ${filePath}`);
    console.log(`  ${teamCount} team(s), ${monitorCount} monitor(s), ${jobCount} job(s), ${workflowCount} workflow(s), ${alertCount} alert(s)`);
  } catch (err) {
    console.error(`Invalid: ${(err as Error).message}`);
    process.exit(1);
  }
}
