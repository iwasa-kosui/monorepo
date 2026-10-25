import { expectedTargetFixture } from './migrationTargetFixture.js';
import { createHash } from 'node:crypto';
import { mkdtemp, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';

import { canonicalRowSummary } from '../canonical-row-sort.mjs';
import {
  createCloudflareImportTransport,
  createCloudflareImportTransportFromEnvironment,
} from '../cloudflare-import-provider.mjs';
// @ts-expect-error The mapping module is executed directly as ESM.
import { canonicalD1RowString } from '../data-migration-mapping.mjs';
import { createCloudflareImportProvider } from '../verify-cloudflare-import.mjs';
const bindings = {
  worker_name: 'iori',
  d1_database_id: '11111111-1111-4111-8111-111111111111',
  r2_bucket_name: 'iori-uploads',
  kv_namespace_id: 'a'.repeat(32),
  queue_name: 'iori-queue',
};
const config = {
  bindings,
  expectedWorkerName: 'iori',
  accountId: 'a'.repeat(32),
  apiToken: 'fixture',
  accessKeyId: 'fixture',
  secretAccessKey: 'fixture',
  pageSize: 2,
  sortChunkBytes: 100,
};
const response = (results: unknown[]) => Response.json({ success: true, result: [{ success: true, results }] });
const rows = [
  { __iori_rowid: -4, id: 'z', createdAt: 1700000000000, metadata: '{"z":null,"a":{"z":1,"a":2}}', content: null },
  { __iori_rowid: 0, id: '😀', createdAt: 1700000000000, metadata: null, content: '零' },
  { __iori_rowid: 3, id: 'a', createdAt: 1700000000000, metadata: '{}', content: 'ä' },
  { __iori_rowid: 7, id: '𐀀', createdAt: 1700000000000, metadata: '{}', content: '\uE000' },
];
const sourceFetch = (data = rows) => async (_url: unknown, init?: RequestInit) => {
  const { sql, params } = JSON.parse(String(init?.body));
  expect(params.every((value: unknown) => typeof value === 'string')).toBe(true);
  expect(init?.redirect).toBe('error');
  expect(init?.headers).toMatchObject({ Authorization: 'Bearer fixture' });
  if (sql.includes('COUNT(*)')) return response([{ count: data.length }]);
  const selected = sql.includes('WHERE') ? data.filter(row => row.__iori_rowid > params[0]) : data;
  return response(selected.slice(0, 2));
};
describe('live Cloudflare import provider', () => {
  it('hashes observed canonical rows across pages and multiple disk sort chunks including negative and zero rowids', async () => {
    const provider = createCloudflareImportTransport({ ...config, fetchImpl: sourceFetch() });
    const canonical = rows.map(({ __iori_rowid: _, ...row }) => canonicalD1RowString('posts', row)).sort();
    expect(await provider.getTableSummaries(['posts'])).toEqual({
      posts: { count: 4, checksum: createHash('sha256').update(canonical.join('\n') + '\n').digest('hex') },
    });
  });
  it('hashes an empty observed table', async () => {
    const provider = createCloudflareImportTransport({ ...config, fetchImpl: sourceFetch([]) });
    expect(await provider.getTableSummaries(['posts'])).toEqual({
      posts: { count: 0, checksum: createHash('sha256').digest('hex') },
    });
  });
  it.each([NaN, Number.MAX_SAFE_INTEGER + 1, '1', null])('rejects invalid cursor %s', async (cursor) => {
    const provider = createCloudflareImportTransport({
      ...config,
      fetchImpl: async (_url: unknown, init?: RequestInit) =>
        String(init?.body).includes('COUNT(*)')
          ? response([{ count: 1 }])
          : response([{ __iori_rowid: cursor, id: 'a' }]),
    });
    await expect(provider.getTableSummaries(['posts'])).rejects.toThrow('Cloudflare import read failed.');
  });
  it.each(['repeat', 'truncated', 'api', 'statement', 'shape', 'oversized'])('rejects %s reads', async (mode) => {
    const provider = createCloudflareImportTransport({
      ...config,
      fetchImpl: async (_url: unknown, init?: RequestInit) => {
        if (mode === 'api') return Response.json({ success: false, errors: ['secret'] });
        if (mode === 'statement') return Response.json({ success: true, result: [{ success: false, results: [] }] });
        if (mode === 'shape') return response([{}, {}]);
        if (mode === 'oversized') return new Response('x'.repeat(9 * 1024 * 1024));
        if (String(init?.body).includes('COUNT(*)')) return response([{ count: 4 }]);
        return response(mode === 'repeat' ? [rows[0], rows[0]] : [rows[0]]);
      },
    });
    await expect(provider.getTableSummaries(['posts'])).rejects.toThrow('Cloudflare import read failed.');
  });
  it('rejects unsupported identifiers and mismatched bindings before network', async () => {
    expect(() => createCloudflareImportTransport({ ...config, expectedWorkerName: 'other' })).toThrow();
    await expect(createCloudflareImportTransport(config).getTableSummaries(['posts; DELETE'])).rejects.toThrow();
    await expect(createCloudflareImportTransportFromEnvironment({ IORI_IMPORT_RUNNER: '/bundle/evil.mjs' })).rejects
      .toThrow();
  });
  it('streams application objects with HTTP metadata and opaque bounded listing', async () => {
    const provider = createCloudflareImportTransport({
      ...config,
      fetchImpl: sourceFetch([]),
      createClient: (options) => {
        expect(options.credentials).toEqual({ accessKeyId: 'fixture', secretAccessKey: 'fixture' });
        return {
          send: async (command) => {
            expect((command as { input: Record<string, unknown> }).input.Bucket).toBe('iori-uploads');
            if ((command as object).constructor.name === 'GetObjectCommand') {
              return { Body: Readable.from([Buffer.from('ab'), Buffer.from('cd')]), ContentType: 'image/png' };
            }
            expect((command as { input: Record<string, unknown> }).input.MaxKeys).toBe(1000);
            return { Contents: [], IsTruncated: false };
          },
        };
      },
    });
    const actual = await createCloudflareImportProvider(provider).loadActual({
      tables: {},
      r2Objects: [{ key: 'post-images/a' }],
    });
    expect(actual.r2Objects?.[0]).toEqual({
      key: 'post-images/a',
      contentType: 'image/png',
      checksum: createHash('sha256').update('abcd').digest('hex'),
    });
  });
  it.each(['NoSuchKey', 'AccessDenied'])('distinguishes %s from missing data', async (name) => {
    const provider = createCloudflareImportTransport({
      ...config,
      createClient: () => ({
        send: async () => {
          throw { name };
        },
      }),
    });
    if (name === 'NoSuchKey') expect(await provider.getObject('a')).toBeNull();
    else await expect(provider.getObject('a')).rejects.toThrow('Cloudflare import read failed.');
  });
  it.each([
    { IsTruncated: true },
    { Contents: [{ Key: 2 }], IsTruncated: false },
    { IsTruncated: 'false' },
    { Contents: null, IsTruncated: false },
    { IsTruncated: false, NextContinuationToken: 4 },
    { Contents: [], IsTruncated: false, KeyCount: 1 },
  ])(
    'rejects malformed listing',
    async (value) => {
      const provider = createCloudflareImportTransport({
        ...config,
        createClient: () => ({ send: async () => value }),
      });
      await expect(provider.listObjects('og/')).rejects.toThrow();
    },
  );
  it('loads private bindings with explicit environment credentials and rejects mismatches', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'iori-provider-test-')));
    try {
      const path = join(root, 'bindings.json');
      const target = expectedTargetFixture();
      target.resources.d1.id = bindings.d1_database_id;
      await writeFile(
        path,
        JSON.stringify({
          d1_database_id: target.resources.d1.id,
          kv_namespace_id: target.resources.kv.id,
          r2_bucket_name: target.resources.uploads.name,
          queue_name: target.resources.queue.name,
          worker_name: target.identity.worker_name,
        }),
        { mode: 0o600 },
      );
      const env = {
        IORI_WORKER_BINDINGS_PATH: path,
        WORKER_NAME: target.identity.worker_name,
        CLOUDFLARE_ACCOUNT_ID: target.identity.account_id,
        CLOUDFLARE_API_TOKEN: 'fixture',
        IORI_APPLICATION_R2_ACCESS_KEY_ID: 'fixture',
        IORI_APPLICATION_R2_SECRET_ACCESS_KEY: 'fixture',
      };
      const provider = await createCloudflareImportTransportFromEnvironment(env, {
        fetchImpl: sourceFetch([]),
        expectedTarget: target,
      });
      expect((await provider.getTableSummaries(['posts'])).posts.count).toBe(0);
      await expect(createCloudflareImportTransportFromEnvironment({ ...env, WORKER_NAME: 'different' })).rejects
        .toThrow();
      await expect(createCloudflareImportTransportFromEnvironment({ ...env, CLOUDFLARE_API_TOKEN: undefined })).rejects
        .toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it('preserves opaque continuation tokens', async () => {
    const provider = createCloudflareImportTransport({
      ...config,
      createClient: () => ({
        send: async (command) => {
          expect((command as { input: Record<string, unknown> }).input.ContinuationToken).toBe('a+/=');
          return { Contents: [{ Key: 'og/a' }], IsTruncated: true, NextContinuationToken: 'b+/=' };
        },
      }),
    });
    expect(await provider.listObjects('og/', 'a+/=')).toEqual({ keys: ['og/a'], cursor: 'b+/=' });
  });
  it('sanitizes stream failures after headers', async () => {
    const provider = createCloudflareImportTransport({
      ...config,
      createClient: () => ({
        send: async () => ({
          ContentType: 'image/png',
          Body: Readable.from((async function*() {
            yield Buffer.from('a');
            throw new Error('secret');
          })()),
        }),
      }),
    });
    const result = await provider.getObject('a');
    await expect(new Response(result!.body).text()).rejects.toThrow('Cloudflare import read failed.');
  });
  it('cleans external spool files after a source error during multi-run sorting', async () => {
    const before = (await readdir(tmpdir())).filter(name => name.startsWith('iori-canonical-')).sort();
    const rows = async function*() {
      yield 'z';
      yield 'a';
      yield 'b';
      throw new Error('source failed');
    };
    await expect(canonicalRowSummary(rows(), { chunkBytes: 1 })).rejects.toThrow('source failed');
    expect((await readdir(tmpdir())).filter(name => name.startsWith('iori-canonical-')).sort()).toEqual(before);
  });
});
