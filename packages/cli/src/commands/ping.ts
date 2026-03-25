import { API_URL } from '../client';

export async function pingCommand(uuid: string, args: string[]) {
  if (!uuid) { console.error('Usage: kast ping <uuid> [type]'); process.exit(1); }
  const type = args[0] ?? 'success';
  const url = type === 'success' && !args[0]
    ? `/ping/${uuid}`
    : `/ping/${uuid}/${type}`;
  const method = url.includes('/') && type !== 'success' ? 'POST' : 'GET';
  await fetch(`${API_URL}${url}`, { method });
  console.log(`Ping sent: ${type}`);
}
