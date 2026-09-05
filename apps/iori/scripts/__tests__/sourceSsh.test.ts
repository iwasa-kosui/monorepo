import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { chmod, open, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';
import { afterEach, expect, it, vi } from 'vitest';

import { APPLICATION_TABLE_ORDER } from '../export-postgres-lib.mjs';
import { createSourceSshAdapter } from '../source-control-ssh.mjs';
import { createFixtureDirectory } from './fixtureTemp.ts';

vi.mock('node:fs/promises', async (importOriginal) => {
  const native = await importOriginal<typeof import('node:fs/promises')>();
  return { ...native, open: vi.fn(native.open), rename: vi.fn(native.rename) };
});
const nativeFs = await vi.importActual<typeof import('node:fs/promises')>('node:fs/promises');

const state = {
  source_revision: 'a'.repeat(40),
  identity: { main_sha: 'a'.repeat(40), run_id: '123' },
  ingress_frozen: true,
  http_inflight: 0,
  queue_depth: 0,
  dequeue_work: 0,
  enqueue_work: 0,
  consumer_paused: true,
  queue_failed: false,
  drained: true,
};
const roots: string[] = [];
afterEach(async () => {
  vi.mocked(open).mockImplementation(nativeFs.open);
  vi.mocked(rename).mockImplementation(nativeFs.rename);
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
const setup = async () => {
  const root = await createFixtureDirectory('iori-ssh-fixture-');
  roots.push(root);
  const identityFile = join(root, 'fixture.key');
  const knownHostsFile = join(root, 'known_hosts');
  await writeFile(identityFile, 'synthetic-not-a-key', { mode: 0o600 });
  await writeFile(knownHostsFile, 'synthetic', { mode: 0o600 });
  return {
    root,
    options: {
      host: 'source.example.invalid',
      user: 'fixture',
      mainSha: 'a'.repeat(40),
      runId: '123',
      identityFile,
      knownHostsFile,
    },
  };
};
it.each([
  'none',
  'checksum',
  'truncated',
  'extra',
  'header',
  'inventory',
  'openabort',
  'writefailure',
  'syncfailure',
  'publishabort',
  'syncabort',
  'dirsyncfailure',
  'dirsyncabort',
])(
  'restores verified raw bytes to a fresh private root (fault: %s)',
  async (fault) => {
    const { options, root } = await setup();
    const payloads = new Map<string, Buffer>(
      APPLICATION_TABLE_ORDER.map((table) => [`table.${table}`, Buffer.alloc(0)]),
    );
    payloads.set('manifest.export', Buffer.from('{"complete":true}'));
    payloads.set('upload.33333333-3333-4333-8333-333333333333.png', Buffer.from([0, 10, 255, 1]));
    const files = [...payloads].map(([id, body]) => ({
      id,
      path: id.startsWith('table.')
        ? `export/${id.slice(6)}.ndjson`
        : id === 'manifest.export'
        ? 'export/export-manifest.json'
        : `uploads/${id.slice(7)}`,
      bytes: body.length,
      checksum: createHash('sha256').update(body).digest('hex'),
    }));
    const inventory = {
      schemaVersion: 1,
      complete: true,
      identity: { main_sha: options.mainSha, run_id: options.runId },
      totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
      files,
    };
    if (fault === 'inventory') files[0].path = '../../outside';
    const spawnProcess = (_program: string, args: string[]) => {
      const child = Object.assign(new EventEmitter(), {
        stdout: new PassThrough(),
        stderr: new PassThrough(),
        kill: () => {
          child.emit('close', 1);
          return true;
        },
      });
      queueMicrotask(() => {
        if (args.includes('inventory')) {
          child.stdout.end(JSON.stringify({ ok: true, state: { ...state, inventory } }) + '\n');
        } else {
          const file = files.find((file) => file.id === args.at(-1))!;
          let body = payloads.get(file.id)!;
          if (file.id.startsWith('upload.')) {
            if (fault === 'checksum') body = Buffer.from('bad!');
            if (fault === 'truncated') body = body.subarray(1);
            if (fault === 'extra') body = Buffer.concat([body, Buffer.from([0])]);
          }
          child.stdout.write(fault === 'header' ? 'x'.repeat(2049) + '\n' : JSON.stringify({ ok: true, file }) + '\n');
          for (const byte of body) child.stdout.write(Buffer.from([byte]));
          child.stdout.end();
        }
        child.emit('close', 0);
      });
      return child;
    };
    const abort = new AbortController();
    vi.mocked(open).mockImplementation(async (...args) => {
      const file = await nativeFs.open(...args);
      if (String(args[0]).includes('source-inventory.')) {
        if (fault === 'openabort') abort.abort();
        if (fault === 'writefailure') {
          file.writeFile = async () => {
            throw new Error('fixture write');
          };
        }
        if (fault === 'syncfailure') {
          file.sync = async () => {
            throw new Error('fixture sync');
          };
        }
        if (fault === 'syncabort') {
          file.sync = async () => {
            abort.abort();
          };
        }
      }
      if (String(args[0]) === join(root, 'restored')) {
        if (fault === 'dirsyncfailure') {
          file.sync = async () => {
            throw new Error('fixture directory sync');
          };
        }
        if (fault === 'dirsyncabort') {
          file.sync = async () => {
            abort.abort();
          };
        }
      }
      return file;
    });
    vi.mocked(rename).mockImplementation(async (...args) => {
      await nativeFs.rename(...args);
      if (fault === 'publishabort') abort.abort();
    });
    const adapter = await createSourceSshAdapter(options, { spawnProcess });
    const output = join(root, 'restored');
    if (fault !== 'none') {
      await expect(adapter.restore(output, abort.signal)).rejects.toThrow('Source restore failed.');
      await expect(readFile(join(output, 'source-inventory.json'))).rejects.toThrow();
    } else {
      const restored = await adapter.restore(output, abort.signal);
      expect(await readFile(join(restored.uploadDir, '33333333-3333-4333-8333-333333333333.png'))).toEqual(
        Buffer.from([0, 10, 255, 1]),
      );
      await expect(adapter.restore(output, abort.signal)).rejects.toThrow();
    }
  },
);
it('validates private inputs before remote work and uses only fixed reviewed SSH command tokens', async () => {
  const { options } = await setup();
  const calls: { program: string; args: string[] }[] = [];
  const spawnProcess = (program: string, args: string[]) => {
    calls.push({ program, args });
    const child = Object.assign(new EventEmitter(), {
      stdout: new PassThrough(),
      stderr: new PassThrough(),
      kill: () => true,
    });
    queueMicrotask(() => {
      child.stdout.end(JSON.stringify({ ok: true, state }) + '\n');
      child.stderr.end('PRIVATE SHOULD NOT ESCAPE');
      child.emit('close', 0);
    });
    return child;
  };
  const adapter = await createSourceSshAdapter(options, { spawnProcess });
  expect(await adapter.freeze()).toMatchObject({ ingress_frozen: true });
  expect(calls[0].program).toBe('ssh');
  expect(calls[0].args.slice(-6)).toEqual([
    'source.example.invalid',
    '"$HOME/.nvm/versions/node/v24.12.0/bin/node"',
    '"$HOME/monorepo/apps/iori/scripts/source-control.mjs"',
    'freeze',
    options.mainSha,
    '123',
  ]);
  expect(calls[0].args).toContain('StrictHostKeyChecking=yes');
  expect(calls[0].args).toContain(`UserKnownHostsFile=${options.knownHostsFile}`);
  await expect(createSourceSshAdapter({ ...options, host: 'x;touch /tmp/x' }, { spawnProcess })).rejects.toThrow();
  await expect(
    createSourceSshAdapter({ ...options, identityFile: join(options.identityFile, 'missing') }, { spawnProcess }),
  ).rejects.toThrow();
  await chmod(options.identityFile, 0o644);
  await expect(createSourceSshAdapter(options, { spawnProcess })).rejects.toThrow('Invalid source inputs.');
  expect(calls).toHaveLength(1);
});
