import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const appRoot = new URL('..', import.meta.url).pathname;
const configPath = 'workers/iori/wrangler.jsonc';
const wranglerLogPath = process.env.WRANGLER_LOG_PATH ?? join(tmpdir(), 'iori-wrangler-logs');

const parseArgs = (args) => args.filter((arg) => arg !== '--');
const deployArgs = parseArgs(process.argv.slice(2));
const isDryRun = deployArgs.includes('--dry-run');

const requireEnv = (name) => {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    console.error(`${name} is required for iori Worker deployment.`);
    process.exit(1);
  }
  return value;
};

const stripJsonc = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/,\s*([}\]])/g, '$1');

const resolveFromBase = (baseDir, path) => {
  if (path === undefined || isAbsolute(path)) {
    return path;
  }
  return join(baseDir, path);
};

const run = (command, args, options = {}) => {
  const result = spawnSync(command, args, {
    cwd: appRoot,
    env: {
      ...process.env,
      WRANGLER_LOG_PATH: wranglerLogPath,
    },
    stdio: 'inherit',
    shell: false,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const putRequiredSecret = (name, deployConfigPath) => {
  if (isDryRun) {
    return;
  }
  const value = requireEnv(name);

  run(
    'pnpm',
    [
      'exec',
      'wrangler',
      'secret',
      'put',
      name,
      '--config',
      deployConfigPath,
    ],
    {
      input: value,
      stdio: ['pipe', 'inherit', 'inherit'],
    },
  );
};

const deployWorker = (deployConfigPath) => {
  run('pnpm', [
    'exec',
    'wrangler',
    'deploy',
    '--config',
    deployConfigPath,
    '--minify',
    ...deployArgs,
  ]);
};

const baseConfigPath = join(appRoot, configPath);
const baseConfig = JSON.parse(stripJsonc(await readFile(baseConfigPath, 'utf8')));
const configDir = dirname(baseConfigPath);

const vars = {
  ...baseConfig.vars,
  ORIGIN: requireEnv('ORIGIN'),
  VAPID_SUBJECT: requireEnv('VAPID_SUBJECT'),
};

const deployConfig = {
  ...baseConfig,
  main: resolveFromBase(configDir, baseConfig.main),
  vars,
  assets: baseConfig.assets === undefined
    ? undefined
    : {
      ...baseConfig.assets,
      directory: resolveFromBase(configDir, baseConfig.assets.directory),
    },
  d1_databases: baseConfig.d1_databases?.map((database) => ({
    ...database,
    migrations_dir: resolveFromBase(configDir, database.migrations_dir),
  })),
};

const dir = await mkdtemp(join(tmpdir(), 'iori-worker-'));
const deployConfigPath = join(dir, 'wrangler.json');
await writeFile(deployConfigPath, JSON.stringify(deployConfig, null, 2) + '\n');

if (!isDryRun) {
  deployWorker(deployConfigPath);
}

putRequiredSecret('VAPID_PUBLIC_KEY', deployConfigPath);
putRequiredSecret('VAPID_PRIVATE_KEY', deployConfigPath);

deployWorker(deployConfigPath);

if (isDryRun) {
  console.log('iori Worker deploy dry-run passed.');
} else {
  console.log('iori Worker deployed.');
}
