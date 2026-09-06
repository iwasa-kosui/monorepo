import { spawnSync } from 'node:child_process';
import { createDeploymentWorkerConfig } from './temporary-worker-config.mjs';

const config = await createDeploymentWorkerConfig();
try {
  const result = spawnSync('pnpm', [
    'exec',
    'wrangler',
    'd1',
    'migrations',
    'apply',
    'iori',
    '--remote',
    '--config',
    config.path,
  ], { stdio: 'inherit', shell: false });
  if (result.status !== 0) {
    throw new Error(`pnpm exited with status ${result.status ?? 1}`);
  }
} finally {
  await config.cleanup();
}
