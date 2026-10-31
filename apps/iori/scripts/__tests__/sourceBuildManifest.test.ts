import { chmod, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createSourceBuildManifest,
  inspectSourceDistDirectory,
  verifySourceBuildManifest,
} from '../source-build-manifest.mjs';
import { inspectSourcePnpm, runSourceDeployStep } from '../source-deploy-operations.mjs';
import { createFixtureDirectory } from './fixtureTemp.js';

const roots: string[] = [];
afterEach(async () => {
  vi.restoreAllMocks();
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
it('ignores a top-level uploads directory in the closure and rejects any other uploads entry', async () => {
  const root = await fixture();
  await writeFile(join(root, 'index.js'), 'reviewed');
  const manifest = await createSourceBuildManifest(root, sha);
  await mkdir(join(root, 'uploads/nested'), { recursive: true });
  await writeFile(join(root, 'uploads/nested/image with space.png'), 'upload');
  await expect(createSourceBuildManifest(root, sha)).resolves.toEqual(manifest);
  await verifySourceBuildManifest(root, manifest, sha);
  await mkdir(join(root, 'sub/uploads'), { recursive: true });
  await writeFile(join(root, 'sub/uploads/image.png'), 'upload');
  await expect(verifySourceBuildManifest(root, manifest, sha)).rejects.toThrow();
  await rm(join(root, 'sub'), { recursive: true });
  await rm(join(root, 'uploads'), { recursive: true });
  await writeFile(join(root, 'uploads'), 'file');
  await expect(createSourceBuildManifest(root, sha)).rejects.toThrow();
});
describe('UPLOAD_DIR inspection before the dist transfer', () => {
  const run = async (home: string, stdout: string) => {
    const calls: { program: string; args: string[] }[] = [];
    const result = runSourceDeployStep({
      phase: 'dist-check',
      sha,
      manifest: { sha, files: [{ path: 'index.js', bytes: 0, sha256: sha.padEnd(64, 'a') }] },
    }, {
      home,
      guard: async () => {},
      inspectCheckout: async () => {},
      runCommand: async (program, args) => {
        calls.push({ program, args });
        return { stdout: program === 'sudo' ? stdout : args.includes('rev-parse') ? sha : '', stderr: '' };
      },
    });
    return { calls, result };
  };
  const prepare = async () => {
    const home = await fixture();
    await mkdir(join(home, 'monorepo/apps/iori'), { recursive: true });
    return home;
  };
  it.each(
    [
      ['unset', '', 'not set'],
      ['relative', 'Environment="UPLOAD_DIR=uploads"\n', 'absolute path'],
      [
        'inside dist',
        (home: string) => `Environment="UPLOAD_DIR=${home}/monorepo/apps/iori/dist/uploads"\n`,
        'outside dist',
      ],
      ['missing', (home: string) => `Environment="UPLOAD_DIR=${home}/missing"\n`, 'existing directory'],
    ] as const,
  )('stops when UPLOAD_DIR is %s', async (_name, line, message) => {
    const home = await prepare();
    const { result } = await run(home, typeof line === 'function' ? line(home) : line);
    await expect(result).rejects.toThrow(message);
  });
  it('accepts an existing UPLOAD_DIR outside dist and reads only the UPLOAD_DIR line', async () => {
    const home = await prepare();
    await mkdir(join(home, 'uploads'));
    const { calls, result } = await run(home, `Environment="UPLOAD_DIR=${home}/uploads"\n`);
    await expect(result).resolves.toBeUndefined();
    const sudo = calls.filter(call => call.program === 'sudo');
    expect(sudo).toHaveLength(1);
    expect(sudo[0].args.slice(0, 3)).toEqual(['-n', 'sed', '-n']);
    expect(sudo[0].args.at(-1)).toBe('/etc/systemd/system/microblog.service.d/env.conf');
  });
});
describe('configuration owner reset before install', () => {
  const environmentFile = '/etc/systemd/system/microblog.service.d/env.conf';
  type Stat = { isFile: () => boolean; uid: number; gid: number; mode: number };
  const regular = (uid: number, mode = 0o100640): Stat => ({ isFile: () => true, uid, gid: 1002, mode });
  const run = async (stats: Stat[]) => {
    const home = await fixture();
    const dist = join(home, 'monorepo/apps/iori/dist');
    await mkdir(dist, { recursive: true });
    await writeFile(join(dist, 'index.js'), 'reviewed');
    const manifest = await createSourceBuildManifest(dist, sha);
    const writes: string[] = [];
    vi.spyOn(process.stderr, 'write').mockImplementation(
      ((chunk: string | Uint8Array) => {
        writes.push(String(chunk));
        return true;
      }) as typeof process.stderr.write,
    );
    const sudo: string[][] = [];
    const lstatPaths: string[] = [];
    const result = runSourceDeployStep({ phase: 'configuration-owner', sha, manifest }, {
      home,
      guard: async () => {},
      inspectCheckout: async () => {},
      lstatFile: async path => {
        lstatPaths.push(path);
        const next = stats.shift();
        if (!next) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        return next;
      },
      runCommand: async (program, args) => {
        if (program === 'sudo') sudo.push(args);
        return { stdout: args.includes('rev-parse') ? sha : '', stderr: '' };
      },
    });
    return { result, sudo, writes, lstatPaths };
  };
  it('does nothing when root already owns the configuration', async () => {
    const { result, sudo, writes } = await run([regular(0)]);
    await expect(result).resolves.toBeUndefined();
    expect(sudo).toEqual([]);
    expect(writes.join('')).not.toContain('IORI_NOTICE');
  });
  it('runs the fixed chown once and prints only the previous owner ids', async () => {
    const { result, sudo, writes, lstatPaths } = await run([regular(1001), regular(0)]);
    await expect(result).resolves.toBeUndefined();
    expect(sudo).toEqual([['-n', 'chown', '0:0', environmentFile]]);
    expect(lstatPaths).toEqual([environmentFile, environmentFile]);
    expect(writes.filter(line => line.startsWith('IORI_NOTICE'))).toEqual([
      'IORI_NOTICE stage=remote-configuration-owner previous_uid=1001 previous_gid=1002\n',
    ]);
  });
  it('fails without a notice when the owner is still not root after chown', async () => {
    const { result, sudo, writes } = await run([regular(1001), regular(1001)]);
    await expect(result).rejects.toThrow('Source configuration owner reset failed.');
    expect(sudo).toHaveLength(1);
    expect(writes.join('')).not.toContain('IORI_NOTICE');
  });
  it.each([
    ['a symbolic link', { ...regular(1001), isFile: () => false, mode: 0o120777 }],
    ['not a regular file', { ...regular(1001), isFile: () => false, mode: 0o040755 }],
    ['group writable', regular(1001, 0o100660)],
    ['world writable', regular(0, 0o100602)],
  ])('refuses without chown when the configuration is %s', async (_name, stat) => {
    const { result, sudo } = await run([stat]);
    await expect(result).rejects.toThrow('Source configuration unavailable.');
    expect(sudo).toEqual([]);
  });
  it('refuses without chown when the configuration is missing', async () => {
    const { result, sudo } = await run([]);
    await expect(result).rejects.toThrow('Source configuration unavailable.');
    expect(sudo).toEqual([]);
  });
});
