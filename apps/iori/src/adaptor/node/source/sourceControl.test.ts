import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { SourceControl } from './sourceControl.ts';

const identity = { main_sha: 'a'.repeat(40), run_id: '12345' };
const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.map((dir) => rm(dir, { recursive: true, force: true })));
});
const setup = async (revision: string | undefined = identity.main_sha) => {
  const base = await mkdtemp('/private/tmp/iori-control-');
  dirs.push(base);
  let paused = true;
  let depth = 0;
  let enqueueWork = 0;
  const queue = {
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
    },
    depth: async () => depth,
    snapshot: () => ({ paused, enqueueWork, dequeueWork: 0, failed: false }),
  };
  const control = await SourceControl.open({ base, revision, queue });
  return {
    control,
    base,
    queue,
    setDepth: (n: number) => {
      depth = n;
    },
    setEnqueues: (n: number) => {
      enqueueWork = n;
    },
  };
};
const command = (op: string, extra = {}) => ({ op, ...identity, ...extra });
describe('source control', () => {
  it('holds the export lock through cancellation cleanup and forbids resume or unquiescent exports', async () => {
    const { base, queue } = await setup();
    const entered = Promise.withResolvers<void>();
    const cleanup = Promise.withResolvers<void>();
    const snapshot = {
      estimate: async () => ({}),
      inventory: async () => ({}),
      transfer: async () => {},
      export: async (_identity: unknown, signal: AbortSignal) => {
        entered.resolve();
        await cleanup.promise;
        signal.throwIfAborted();
        return {};
      },
    };
    const control = await SourceControl.open({ base, queue, revision: identity.main_sha, snapshot: snapshot as never });
    await expect(control.command(command('export'))).rejects.toThrow();
    await control.command(command('freeze'));
    await control.command(command('drain', { timeout_ms: 100 }));
    const abort = new AbortController();
    const exporting = control.command(command('export'), { signal: abort.signal });
    await Promise.race([entered.promise, exporting]);
    abort.abort();
    await expect(control.command(command('resume', { recovery: 'destination_writes_not_enabled' }))).rejects.toThrow(
      'control_busy',
    );
    cleanup.resolve();
    await expect(exporting).rejects.toThrow();
    expect((await control.command(command('status'))).ingress_frozen).toBe(true);
  });
  it.each([false, true])(
    'retains HTTP work until pending body cancellation settles (reject: %s)',
    async (rejectCancel) => {
      const { control } = await setup();
      const cleanup = Promise.withResolvers<void>();
      const cancellationStarted = Promise.withResolvers<void>();
      const response = await control.fetch(async () =>
        new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              cancellationStarted.resolve();
              return cleanup.promise;
            },
          }),
        )
      );
      const reader = response.body!.getReader();
      const pendingRead = reader.read();
      await control.command(command('freeze'));
      let cancellationSettled = false;
      const cancelling = reader.cancel().then(
        () => {
          cancellationSettled = true;
          return 'resolved';
        },
        () => {
          cancellationSettled = true;
          return 'rejected';
        },
      );
      await cancellationStarted.promise;
      expect(await pendingRead).toEqual({ done: true, value: undefined });
      expect(cancellationSettled).toBe(false);
      expect((await control.command(command('status'))).http_inflight).toBe(1);
      await expect(control.command(command('drain', { timeout_ms: 10 }))).rejects.toThrow('drain_timeout');
      if (rejectCancel) cleanup.reject(new Error('cleanup_failed'));
      else cleanup.resolve();
      expect(await cancelling).toBe(rejectCancel ? 'rejected' : 'resolved');
      expect((await control.command(command('status'))).http_inflight).toBe(0);
      expect((await control.command(command('drain', { timeout_ms: 100 }))).drained).toBe(true);
    },
  );
  it('bounds a drain even if the database depth query never settles', async () => {
    const { control, queue } = await setup();
    await control.command(command('freeze'));
    queue.depth = () => new Promise<number>(() => {});
    await expect(control.command(command('drain', { timeout_ms: 10 }))).rejects.toThrow('drain_timeout');
    expect(queue.snapshot().paused).toBe(true);
  });
  it('serializes status and resume against an active drain', async () => {
    const { control, setDepth } = await setup();
    await control.command(command('freeze'));
    setDepth(1);
    const draining = control.command(command('drain', { timeout_ms: 50 }));
    await expect(control.command(command('status'))).rejects.toThrow('control_busy');
    await expect(control.command(command('resume', { recovery: 'destination_writes_not_enabled' }))).rejects.toThrow(
      'control_busy',
    );
    await expect(draining).rejects.toThrow('drain_timeout');
  });
  it('waits for handler promises during shutdown even after the caller disconnects', async () => {
    const { control } = await setup();
    const pending = Promise.withResolvers<Response>();
    const fetching = control.fetch(() => pending.promise);
    let stopped = false;
    const stopping = control.stop().then(() => {
      stopped = true;
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(stopped).toBe(false);
    expect((await control.fetch(async () => new Response(null))).status).toBe(503);
    pending.resolve(new Response(null));
    await fetching;
    await stopping;
  });
  it('persists freeze, rejects all new HTTP, and waits for an admitted handler and body cancellation', async () => {
    const { control, base } = await setup();
    const pending = Promise.withResolvers<Response>();
    const responsePromise = control.fetch(() => pending.promise);
    await control.command(command('freeze'));
    expect(JSON.parse(await readFile(join(base, 'freeze.json'), 'utf8'))).toEqual(identity);
    expect(
      (await control.fetch(() => {
        throw new Error('admitted');
      })).status,
    ).toBe(503);
    await expect(control.command(command('drain', { timeout_ms: 10 }))).rejects.toThrow('drain_timeout');
    pending.resolve(
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new Uint8Array([1]));
          },
        }),
      ),
    );
    const response = await responsePromise;
    expect((await control.command(command('status'))).http_inflight).toBe(1);
    await response.body!.cancel();
    const drained = await control.command(command('drain', { timeout_ms: 100 }));
    expect(drained).toMatchObject({
      ingress_frozen: true,
      http_inflight: 0,
      queue_depth: 0,
      consumer_paused: true,
      drained: true,
    });
  });
  it('does not release request accounting on request abort before fetch finishes', async () => {
    const { control } = await setup();
    const pending = Promise.withResolvers<Response>();
    const request = control.fetch(() => pending.promise);
    await control.command(command('freeze'));
    expect((await control.command(command('status'))).http_inflight).toBe(1);
    pending.reject(new Error('fetch failed'));
    await expect(request).rejects.toThrow();
    expect((await control.command(command('status'))).http_inflight).toBe(0);
  });
  it('delayed persisted work and active enqueues cannot produce drained evidence', async () => {
    const { control, setDepth, setEnqueues } = await setup();
    await control.command(command('freeze'));
    setDepth(1);
    await expect(control.command(command('drain', { timeout_ms: 10 }))).rejects.toThrow('drain_timeout');
    setDepth(0);
    setEnqueues(1);
    await expect(control.command(command('drain', { timeout_ms: 10 }))).rejects.toThrow('drain_timeout');
  });
  it('restart retains admission freeze and paused consumer but never old drained evidence', async () => {
    const { control, base, queue } = await setup();
    await control.command(command('freeze'));
    await control.command(command('drain', { timeout_ms: 100 }));
    const restarted = await SourceControl.open({ base, queue, revision: identity.main_sha });
    expect(await restarted.command(command('status'))).toMatchObject({
      ingress_frozen: true,
      consumer_paused: true,
      drained: false,
    });
  });
  it('rejects foreign identity, wrong revision, missing revision, unknown input and unacknowledged resume', async () => {
    const { control } = await setup();
    await control.command(command('freeze'));
    for (
      const input of [
        command('freeze', { run_id: 'other' }),
        command('status', { main_sha: 'b'.repeat(40) }),
        command('export'),
        command('resume'),
        command('status', { path: '/tmp' }),
      ]
    ) {
      await expect(control.command(input)).rejects.toThrow();
    }
    const missing = await setup(undefined); // default arguments require explicit missing instance below
    const noRevision = await SourceControl.open({ base: missing.base, queue: missing.queue });
    await expect(noRevision.command(command('freeze'))).rejects.toThrow('revision_unavailable');
  });
  it('requires idle explicit recovery acknowledgment before removing marker and reopening', async () => {
    const { control, base, setEnqueues } = await setup();
    await control.command(command('freeze'));
    setEnqueues(1);
    await expect(control.command(command('resume', { recovery: 'destination_writes_not_enabled' }))).rejects.toThrow();
    setEnqueues(0);
    await control.command(command('resume', { recovery: 'destination_writes_not_enabled' }));
    await expect(readFile(join(base, 'freeze.json'))).rejects.toThrow();
    expect((await control.fetch(async () => new Response(null))).status).toBe(200);
  });
  it('malformed persisted state fails closed', async () => {
    const { base, queue } = await setup();
    await writeFile(join(base, 'freeze.json'), '{}', { mode: 0o600 });
    const control = await SourceControl.open({ base, queue, revision: identity.main_sha });
    expect((await control.fetch(async () => new Response(null))).status).toBe(503);
    await expect(control.command(command('resume', { recovery: 'destination_writes_not_enabled' }))).rejects.toThrow();
  });
  it('pending freeze persistence fails closed after restart', async () => {
    const { base, queue } = await setup();
    await writeFile(join(base, 'freeze.pending'), JSON.stringify(identity), { mode: 0o600 });
    const control = await SourceControl.open({ base, queue, revision: identity.main_sha });
    expect((await control.fetch(async () => new Response(null))).status).toBe(503);
    await expect(control.command(command('freeze'))).rejects.toThrow('invalid_freeze_state');
  });
});
