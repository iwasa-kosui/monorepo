import { afterEach, expect, it, vi } from 'vitest';

import { resumeSource } from '../resume-source.mjs';

const sha = 'a'.repeat(40);
const options = {
  host: 'secret-host.invalid',
  user: 'secret-user',
  mainSha: sha,
  runId: 'run_1',
  identityFile: '/fixture/secret-key',
  knownHostsFile: '/fixture/secret_known_hosts',
  recovery: 'destination_writes_reconciled',
};
const frozenState = {
  source_revision: sha,
  ingress_frozen: true,
  consumer_paused: true,
  queue_failed: false,
  identity: { main_sha: sha, run_id: 'run_1' },
  http_inflight: 0,
  queue_depth: 0,
  dequeue_work: 0,
  enqueue_work: 0,
  drained: false,
};
const openState = { ...frozenState, ingress_frozen: false, consumer_paused: false, identity: null };
const captureDiagnostics = () => {
  const writes: string[] = [];
  vi.spyOn(process.stderr, 'write').mockImplementation(
    ((chunk: string | Uint8Array) => {
      writes.push(String(chunk));
      return true;
    }) as typeof process.stderr.write,
  );
  return writes;
};
afterEach(() => {
  vi.restoreAllMocks();
});
const fixture = (statuses: unknown[], resume: () => Promise<unknown> = async () => openState) => {
  const calls: string[] = [];
  const queue = [...statuses];
  const sourceFactory = async () => ({
    status: async () => {
      calls.push('status');
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    resume: async (recovery: string) => {
      calls.push(`resume:${recovery}`);
      return resume();
    },
  });
  return { calls, sourceFactory: sourceFactory as never };
};
it.each(['destination_writes_not_enabled', 'destination_writes_reconciled'])(
  'checks the frozen state, sends resume with %s and verifies the unfrozen state',
  async (recovery) => {
    const { calls, sourceFactory } = fixture([frozenState, openState]);
    await resumeSource({ ...options, recovery }, { sourceFactory });
    expect(calls).toEqual(['status', `resume:${recovery}`, 'status']);
  },
);
it.each([
  ['ingress is not frozen', { ...frozenState, ingress_frozen: false }, 'source-not-frozen'],
  ['the consumer is not paused', { ...frozenState, consumer_paused: false }, 'source-not-frozen'],
  ['the service is not frozen at all', openState, 'source-not-frozen'],
  ['no identity is held', { ...frozenState, identity: null }, 'source-identity-mismatch'],
  [
    'the frozen main SHA differs',
    { ...frozenState, identity: { main_sha: 'b'.repeat(40), run_id: 'run_1' } },
    'source-identity-mismatch',
  ],
  [
    'the frozen run ID differs',
    { ...frozenState, identity: { main_sha: sha, run_id: 'run_2' } },
    'source-identity-mismatch',
  ],
  ['the queue has failed', { ...frozenState, queue_failed: true }, 'source-not-idle'],
  ['an HTTP request is in flight', { ...frozenState, http_inflight: 1 }, 'source-not-idle'],
  ['queue dequeue work is running', { ...frozenState, dequeue_work: 1 }, 'source-not-idle'],
  ['queue enqueue work is running', { ...frozenState, enqueue_work: 1 }, 'source-not-idle'],
])('does not send resume when %s', async (_label, state, reason) => {
  const writes = captureDiagnostics();
  const { calls, sourceFactory } = fixture([state]);
  await expect(resumeSource(options, { sourceFactory })).rejects.toThrow();
  expect(calls).toEqual(['status']);
  expect(writes.filter(line => line.startsWith('IORI_DIAG'))).toEqual([
    `IORI_DIAG stage=resume-precheck program=ssh exit=none signal=none reason=${reason}\n`,
  ]);
});
it('does not send resume when the precheck status itself fails', async () => {
  const writes = captureDiagnostics();
  const { calls, sourceFactory } = fixture([new Error('Source operation failed.')]);
  await expect(resumeSource(options, { sourceFactory })).rejects.toThrow('Source operation failed.');
  expect(calls).toEqual(['status']);
  expect(writes.filter(line => line.startsWith('IORI_DIAG'))).toEqual([
    'IORI_DIAG stage=resume-precheck program=ssh exit=none signal=none reason=source-operation-failed\n',
  ]);
});
it('reports source-not-idle without a retry when the source rejects resume while busy', async () => {
  const writes = captureDiagnostics();
  const { calls, sourceFactory } = fixture([frozenState, { ...frozenState, http_inflight: 1 }], async () => {
    throw new Error('Source operation failed.');
  });
  await expect(resumeSource(options, { sourceFactory })).rejects.toThrow('Source is not idle.');
  expect(calls).toEqual(['status', 'resume:destination_writes_reconciled', 'status']);
  expect(writes.filter(line => line.startsWith('IORI_DIAG'))).toEqual([
    'IORI_DIAG stage=resume program=ssh exit=none signal=none reason=source-not-idle\n',
  ]);
});
it.each([
  ['ingress is still frozen', { ...openState, ingress_frozen: true }],
  ['the consumer is still paused', { ...openState, consumer_paused: true }],
])('fails when %s after resume', async (_label, after) => {
  const writes = captureDiagnostics();
  const { calls, sourceFactory } = fixture([frozenState, after]);
  await expect(resumeSource(options, { sourceFactory })).rejects.toThrow('Source resume was not confirmed.');
  expect(calls).toEqual(['status', 'resume:destination_writes_reconciled', 'status']);
  expect(writes.filter(line => line.startsWith('IORI_DIAG'))).toEqual([
    'IORI_DIAG stage=resume-verify program=ssh exit=none signal=none reason=resume-not-confirmed\n',
  ]);
});
it('reports the resume stage and skips verification when the resume command fails on an idle source', async () => {
  const writes = captureDiagnostics();
  const { calls, sourceFactory } = fixture([frozenState, frozenState], async () => {
    throw new Error('Source operation failed.');
  });
  await expect(resumeSource(options, { sourceFactory })).rejects.toThrow('Source operation failed.');
  expect(calls).toEqual(['status', 'resume:destination_writes_reconciled', 'status']);
  expect(writes.filter(line => line.startsWith('IORI_DIAG'))).toEqual([
    'IORI_DIAG stage=resume program=ssh exit=none signal=none reason=source-operation-failed\n',
  ]);
});
it.each([undefined, '', 'destination_writes_reconciled ', 'other'])(
  'rejects recovery %j before opening any source connection',
  async (recovery) => {
    const writes = captureDiagnostics();
    const factory = vi.fn();
    await expect(resumeSource({ ...options, recovery: recovery as string }, { sourceFactory: factory })).rejects
      .toThrow(
        'Invalid source command.',
      );
    expect(factory).not.toHaveBeenCalled();
    expect(writes.filter(line => line.startsWith('IORI_DIAG'))).toEqual([
      'IORI_DIAG stage=inputs program=none exit=none signal=none reason=source-command-invalid\n',
    ]);
  },
);
it('retries a not-ready status in both status stages and prints no input values', async () => {
  const writes = captureDiagnostics();
  const notReady = Object.assign(new Error('Source control is not ready.'), { retryable: true });
  const { calls, sourceFactory } = fixture([notReady, frozenState, notReady, notReady, openState]);
  await resumeSource(options, { sourceFactory, statusRetryTimeoutMs: 200, statusRetryIntervalMs: 5 });
  expect(calls).toEqual([
    'status',
    'status',
    'resume:destination_writes_reconciled',
    'status',
    'status',
    'status',
  ]);
  expect(writes.join('')).not.toMatch(/secret|fixture/);
});
