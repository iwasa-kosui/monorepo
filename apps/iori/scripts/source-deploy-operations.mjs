import { lstat, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { runMigrationCommand } from './migration-command.mjs';
import {
  inspectSourceDistDirectory,
  validateSourceBuildManifest,
  verifySourceBuildManifest,
} from './source-build-manifest.mjs';
import { assertSourceDeployAllowed } from './source-deploy-guard.mjs';

const inspectOwnedCheckout = async (home, uid) => {
  for (const path of [join(home, 'monorepo'), join(home, 'monorepo/apps/iori')]) {
    const stat = await lstat(path);
    if (!stat.isDirectory() || stat.uid !== uid || (stat.mode & 0o022) || await realpath(path) !== path) {
      throw new Error('Source checkout is invalid.');
    }
  }
};
export const inspectSourcePnpm = async (path, uid) => {
  const stat = await lstat(path);
  if (
    !stat.isFile() || stat.uid !== uid || !(stat.mode & 0o100) || (stat.mode & 0o022)
    || await realpath(path) !== path
  ) throw new Error('Invalid source pnpm executable.');
};
// Only the fixed SSH bootstrap enables this transport. Its stderr is captured privately by the runner.
export const captureSourceCommandOutput = async ({ stdout, stderr }) => {
  const output = Buffer.concat([Buffer.from(stdout), Buffer.from('\n'), Buffer.from(stderr)]);
  if (output.length > 8_000_001) throw new Error('Source diagnostic limit exceeded.');
  await new Promise((resolve, reject) => {
    process.stderr.write(output, error => error ? reject(new Error('Source diagnostic transport failed.')) : resolve());
  });
};
export const runSourceDeployStep = async (
  { phase, sha, manifest },
  {
    home = homedir(),
    uid = process.getuid?.(),
    guard = assertSourceDeployAllowed,
    inspectCheckout = inspectOwnedCheckout,
    inspectPnpm = inspectSourcePnpm,
    runCommand = runMigrationCommand,
    signal,
    captureOutput,
  } = {},
) => {
  if (
    !/^[a-f0-9]{40}$/.test(sha ?? '')
    || !['check', 'checkout', 'dependencies', 'dist-check', 'verify-dist', 'install', 'restart'].includes(phase)
  ) {
    throw new Error('Invalid source deployment operation.');
  }
  if (['dist-check', 'verify-dist', 'install', 'restart'].includes(phase)) validateSourceBuildManifest(manifest, sha);
  const check = async () => {
    signal?.throwIfAborted();
    await guard({ home, uid });
  };
  await check();
  if (phase === 'check') return;
  await inspectCheckout(home, uid);
  const checkout = join(home, 'monorepo');
  const nodeBin = join(home, '.nvm/versions/node/v24.12.0/bin');
  const pnpm = join(home, '.local/share/pnpm/pnpm');
  const exec = (program, args) =>
    runCommand(program, args, {
      cwd: checkout,
      env: { ...process.env, PATH: `${nodeBin}:${join(home, '.local/share/pnpm')}:/usr/bin:/bin` },
      timeout: 10 * 60_000,
      maxBuffer: 8_000_000,
      signal,
      captureOutput,
    });
  const git = (args) => exec('git', ['-C', checkout, ...args]);
  const clean = async () => {
    if ((await git(['status', '--porcelain', '--untracked-files=no'])).stdout.trim()) {
      throw new Error('Dirty source checkout.');
    }
  };
  const exact = async () => {
    if ((await git(['rev-parse', 'HEAD'])).stdout.trim() !== sha) throw new Error('Source revision mismatch.');
    await clean();
  };
  if (phase === 'checkout') {
    await clean();
    const origin = (await git(['remote', 'get-url', 'origin'])).stdout.trim();
    if (!['git@github.com:iwasa-kosui/monorepo.git', 'https://github.com/iwasa-kosui/monorepo.git'].includes(origin)) {
      throw new Error('Unexpected source repository.');
    }
    await check();
    await git(['fetch', '--no-tags', 'origin', 'main']);
    if ((await git(['rev-parse', 'origin/main'])).stdout.trim() !== sha) throw new Error('Source main changed.');
    await check();
    await git(['reset', '--hard', sha]);
    await exact();
  } else {
    await exact();
    if (phase === 'dependencies') {
      await check();
      await inspectPnpm(pnpm, uid);
      if ((await exec(pnpm, ['--version'])).stdout.trim() !== '10.12.4') throw new Error('Unsupported source pnpm.');
      await check();
      await exec(pnpm, ['install', '--frozen-lockfile']);
      await check();
      await exact();
    } else {
      await check();
      const dist = join(checkout, 'apps/iori/dist');
      await inspectSourceDistDirectory(dist, uid, phase === 'dist-check');
      if (phase !== 'dist-check') await verifySourceBuildManifest(dist, manifest, sha, { uid, signal });
      await check();
      if (phase === 'dist-check' || phase === 'verify-dist') return;
      if (phase === 'install') {
        // Preserve the source-local systemd environment and TLS configuration; never read its bytes.
        const existing = await lstat('/etc/systemd/system/microblog.service.d/env.conf');
        if (!existing.isFile() || existing.uid !== 0 || (existing.mode & 0o022)) {
          throw new Error('Source configuration unavailable.');
        }
        for (
          const [name, destination, mode] of [
            ['microblog.service', '/etc/systemd/system/microblog.service', '644'],
            ['microblog.sh', '/usr/local/bin/microblog', '755'],
            ['nginx.conf', '/etc/nginx/nginx.conf', '644'],
          ]
        ) {
          await check();
          await exec('sudo', ['-n', 'install', '-m', mode, join(checkout, 'apps/iori', name), destination]);
        }
      } else {
        for (
          const args of [['daemon-reload'], ['enable', 'microblog'], ['restart', 'microblog'], ['restart', 'nginx']]
        ) {
          await check();
          await exec('sudo', ['-n', 'systemctl', ...args]);
        }
      }
    }
  }
  await check();
};
