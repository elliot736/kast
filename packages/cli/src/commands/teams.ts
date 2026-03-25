import { request } from '../client';
import { table } from '../utils/table';

export async function teamsCommand(subcommand: string, args: string[]) {
  switch (subcommand) {
    case 'list': {
      const teams = await request('/api/v1/teams');
      table(teams, ['name', 'slug', 'id']);
      break;
    }
    case 'create': {
      if (!args[0] || !args[1]) {
        console.error('Usage: kast teams create <name> <slug>');
        process.exit(1);
      }
      const team = await request('/api/v1/teams', {
        method: 'POST',
        body: JSON.stringify({ name: args[0], slug: args[1] }),
      });
      console.log(`Team created: ${team.name} (${team.id})`);
      break;
    }
    default:
      console.error(`Unknown subcommand: kast teams ${subcommand}`);
      process.exit(1);
  }
}
