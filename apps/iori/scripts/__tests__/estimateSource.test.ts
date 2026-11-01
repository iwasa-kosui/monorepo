import { execFile } from 'node:child_process';
import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, it, vi } from 'vitest';

import { estimateFailureLine, estimateFromEnvironment, estimateSource } from '../estimate-source.mjs';
import { SOURCE_LIMITS, SOURCE_REJECTION_DETAILS, SOURCE_SSH_REASONS } from '../source-transfer-protocol.mjs';
import { createFixtureDirectory } from './fixtureTemp.js';

const estimate = {
  source_revision: 'a'.repeat(40),
  table_bytes: 10000,
  upload_bytes: 8,
  rows: 5,
  upload_count: 3,
  upload_duplicate_count: 1,
  upload_missing_count: 0,
  upload_owner_count: 0,
  upload_not_regular_count: 0,
  upload_too_large_count: 0,
  upload_access_count: 0,
  upload_other_count: 0,
  upload_ext_webp_count: 1,
  upload_ext_png_count: 1,
  upload_ext_jpeg_count: 1,
  upload_ext_gif_count: 0,
  upload_failed_ext_webp_count: 0,
  upload_failed_ext_png_count: 0,
  upload_failed_ext_jpeg_count: 0,
  upload_failed_ext_gif_count: 0,
  article_count: 2,
  source_free_bytes: 10_000_000_000,
  source_required_bytes: 64_000_000,
  runner_required_bytes: 128_000_000,
  source_sufficient: true,
  limits: SOURCE_LIMITS,
};
const sourceWith = (override: Partial<typeof estimate> = {}) => {
  const others = {
    freeze: vi.fn(),
    status: vi.fn(),
    drain: vi.fn(),
    resume: vi.fn(),
    export: vi.fn(),
    restore: vi.fn(),
  };
  return { source: { estimate: vi.fn(async () => ({ ...estimate, ...override })), ...others }, others };
};
const AVAILABLE = 10_000_000_000;
const upload_counts =
  'upload_missing_count=0 upload_owner_count=0 upload_not_regular_count=0 upload_too_large_count=0 upload_access_count=0 upload_other_count=0 upload_ext_webp_count=1 upload_ext_png_count=1 upload_ext_jpeg_count=1 upload_ext_gif_count=0 upload_failed_ext_webp_count=0 upload_failed_ext_png_count=0 upload_failed_ext_jpeg_count=0 upload_failed_ext_gif_count=0';

