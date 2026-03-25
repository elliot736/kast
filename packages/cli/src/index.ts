#!/usr/bin/env node

import { healthCommand } from './commands/health';
import { monitorsCommand } from './commands/monitors';
import { incidentsCommand } from './commands/incidents';
import { teamsCommand } from './commands/teams';
import { pingCommand } from './commands/ping';
import { wrapCommand } from './commands/wrap';
import { apiKeysCommand } from './commands/api-keys';
import { applyCommand } from './commands/apply';
import { validateCommand } from './commands/validate';

async function main() {
  const [, , command, subcommand, ...args] = process.argv;

  if (!command || command === 'help' || command === '--help') {
    console.log(`
kast — CLI for Kast job monitor

Usage:
  kast apply -f <file> [--dry-run]   Apply a declarative YAML config
  kast validate -f <file>            Validate a YAML config file

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
    case 'health':
      return healthCommand();
    case 'monitors':
      return monitorsCommand(subcommand, args);
    case 'incidents':
      return incidentsCommand(subcommand, args);
    case 'teams':
      return teamsCommand(subcommand, args);
    case 'ping':
      return pingCommand(subcommand, args);
    case 'wrap':
      return wrapCommand();
    case 'api-keys':
      return apiKeysCommand(subcommand, args);
    case 'apply':
      return applyCommand(process.argv.slice(3));
    case 'validate':
      return validateCommand(process.argv.slice(3));
    default:
      console.error(`Unknown command: ${command}. Run "kast help" for usage.`);
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
