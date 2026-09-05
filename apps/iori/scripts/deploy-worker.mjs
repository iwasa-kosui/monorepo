import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDeploymentWorkerConfig } from './temporary-worker-config.mjs';

const appRoot = new URL('..', import.meta.url).pathname;
const wranglerLogPath = process.env.WRANGLER_LOG_PATH ?? join(tmpdir(), 'iori-wrangler-logs');
const inputArgs = process.argv.slice(2).filter((arg) => arg !== '--');
const withoutQueueProducer = inputArgs.includes('--without-queue-producer');
const deployArgs = inputArgs.filter((arg) => arg !== '--without-queue-producer');
const isDryRun = deployArgs.includes('--dry-run');

if (deployArgs.some((arg) => arg === '--config' || arg.startsWith('--config='))) {
  throw new Error('deploy-worker manages its own temporary config and does not accept --config.');
}

const requireEnv = (name) => {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`${name} is required for iori Worker deployment.`);
  }
  return value;
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: appRoot,
    env: { ...process.env, WRANGLER_LOG_PATH: wranglerLogPath },
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 1}`);
  }
};

const putRequiredSecret = (name, deployConfigPath) => {
  if (!isDryRun) {
    run('pnpm', ['exec', 'wrangler', 'secret', 'put', name, '--config', deployConfigPath], {
      input: requireEnv(name),
      stdio: ['pipe', 'inherit', 'inherit'],
    });
  }
};

const deployWorker = (deployConfigPath) => {
  run('pnpm', ['exec', 'wrangler', 'deploy', '--config', deployConfigPath, '--minify', ...deployArgs]);
};

const preflightDeployment = () => {
  if (isDryRun) return;
  for (const name of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'SMOKE_QUEUE_TOKEN']) requireEnv(name);
};

preflightDeployment();
const config = await createDeploymentWorkerConfig({ withoutQueueProducer });
try {
  putRequiredSecret('VAPID_PUBLIC_KEY', config.path);
  putRequiredSecret('VAPID_PRIVATE_KEY', config.path);
  putRequiredSecret('SMOKE_QUEUE_TOKEN', config.path);
  deployWorker(config.path);
  console.log(isDryRun ? 'iori Worker deploy dry-run passed.' : 'iori Worker deployed.');
} finally {
  await config.cleanup();
}