it('reports a sufficient sample and capacity in one fixed line without any byte counts', async () => {
  const { source } = sourceWith();
  const line = await estimateSource({ source, availableBytes: AVAILABLE });
  expect(line).toBe(
    `IORI_ESTIMATE rows=5 upload_count=3 upload_duplicate_count=1 ${upload_counts} article_count=2 sample=ok capacity=ok`,
  );
  expect(line).not.toContain('\n');
  expect(line).not.toMatch(/bytes|10000|64000000|128000000/);
});
it.each(['rows', 'upload_count', 'article_count'] as const)(
  'marks the sample insufficient when %s is zero',
  async field => {
    const { source } = sourceWith({ [field]: 0 });
    const line = await estimateSource({ source, availableBytes: AVAILABLE });
    expect(line).toContain('sample=insufficient');
    expect(line).toContain('capacity=ok');
    expect(line).toContain(`${field}=0`);
  },
);
it('marks capacity insufficient when the source reports insufficient space', async () => {
  const { source } = sourceWith({ source_free_bytes: 1, source_sufficient: false });
  const line = await estimateSource({ source, availableBytes: AVAILABLE });
  expect(line).toMatch(/sample=ok capacity=insufficient$/);
});
it('marks capacity insufficient when the D1 capacity plan is exceeded', async () => {
  const { source } = sourceWith({ table_bytes: 3_000_000_000 });
  const line = await estimateSource({ source, availableBytes: 100_000_000_000 });
  expect(line).toMatch(/sample=ok capacity=insufficient$/);
});
it('marks capacity insufficient when the runner has too little free space, for number and bigint', async () => {
  for (const availableBytes of [1, 1n]) {
    const { source } = sourceWith();
    expect(await estimateSource({ source, availableBytes })).toMatch(/sample=ok capacity=insufficient$/);
  }
  const { source } = sourceWith();
  expect(await estimateSource({ source, availableBytes: 10_000_000_000n })).toMatch(/capacity=ok$/);
});
it('judges both fields independently', async () => {
  const { source } = sourceWith({ rows: 0, table_bytes: 3_000_000_000 });
  expect(await estimateSource({ source, availableBytes: 100_000_000_000 })).toBe(
    `IORI_ESTIMATE rows=0 upload_count=3 upload_duplicate_count=1 ${upload_counts} article_count=2 sample=insufficient capacity=insufficient`,
  );
});
it('calls only the read-only estimate operation, once', async () => {
  const { source, others } = sourceWith();
  await estimateSource({ source, availableBytes: AVAILABLE });
  expect(source.estimate).toHaveBeenCalledTimes(1);
  for (const operation of Object.values(others)) expect(operation).not.toHaveBeenCalled();
});
it('rejects a malformed estimate instead of printing a line', async () => {
  const { source } = sourceWith({ source_sufficient: false });
  await expect(estimateSource({ source, availableBytes: AVAILABLE })).rejects.toThrow();
});
it.each(
  [
    ['upload_missing_count', 'estimate-upload-missing'],
    ['upload_owner_count', 'estimate-upload-owner'],
    ['upload_not_regular_count', 'estimate-upload-not-regular'],
    ['upload_too_large_count', 'estimate-upload-too-large'],
    ['upload_access_count', 'estimate-upload-access'],
    ['upload_other_count', 'estimate-upload-other'],
  ] as const,
)('fails with the reason of %s after building the estimate line', async (field, reason) => {
  const { source } = sourceWith({ [field]: 2, upload_failed_ext_png_count: 2 });
  const failure = await estimateSource({ source, availableBytes: AVAILABLE }).catch(error => error);
  expect(failure.diagnostic).toEqual({ reason });
  expect(failure.estimateLine).toContain(`${field}=2 `);
  expect(failure.estimateLine).toMatch(/^IORI_ESTIMATE .* sample=ok capacity=ok$/);
  expect(estimateFailureLine(failure)).toBe(
    `IORI_DIAG stage=estimate-source program=ssh exit=none signal=none reason=${reason}`,
  );
});
it('picks the first reason in the fixed order when several causes are counted', async () => {
  const { source } = sourceWith({ upload_other_count: 1, upload_access_count: 1, upload_too_large_count: 1 });
  const failure = await estimateSource({ source, availableBytes: AVAILABLE }).catch(error => error);
  expect(failure.diagnostic).toEqual({ reason: 'estimate-upload-too-large' });
  const both = sourceWith({ upload_owner_count: 3, upload_missing_count: 1, upload_not_regular_count: 1 });
  const first = await estimateSource({ source: both.source, availableBytes: AVAILABLE }).catch(error => error);
  expect(first.diagnostic).toEqual({ reason: 'estimate-upload-missing' });
});
it('propagates a source failure without printing a line', async () => {
  const source = {
    estimate: async () => {
      throw new Error('Source operation failed.');
    },
  };
  await expect(estimateSource({ source, availableBytes: AVAILABLE })).rejects.toThrow('Source operation failed.');
});

