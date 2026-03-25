#!/usr/bin/env node

import { spawn } from 'child_process';

const API_URL = process.env.KAST_API_URL ?? 'http://localhost:3001';
const API_KEY = process.env.KAST_API_KEY ?? '';

async function request(path: string, options?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
      ...options?.headers,
    },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    console.error(`Error ${res.status}: ${(body as any).message ?? res.statusText}`);
    process.exit(1);
  }
  return res.json();
}

function table(rows: Record<string, unknown>[], columns: string[]) {
  if (rows.length === 0) {
    console.log('No results.');
    return;
  }
  // Header
  console.log(columns.map((c) => c.padEnd(20)).join(''));
  console.log(columns.map(() => '─'.repeat(20)).join(''));
  // Rows
  for (const row of rows) {
    console.log(
      columns
        .map((c) => {
          const val = row[c];
          const str = val === null || val === undefined ? '—' : String(val);
          return str.slice(0, 19).padEnd(20);
        })
        .join(''),
    );
  }
}

async function main() {
  const [, , command, subcommand, ...args] = process.argv;

  if (!command || command === 'help' || command === '--help') {
    console.log(`
kast — CLI for Kast job monitor

Usage:
  kast monitors list              List all monitors
  kast monitors get <id>          Get monitor details
  kast monitors create            Create a monitor (interactive)
  kast monitors delete <id>       Delete a monitor
  kast monitors pause <id>        Pause a monitor
  kast monitors resume <id>       Resume a monitor

  kast incidents list [--status open|resolved]
  kast incidents ack <id>         Acknowledge an incident

  kast teams list                 List all teams
  kast teams create <name> <slug> Create a team

  kast ping <uuid> [type]         Send a ping (default: success)

  kast wrap -m <uuid> -- <cmd>    Wrap a command with start/success/fail pings

  kast api-keys create [label]    Create an API key
  kast api-keys list              List API keys

  kast health                     Check API health

Environment:
  KAST_API_URL    API base URL (default: http://localhost:3001)
  KAST_API_KEY    API key for authenticated requests
`);
    return;
  }

  switch (command) {
    case 'health': {
      const data = await request('/health');
      console.log(`Status: ${data.status}`);
      console.log(`Time:   ${data.timestamp}`);
      break;
    }

    case 'monitors': {
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
      break;
    }

    case 'incidents': {
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
      break;
    }

    case 'teams': {
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
      break;
    }

    case 'ping': {
      if (!subcommand) { console.error('Usage: kast ping <uuid> [type]'); process.exit(1); }
      const type = args[0] ?? 'success';
      const url = type === 'success' && !args[0]
        ? `/ping/${subcommand}`
        : `/ping/${subcommand}/${type}`;
      const method = url.includes('/') && type !== 'success' ? 'POST' : 'GET';
      await fetch(`${API_URL}${url}`, { method });
      console.log(`Ping sent: ${type}`);
      break;
    }

    case 'api-keys': {
      switch (subcommand) {
        case 'create': {
          const label = args[0] ?? 'cli';
          const key = await request('/api/v1/api-keys', {
            method: 'POST',
            body: JSON.stringify({ label }),
          });
          console.log(`API key created: ${key.key}`);
          console.log(`\nSet it with: export KAST_API_KEY=${key.key}`);
          break;
        }
        case 'list': {
          const keys = await request('/api/v1/api-keys');
          table(keys, ['keyPrefix', 'label', 'lastUsedAt', 'createdAt']);
          break;
        }
        default:
          console.error(`Unknown subcommand: kast api-keys ${subcommand}`);
          process.exit(1);
      }
      break;
    }

    case 'wrap': {
      // Parse everything after `wrap` manually: flags before `--`, command after `--`
      const rawArgs = process.argv.slice(3); // everything after `kast wrap`
      const dashDashIndex = rawArgs.indexOf('--');
      if (dashDashIndex === -1) {
        console.error('Usage: kast wrap --monitor <uuid> -- <command> [args...]');
        process.exit(1);
      }

      const kastFlags = rawArgs.slice(0, dashDashIndex);
      const cmdArgs = rawArgs.slice(dashDashIndex + 1);

      if (cmdArgs.length === 0) {
        console.error('Usage: kast wrap --monitor <uuid> -- <command> [args...]');
        process.exit(1);
      }

      // Extract --monitor / -m flag
      let monitorUuid: string | undefined;
      for (let i = 0; i < kastFlags.length; i++) {
        if (kastFlags[i] === '--monitor' || kastFlags[i] === '-m') {
          monitorUuid = kastFlags[i + 1];
          break;
        }
      }

      if (!monitorUuid) {
        console.error('Missing required flag: --monitor <uuid> (or -m <uuid>)');
        process.exit(1);
      }

      const pingUrl = (type: string) => `${API_URL}/ping/${monitorUuid}/${type}`;

      // 1. Send start ping
      try {
        await fetch(pingUrl('start'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
          },
        });
      } catch (err) {
        console.error(`Warning: failed to send start ping: ${(err as Error).message}`);
      }

      // 2. Spawn child process with piped stdout/stderr
      const [cmd, ...spawnArgs] = cmdArgs;
      const child = spawn(cmd, spawnArgs, {
        stdio: ['inherit', 'pipe', 'pipe'],
      });

      const outputChunks: Buffer[] = [];

      child.stdout.on('data', (chunk: Buffer) => {
        process.stdout.write(chunk);
        outputChunks.push(chunk);
      });

      child.stderr.on('data', (chunk: Buffer) => {
        process.stderr.write(chunk);
        outputChunks.push(chunk);
      });

      const exitCode = await new Promise<number>((resolve) => {
        child.on('close', (code) => resolve(code ?? 1));
        child.on('error', (err) => {
          console.error(`Failed to start command: ${err.message}`);
          resolve(1);
        });
      });

      const capturedOutput = Buffer.concat(outputChunks).toString('utf-8');

      // 3. Send success or fail ping
      const pingType = exitCode === 0 ? 'success' : 'fail';
      const pingBody = exitCode === 0
        ? { body: capturedOutput }
        : { body: `${capturedOutput}\n\nExit code: ${exitCode}` };

      try {
        await fetch(pingUrl(pingType), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(API_KEY ? { 'x-api-key': API_KEY } : {}),
          },
          body: JSON.stringify(pingBody),
        });
      } catch (err) {
        console.error(`Warning: failed to send ${pingType} ping: ${(err as Error).message}`);
      }

      process.exit(exitCode);
    }

    default:
      console.error(`Unknown command: ${command}. Run "kast help" for usage.`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
