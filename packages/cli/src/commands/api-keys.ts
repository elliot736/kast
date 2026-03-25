import { request } from '../client';
import { table } from '../utils/table';

export async function apiKeysCommand(subcommand: string, args: string[]) {
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
}