const cliEnvironment = (root: string, overrides: Record<string, string | undefined> = {}) => ({
  IORI_MIGRATION_ROOT: root,
  IORI_SOURCE_SSH_HOST: 'source.example.test',
  IORI_SOURCE_SSH_USER: 'deploy',
  IORI_SOURCE_SSH_IDENTITY_FILE: '/keys/id',
  IORI_SOURCE_SSH_KNOWN_HOSTS_FILE: '/keys/known_hosts',
  MAIN_SHA: 'a'.repeat(40),
  GITHUB_RUN_ID: '12345',
  ...overrides,
});
const withRoot = async (run: (root: string) => Promise<void>) => {
  const root = await createFixtureDirectory('iori-estimate-cli-');
  try {
    await chmod(root, 0o700);
    await run(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
};
it('builds the source adapter from the environment with an estimate_ run ID and reports the line', async () => {
  await withRoot(async root => {
    const { source } = sourceWith();
    const createSource = vi.fn(async (_options: unknown) => source);
    const availableBytes = vi.fn(async (_root: string) => AVAILABLE);
    const line = await estimateFromEnvironment(cliEnvironment(root), undefined, {
      createSource: createSource as never,
      availableBytes,
    });
    expect(createSource).toHaveBeenCalledWith({
      host: 'source.example.test',
      user: 'deploy',
      identityFile: '/keys/id',
      knownHostsFile: '/keys/known_hosts',
      mainSha: 'a'.repeat(40),
      runId: 'estimate_12345',
    });
    expect(availableBytes).toHaveBeenCalledWith(root);
    expect(line).toBe(
      `IORI_ESTIMATE rows=5 upload_count=3 upload_duplicate_count=1 ${upload_counts} article_count=2 sample=ok capacity=ok`,
    );
  });
});
it.each([
  'IORI_MIGRATION_ROOT',
  'IORI_SOURCE_SSH_HOST',
  'IORI_SOURCE_SSH_USER',
  'IORI_SOURCE_SSH_IDENTITY_FILE',
  'IORI_SOURCE_SSH_KNOWN_HOSTS_FILE',
  'MAIN_SHA',
  'GITHUB_RUN_ID',
])('refuses to estimate when %s is missing or empty', async key => {
  await withRoot(async root => {
    for (const value of [undefined, '']) {
      const createSource = vi.fn(async (_options: unknown) => sourceWith().source);
      await expect(
        estimateFromEnvironment(cliEnvironment(root, { [key]: value }), undefined, {
          createSource: createSource as never,
        }),
      ).rejects.toThrow('Estimate configuration is required.');
      expect(createSource).not.toHaveBeenCalled();
    }
  });
});
const publicDiagnostic =
  /^IORI_DIAG stage=[a-z-]{1,24} program=(?:ssh|rsync|node|none) exit=(?:\d{1,3}|none) signal=(?:[A-Z0-9]{1,12}|none) reason=[a-z0-9-]{1,40}$/;
it.each([...SOURCE_SSH_REASONS, ...SOURCE_REJECTION_DETAILS])(
  'writes the reason %s as one line the public log accepts',
  reason => {
    const line = estimateFailureLine(Object.assign(new Error('raw /home/secret'), { diagnostic: { reason, exit: 1 } }));
    expect(line).toBe(`IORI_DIAG stage=estimate-source program=ssh exit=1 signal=none reason=${reason}`);
    expect(line).toMatch(publicDiagnostic);
  },
);
it('writes the exit code and signal only within their public ranges', () => {
  const diagnostic = (exit: unknown, signal: unknown) =>
    estimateFailureLine({ diagnostic: { reason: 'aborted', exit, signal } });
  expect(diagnostic(undefined, 'SIGTERM')).toBe(
    'IORI_DIAG stage=estimate-source program=ssh exit=none signal=SIGTERM reason=aborted',
  );
  expect(diagnostic(255, undefined)).toContain('exit=255 signal=none');
  expect(diagnostic(256, 'sigterm')).toContain('exit=none signal=none');
  expect(diagnostic(-1, 'SIGTERM extra')).toContain('exit=none signal=none');
});
it.each([
  new Error('Source operation failed.'),
  { diagnostic: { reason: 'relation "articles" does not exist', exit: 1 } },
  { diagnostic: { reason: 'source.example.test', exit: 1 } },
  { diagnostic: { reason: 'unclassified', exit: 1 } },
  undefined,
])('writes an unclassified line for a failure without a known reason', error => {
  const line = estimateFailureLine(error);
  expect(line).toBe('IORI_DIAG stage=estimate-source program=none exit=none signal=none reason=unclassified');
  expect(line).toMatch(publicDiagnostic);
});
const runCli = (env: Record<string, string>) =>
  new Promise<{ code: number | null; stderr: string; stdout: string }>(resolve => {
    execFile(
      process.execPath,
      [fileURLToPath(new URL('../estimate-source.mjs', import.meta.url))],
      { env },
      (error, stdout, stderr) =>
        resolve({ code: error ? (typeof error.code === 'number' ? error.code : null) : 0, stdout, stderr }),
    );
  });
it('prints exactly one diagnostic line and then fails when the source rejects the estimate', async () => {
  await withRoot(async root => {
    const bin = join(root, 'bin');
    await mkdir(bin);
    await writeFile(
      join(bin, 'ssh'),
      '#!/bin/sh\nprintf \'%s\\n\' \'{"ok":false,"error":"control_rejected","detail":"estimate-query"}\'\n'
        + 'echo "PRIVATE relation articles at source.example.test" >&2\nexit 1\n',
      { mode: 0o755 },
    );
    await writeFile(join(root, 'id'), 'synthetic', { mode: 0o600 });
    await writeFile(join(root, 'known_hosts'), 'synthetic', { mode: 0o600 });
    const result = await runCli({
      PATH: `${bin}:/usr/bin:/bin`,
      ...cliEnvironment(root, {
        IORI_SOURCE_SSH_IDENTITY_FILE: join(root, 'id'),
        IORI_SOURCE_SSH_KNOWN_HOSTS_FILE: join(root, 'known_hosts'),
      }) as Record<string, string>,
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr.split('\n').filter(line => line.startsWith('IORI_DIAG'))).toEqual([
      'IORI_DIAG stage=estimate-source program=ssh exit=1 signal=none reason=estimate-query',
    ]);
    expect(result.stderr).toBe(
      'IORI_DIAG stage=estimate-source program=ssh exit=1 signal=none reason=estimate-query\nSource estimate failed.\n',
    );
  });
});
it('prints the estimate line before the diagnostic line and fails when uploads could not be opened', async () => {
  await withRoot(async root => {
    const bin = join(root, 'bin');
    await mkdir(bin);
    const { source_revision, ...fields } = estimate;
    const response = {
      ok: true,
      state: {
        source_revision,
        identity: null,
        ingress_frozen: false,
        http_inflight: 0,
        queue_depth: 0,
        dequeue_work: 0,
        enqueue_work: 0,
        consumer_paused: false,
        queue_failed: false,
        drained: false,
        estimate: {
          ...fields,
          upload_owner_count: 2,
          upload_access_count: 1,
          upload_failed_ext_png_count: 3,
        },
      },
    };
    await writeFile(join(root, 'response.json'), `${JSON.stringify(response)}\n`);
    await writeFile(join(bin, 'ssh'), `#!/bin/sh\ncat '${join(root, 'response.json')}'\n`, { mode: 0o755 });
    await writeFile(join(root, 'id'), 'synthetic', { mode: 0o600 });
    await writeFile(join(root, 'known_hosts'), 'synthetic', { mode: 0o600 });
    const result = await runCli({
      PATH: `${bin}:/usr/bin:/bin`,
      ...cliEnvironment(root, {
        IORI_SOURCE_SSH_IDENTITY_FILE: join(root, 'id'),
        IORI_SOURCE_SSH_KNOWN_HOSTS_FILE: join(root, 'known_hosts'),
      }) as Record<string, string>,
    });
    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    const lines = result.stderr.split('\n');
    expect(lines[0]).toMatch(/^IORI_ESTIMATE rows=5 upload_count=3 .* upload_owner_count=2 .* upload_access_count=1 /);
    expect(lines[0]).toContain('upload_failed_ext_png_count=3');
    expect(lines.slice(1)).toEqual([
      'IORI_DIAG stage=estimate-source program=ssh exit=none signal=none reason=estimate-upload-owner',
      'Source estimate failed.',
      '',
    ]);
  });
});
it('prints one unclassified diagnostic line when the configuration is missing', async () => {
  const result = await runCli({ PATH: '/usr/bin:/bin' });
  expect(result.code).toBe(1);
  expect(result.stderr).toBe(
    'IORI_DIAG stage=estimate-source program=none exit=none signal=none reason=unclassified\nSource estimate failed.\n',
  );
});
it('refuses a migration root that is not private or not absolute before creating the source', async () => {
  await withRoot(async root => {
    await chmod(root, 0o755);
    const createSource = vi.fn(async (_options: unknown) => sourceWith().source);
    const deps = { createSource: createSource as never };
    await expect(estimateFromEnvironment(cliEnvironment(root), undefined, deps)).rejects.toThrow(
      'Invalid migration root.',
    );
    await expect(estimateFromEnvironment(cliEnvironment('relative/root'), undefined, deps)).rejects.toThrow(
      'Invalid migration root.',
    );
    expect(createSource).not.toHaveBeenCalled();
  });
});
