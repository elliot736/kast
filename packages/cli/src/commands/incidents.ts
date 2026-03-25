import { request } from '../client';
import { table } from '../utils/table';

export async function incidentsCommand(subcommand: string, args: string[]) {
  switch (subcommand) {
    case 'list': {
      const status = args.includes('--status') ? args[args.indexOf('--status') + 1] : undefined;
      const qs = status ? `?status=${status}` : '';
      const incidents = await request(`/api/v1/incidents${qs}`);
      table(incidents, ['id', 'monitorId', 'status', 'reason', 'startedAt']);
      break;
    }
    case 'ack': {
      if (!args[0]) { console.error('Usage: kast incidents ack <id>'); process.exit(1); }
      await request(`/api/v1/incidents/${args[0]}/acknowledge`, { method: 'POST' });
      console.log('Incident acknowledged.');
      break;
    }
    default:
      console.error(`Unknown subcommand: kast incidents ${subcommand}`);
      process.exit(1);
  }
}
