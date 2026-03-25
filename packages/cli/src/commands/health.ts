import { request } from '../client';

export async function healthCommand() {
  const data = await request('/health');
  console.log(`Status: ${data.status}`);
  console.log(`Time:   ${data.timestamp}`);
}
