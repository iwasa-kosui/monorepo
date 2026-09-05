import { execFile } from 'node:child_process';
import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const appRoot = new URL('../..', import.meta.url).pathname;

const fixtureEnvironment = (directory: string, options: { rejectQueueProducer?: boolean } = {}) => ({
  ...process.env,
  WORKER_NAME: 'iori-fixture',
  ACCOUNT_ID: '00000000-0000-4000-8000-000000000001',
  D1_DATABASE_ID: '00000000-0000-4000-8000-000000000002',
  KV_NAMESPACE_ID: '00000000000000000000000000000003',
  R2_BUCKET_NAME: 'iori-uploads-fixture',
  QUEUE_NAME: 'iori-fedify-fixture',
  ORIGIN: 'https://iori.example.invalid',
  VAPID_SUBJECT: 'mailto:admin@example.invalid',
  IORI_FAKE_PNPM_LOG: join(directory, 'pnpm.log'),
  IORI_FAKE_PNPM_COMMAND_LOG: join(directory, 'pnpm-command.log'),
  IORI_REJECT_QUEUE_PRODUCER: options.rejectQueueProducer === true ? 'true' : 'false',
  PATH: `${directory}:${process.env.PATH}`,
});

const createFakePnpm = async () => {
  const directory = await mkdtemp(join(tmpdir(), 'iori-fake-pnpm-'));
  const executable = join(directory, 'pnpm');
  await writeFile(
    executable,
    `#!/bin/sh
config=''
for arg in "$@"; do
  if [ "$previous" = '--config' ]; then config="$arg"; fi
  previous="$arg"
done
test -f "$config"
test "$(stat -f '%Lp' "$config")" = 600
grep -q 'https://iori.example.invalid' "$config"
if [ "$IORI_REJECT_QUEUE_PRODUCER" = true ]; then ! grep -q 'FEDIFY_QUEUE' "$config" || exit 1; fi
printf '%s\\n' "$config" >> "$IORI_FAKE_PNPM_LOG"
printf '%s\\n' "$*" >> "$IORI_FAKE_PNPM_COMMAND_LOG"
if [ "$IORI_FAIL_SECRET_PUT" = true ] && [ "$1 $2 $3 $4" = 'exec wrangler secret put' ]; then exit 1; fi
`,
    { mode: 0o755 },
  );
  return directory;
};

describe('temporary Worker config command paths', () => {
  it('rejects a caller-supplied config path', async () => {
    const fakePnpmDirectory = await createFakePnpm();
    const script = new URL('../deploy-worker.mjs', import.meta.url).pathname;

    await expect(
      execFileAsync(process.execPath, [script, '--dry-run', '--config', 'workers/iori/wrangler.local.jsonc'], {
        cwd: appRoot,
        env: fixtureEnvironment(fakePnpmDirectory),
      }),
    ).rejects.toThrow('--config');
  });

  it('deploys a temporary version without the Queue producer when requested', async () => {
    const fakePnpmDirectory = await createFakePnpm();
    const script = new URL('../deploy-worker.mjs', import.meta.url).pathname;
    const { stdout } = await execFileAsync(process.execPath, [script, '--dry-run', '--without-queue-producer'], {
      cwd: appRoot,
      env: fixtureEnvironment(fakePnpmDirectory, { rejectQueueProducer: true }),
    });

    expect(stdout).toContain('iori Worker deploy dry-run passed.');
  });

  it('deploy dry-run renders a private temporary config and cleans it up', async () => {
    const fakePnpmDirectory = await createFakePnpm();
    const script = new URL('../deploy-worker.mjs', import.meta.url).pathname;
    const { stdout } = await execFileAsync(process.execPath, [script, '--dry-run'], {
      cwd: appRoot,
      env: fixtureEnvironment(fakePnpmDirectory),
    });
    const configPath = (await readFile(join(fakePnpmDirectory, 'pnpm.log'), 'utf8')).trim();

    expect(stdout).toContain('iori Worker deploy dry-run passed.');
    await expect(access(configPath)).rejects.toThrow();
  });

  it('does not deploy when a required secret is missing or a secret update fails', async () => {
    const fakePnpmDirectory = await createFakePnpm();
    const script = new URL('../deploy-worker.mjs', import.meta.url).pathname;
    const missingToken: NodeJS.ProcessEnv = {
      ...fixtureEnvironment(fakePnpmDirectory),
      VAPID_PUBLIC_KEY: 'fixture-public',
      VAPID_PRIVATE_KEY: 'fixture-private',
    };
    delete missingToken.SMOKE_QUEUE_TOKEN;
    await expect(execFileAsync(process.execPath, [script], { cwd: appRoot, env: missingToken })).rejects.toThrow(
      'SMOKE_QUEUE_TOKEN',
    );
    await expect(access(join(fakePnpmDirectory, 'pnpm-command.log'))).rejects.toThrow();

    const failingSecret = {
      ...fixtureEnvironment(fakePnpmDirectory),
      VAPID_PUBLIC_KEY: 'fixture-public',
      VAPID_PRIVATE_KEY: 'fixture-private',
      SMOKE_QUEUE_TOKEN: 'fixture-smoke-token',
      IORI_FAIL_SECRET_PUT: 'true',
    };
    await expect(execFileAsync(process.execPath, [script], { cwd: appRoot, env: failingSecret })).rejects.toThrow();
    const commands = await readFile(join(fakePnpmDirectory, 'pnpm-command.log'), 'utf8');
    expect(commands).toContain('exec wrangler secret put VAPID_PUBLIC_KEY');
    expect(commands).not.toContain('exec wrangler deploy');
  });

  it('remote D1 migration renders a private temporary config and cleans it up', async () => {
    const fakePnpmDirectory = await createFakePnpm();
    const script = new URL('../d1-migrate-remote.mjs', import.meta.url).pathname;
    await execFileAsync(process.execPath, [script], {
      cwd: appRoot,
      env: fixtureEnvironment(fakePnpmDirectory),
    });
    const configPath = (await readFile(join(fakePnpmDirectory, 'pnpm.log'), 'utf8')).trim();

    await expect(access(configPath)).rejects.toThrow();
  });
});
