import { createHash } from 'node:crypto';
import { rm } from 'node:fs/promises';
import { Readable, Writable } from 'node:stream';
import { afterEach, expect, it } from 'vitest';

import { createFixtureDirectory } from '../../../../scripts/__tests__/fixtureTemp.ts';
import { requestSourceControl } from '../../../../scripts/source-control-client.mjs';
import { listenControlSocket } from './controlSocket.ts';
import { SourceControl } from './sourceControl.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
const identity = { main_sha: 'a'.repeat(40), run_id: 'streaming' };
it('streams binary bytes with backpressure while resume remains excluded', async () => {
  const base = await createFixtureDirectory('iori-binary-', true);
  roots.push(base);
  const blocked = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const chunk = Buffer.alloc(65536, 10);
  const body = Buffer.alloc(65536 * 128, 10);
  let produced = 0;
  const file = {
    id: 'table.users',
    path: 'export/users.ndjson',
    bytes: body.length,
    checksum: createHash('sha256').update(body).digest('hex'),
  };
  const queue = {
    pause: () => {},
    resume: () => {},
    depth: async () => 0,
    snapshot: () => ({ paused: true, enqueueWork: 0, dequeueWork: 0, failed: false }),
  };
  const snapshot = {
    transfer: async (_identity: unknown, _id: string, send: (file: unknown, stream: Readable) => Promise<void>) => {
      await send(
        file,
        Readable.from((async function*() {
          for (let index = 0; index < 128; index++) {
            produced++;
            yield chunk;
          }
        })()),
      );
    },
  };
  const control = await SourceControl.open({ base, revision: identity.main_sha, queue, snapshot: snapshot as never });
  await control.command({ op: 'freeze', ...identity });
  await control.command({ op: 'drain', ...identity, timeout_ms: 100 });
  const server = await listenControlSocket(control);
  const chunks: Buffer[] = [];
  const output = new Writable({
    highWaterMark: 1,
    write(chunk, _encoding, done) {
      chunks.push(chunk);
      blocked.resolve();
      release.promise.then(() => done());
    },
  });
  const requesting = requestSourceControl({
    base,
    args: ['transfer', identity.main_sha, identity.run_id, file.id],
    output,
  });
  try {
    await blocked.promise;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(produced).toBeLessThan(128);
    await expect(control.command({ op: 'resume', ...identity, recovery: 'destination_writes_not_enabled' })).rejects
      .toThrow('control_busy');
    release.resolve();
    await requesting;
    const bytes = Buffer.concat(chunks);
    const newline = bytes.indexOf(10);
    expect(JSON.parse(bytes.subarray(0, newline).toString())).toEqual({ ok: true, file });
    expect(bytes.subarray(newline + 1).equals(body)).toBe(true);
  } finally {
    release.resolve();
    await requesting;
    await server.close();
  }
});
it('keeps export exclusive after a real client disconnect until source cleanup settles', async () => {
  const base = await createFixtureDirectory('iori-disconnect-', true);
  roots.push(base);
  const entered = Promise.withResolvers<void>();
  const cancelled = Promise.withResolvers<void>();
  const cleanup = Promise.withResolvers<void>();
  const queue = {
    pause: () => {},
    resume: () => {},
    depth: async () => 0,
    snapshot: () => ({ paused: true, enqueueWork: 0, dequeueWork: 0, failed: false }),
  };
  const snapshot = {
    export: async (_identity: unknown, signal: AbortSignal) => {
      signal.addEventListener('abort', () => cancelled.resolve(), { once: true });
      entered.resolve();
      await cleanup.promise;
      signal.throwIfAborted();
    },
  };
  const control = await SourceControl.open({ base, revision: identity.main_sha, queue, snapshot: snapshot as never });
  await control.command({ op: 'freeze', ...identity });
  await control.command({ op: 'drain', ...identity, timeout_ms: 100 });
  const server = await listenControlSocket(control);
  const abort = new AbortController();
  const output = new Writable({
    write(_chunk, _encoding, done) {
      done();
    },
  });
  const requesting = requestSourceControl({
    base,
    args: ['export', identity.main_sha, identity.run_id],
    output,
    signal: abort.signal,
  });
  const observed = requesting.catch(() => {});
  try {
    await entered.promise;
    abort.abort();
    await cancelled.promise;
    await expect(control.command({ op: 'resume', ...identity, recovery: 'destination_writes_not_enabled' })).rejects
      .toThrow('control_busy');
    cleanup.resolve();
    await observed;
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        expect((await control.command({ op: 'status', ...identity })).ingress_frozen).toBe(true);
        break;
      } catch {
        if (attempt === 99) throw new Error('lock not released');
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
    }
  } finally {
    cleanup.resolve();
    abort.abort();
    await observed;
    await server.close();
  }
});
