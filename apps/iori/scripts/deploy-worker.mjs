import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createDeploymentWorkerConfig } from './temporary-worker-config.mjs';

const appRoot = new URL('..', import.meta.url).pathname;
const privateDirectory = mkdtempSync(join(tmpdir(), 'iori-deploy-'));
const wranglerLogPath = join(privateDirectory, 'wrangler.log');
const outputPath = join(privateDirectory, 'deploy.ndjson');
writeFileSync(outputPath, '', { mode: 0o600 });
let commandIndex = 0;
const inputArgs = process.argv.slice(2).filter((arg) => arg !== '--');
const withoutQueueProducer = inputArgs.includes('--without-queue-producer');
const deployArgs = inputArgs.filter((arg) => arg !== '--without-queue-producer');
const isDryRun = deployArgs.includes('--dry-run');

if (deployArgs.some((arg) => arg === '--config' || arg.startsWith('--config='))) {
  throw new Error('deploy-worker manages its own temporary config and does not accept --config.');
}

for (let i = 0; i < deployArgs.length; i++) {
  if (deployArgs[i] === '--dry-run') continue;
  if (deployArgs[i] === '--outdir' && deployArgs[i + 1] && !deployArgs[i + 1].startsWith('-')) {
    i++;
    continue;
  }
  throw new Error('Unsupported deployment argument.');
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
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: wranglerLogPath,
      WRANGLER_OUTPUT_FILE_PATH: outputPath,
      WRANGLER_SEND_METRICS: 'false',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    shell: false,
    ...options,
  });
  writeFileSync(
    join(privateDirectory, `command-${commandIndex++}.txt`),
    `${result.stdout ?? ''}\n${result.stderr ?? ''}`,
    { mode: 0o600 },
  );
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status ?? 1}`);
  }
};

const putRequiredSecret = (name, deployConfigPath) => {
  if (!isDryRun) {
    run('pnpm', ['exec', 'wrangler', 'secret', 'put', name, '--config', deployConfigPath], {
      input: requireEnv(name),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  }
};

const deployWorker = (deployConfigPath) => {
  run('pnpm', ['exec', 'wrangler', 'deploy', '--config', deployConfigPath, '--minify', ...deployArgs]);
};

const preflightDeployment = () => {
  if (requireEnv('IORI_ADMISSION_MODE') !== 'sealed') throw new Error('Deployment must preserve sealed admission.');
  const identity = JSON.parse(requireEnv('IORI_ADMISSION_IDENTITY'));
  if (identity.environment === 'staging' && !isDryRun) requireEnv('STAGING_ACCESS_TOKEN');
  if (process.env.STAGING_ACCESS_TOKEN && process.env.STAGING_ACCESS_TOKEN === process.env.SMOKE_QUEUE_TOKEN) {
    throw new Error('Staging and smoke credentials must be distinct.');
  }
  if (isDryRun) return;
  for (const name of ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY', 'SMOKE_QUEUE_TOKEN']) requireEnv(name);
};

preflightDeployment();
const config = await createDeploymentWorkerConfig({ withoutQueueProducer });
try {
  if (!isDryRun) deployWorker(config.path);
  putRequiredSecret('VAPID_PUBLIC_KEY', config.path);
  putRequiredSecret('VAPID_PRIVATE_KEY', config.path);
  putRequiredSecret('SMOKE_QUEUE_TOKEN', config.path);
  if (process.env.STAGING_ACCESS_TOKEN) putRequiredSecret('STAGING_ACCESS_TOKEN', config.path);
  deployWorker(config.path);
  if (!isDryRun && process.env.IORI_DEPLOYMENT_RESULT_PATH) {
    const records = readFileSync(outputPath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const deployed = records.filter((record) => record.type === 'deploy' && record.version === 1).at(-1);
    if (!deployed?.version_id) throw new Error('Deployment version evidence is unavailable.');
    writeFileSync(
      process.env.IORI_DEPLOYMENT_RESULT_PATH,
      JSON.stringify({ workerName: deployed.worker_name, versionId: deployed.version_id }) + '\n',
      { mode: 0o600 },
    );
    chmodSync(process.env.IORI_DEPLOYMENT_RESULT_PATH, 0o600);
  }
  console.log(isDryRun ? 'iori Worker deploy dry-run passed.' : 'iori Worker deployed.');
} finally {
  await config.cleanup();
}
