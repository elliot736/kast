export default async function globalTeardown() {
  const pid = process.env.__KAST_API_PID;
  if (pid) {
    console.log(`Stopping API (pid ${pid})...`);
    try {
      process.kill(Number(pid), 'SIGTERM');
    } catch {}
  }

  // Optionally stop infra — leave running for faster re-runs
  if (process.env.TEARDOWN_INFRA === 'true') {
    const { execSync } = require('child_process');
    const { resolve } = require('path');
    console.log('Stopping infra...');
    execSync('docker compose down -v', {
      cwd: resolve(__dirname, '../..'),
      stdio: 'inherit',
    });
  }
}
