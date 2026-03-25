import { spawn } from 'child_process';
import { API_URL, API_KEY } from '../client';

export async function wrapCommand() {
  const rawArgs = process.argv.slice(3);
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
