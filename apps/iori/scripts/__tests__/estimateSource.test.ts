import { expect, it, vi } from 'vitest';

import { estimateSource } from '../estimate-source.mjs';
import { SOURCE_LIMITS } from '../source-transfer-protocol.mjs';

const estimate = {
  source_revision: 'a'.repeat(40),
  table_bytes: 10000,
  upload_bytes: 8,
  rows: 5,
  upload_count: 3,
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

it('reports a sufficient sample and capacity in one fixed line without any byte counts', async () => {
  const { source } = sourceWith();
  const line = await estimateSource({ source, availableBytes: AVAILABLE });
  expect(line).toBe('IORI_ESTIMATE rows=5 upload_count=3 article_count=2 sample=ok capacity=ok');
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
    'IORI_ESTIMATE rows=0 upload_count=3 article_count=2 sample=insufficient capacity=insufficient',
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
it('propagates a source failure without printing a line', async () => {
  const source = {
    estimate: async () => {
      throw new Error('Source operation failed.');
    },
  };
  await expect(estimateSource({ source, availableBytes: AVAILABLE })).rejects.toThrow('Source operation failed.');
});
