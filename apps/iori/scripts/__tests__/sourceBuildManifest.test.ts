import { chmod, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

import {
  createSourceBuildManifest,
  inspectSourceDistDirectory,
  verifySourceBuildManifest,
} from '../source-build-manifest.mjs';
import { inspectSourcePnpm, runSourceDeployStep } from '../source-deploy-operations.mjs';
import { createFixtureDirectory } from './fixtureTemp.js';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
const fixture = async () => {
  const root = await createFixtureDirectory('iori-build-');
  roots.push(root);
  return root;
};
const sha = 'a'.repeat(40);
it('rejects a symlink distribution destination before any delete-capable transfer', async () => {
  const home = await fixture();
  await mkdir(join(home, 'monorepo/apps/iori'), { recursive: true });
  const elsewhere = join(home, 'elsewhere');
  await mkdir(elsewhere);
  await writeFile(join(elsewhere, 'sentinel'), 'keep');
  await symlink(elsewhere, join(home, 'monorepo/apps/iori/dist'));
  const commands: string[] = [];
  await expect(
    runSourceDeployStep({
      phase: 'dist-check',
      sha,
      manifest: { sha, files: [{ path: 'index.js', bytes: 0, sha256: sha.padEnd(64, 'a') }] },
    }, {
      home,
      guard: async () => {},
      runCommand: async (program, args) => {
        commands.push(program);
        return { stdout: args.includes('rev-parse') ? sha : '', stderr: '' };
      },
    }),
  ).rejects.toThrow();
  expect(commands.every(program => program === 'git')).toBe(true);
});
it.each(['changed', 'missing', 'extra'])('rejects %s closure before restart', async failure => {
  const root = await fixture();
  await writeFile(join(root, 'index.js'), 'reviewed');
  const manifest = await createSourceBuildManifest(root, sha);
  await verifySourceBuildManifest(root, manifest, sha);
  if (failure === 'changed') await writeFile(join(root, 'index.js'), 'corrupted');
  if (failure === 'missing') await rm(join(root, 'index.js'));
  if (failure === 'extra') await writeFile(join(root, 'unexpected'), 'extra');
  await expect(verifySourceBuildManifest(root, manifest, sha)).rejects.toThrow();
});
it('requires owned real executable pnpm with exact version before install', async () => {
  const root = await fixture();
  const executable = join(root, 'pnpm');
  await writeFile(executable, 'fixture', { mode: 0o700 });
  await inspectSourcePnpm(executable, process.getuid!());
  await chmod(executable, 0o722);
  await expect(inspectSourcePnpm(executable, process.getuid!())).rejects.toThrow();
  await symlink(executable, join(root, 'link'));
  await expect(inspectSourcePnpm(join(root, 'link'), process.getuid!())).rejects.toThrow();
  const calls: string[][] = [];
  await expect(runSourceDeployStep({ phase: 'dependencies', sha }, {
    home: root,
    guard: async () => {},
    inspectCheckout: async () => {},
    inspectPnpm: async () => {},
    runCommand: async (_program, args) => {
      calls.push(args);
      return { stdout: args.includes('rev-parse') ? sha : args.includes('--version') ? '10.12.3' : '', stderr: '' };
    },
  })).rejects.toThrow('Unsupported source pnpm');
  expect(calls.some(args => args.includes('install'))).toBe(false);
  await expect(inspectSourceDistDirectory(executable, process.getuid!())).rejects.toThrow();
});
