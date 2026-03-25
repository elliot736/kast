import { request, API_URL } from '../client';
import { table } from '../utils/table';

export async function monitorsCommand(subcommand: string, args: string[]) {
  switch (subcommand) {
    case 'list': {
      const monitors = await request('/api/v1/monitors');
      table(monitors, ['name', 'status', 'slug', 'lastPingAt']);
      break;
    }
    case 'get': {
      if (!args[0]) { console.error('Usage: kast monitors get <id>'); process.exit(1); }
      const monitor = await request(`/api/v1/monitors/${args[0]}`);
      console.log(JSON.stringify(monitor, null, 2));
      break;
    }
    case 'create': {
      const readline = await import('readline');
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
      const ask = (q: string): Promise<string> =>
        new Promise((resolve) => rl.question(q, resolve));

      const name = await ask('Name: ');
      const slug = await ask('Slug: ');
      const schedule = await ask('Cron schedule (or empty): ');
      const interval = await ask('Interval seconds (or empty): ');
      const grace = await ask('Grace seconds [300]: ');

      rl.close();

      const body: Record<string, unknown> = { name, slug };
      if (schedule) body.schedule = schedule;
      if (interval) body.intervalSeconds = Number(interval);
      body.graceSeconds = Number(grace) || 300;

      const monitor = await request('/api/v1/monitors', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      console.log(`\nMonitor created!`);
      console.log(`  ID:        ${monitor.id}`);
      console.log(`  Ping UUID: ${monitor.pingUuid}`);
      console.log(`  Ping URL:  ${API_URL}/ping/${monitor.pingUuid}/success`);
      break;
    }
    case 'delete': {
      if (!args[0]) { console.error('Usage: kast monitors delete <id>'); process.exit(1); }
      await request(`/api/v1/monitors/${args[0]}`, { method: 'DELETE' });
      console.log('Monitor deleted.');
      break;
    }
    case 'pause': {
      if (!args[0]) { console.error('Usage: kast monitors pause <id>'); process.exit(1); }
      await request(`/api/v1/monitors/${args[0]}/pause`, { method: 'POST' });
      console.log('Monitor paused.');
      break;
    }
    case 'resume': {
      if (!args[0]) { console.error('Usage: kast monitors resume <id>'); process.exit(1); }
      await request(`/api/v1/monitors/${args[0]}/resume`, { method: 'POST' });
      console.log('Monitor resumed.');
      break;
    }
    default:
      console.error(`Unknown subcommand: kast monitors ${subcommand}`);
      process.exit(1);
  }
}
