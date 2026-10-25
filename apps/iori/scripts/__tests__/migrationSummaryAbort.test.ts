import { expect, it, vi } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const state = vi.hoisted(() => ({
  controller: undefined as AbortController | undefined,
  completed: false,
  spoolParent: '',
}));
vi.mock('../canonical-row-sort.mjs', async importOriginal => {
  const actual = await importOriginal<typeof import('../canonical-row-sort.mjs')>();
  return {
    ...actual,
    canonicalRowSummary: async (rows: AsyncIterable<string>, options: object) => {
      const afterFinalPage = async function*() {
        yield* rows;
        state.controller!.abort();
      };
      const value = await actual.canonicalRowSummary(afterFinalPage(), { ...options, spoolParent: state.spoolParent });
      state.completed = true;
      return value;
    },
  };
});
import { createCloudflareImportTransport } from '../cloudflare-import-provider.mjs';
it('cancels actual local summary after the final page and awaits spool removal', async () => {
  state.spoolParent = await mkdtemp(join(tmpdir(), 'iori-summary-abort-'));
  state.controller = new AbortController();
  state.completed = false;
  const provider = createCloudflareImportTransport({
    accountId: 'a'.repeat(32),
    apiToken: 'fixture',
    accessKeyId: 'fixture',
    secretAccessKey: 'fixture',
    expectedWorkerName: 'iori',
    signal: state.controller.signal,
    pageSize: 2,
    bindings: {
      worker_name: 'iori',
      d1_database_id: '11111111-1111-4111-8111-111111111111',
      kv_namespace_id: 'kv',
      r2_bucket_name: 'iori-uploads',
      queue_name: 'iori-fedify',
    },
    fetchImpl: async (_url, init) => {
      const { sql } = JSON.parse(String(init?.body));
      return Response.json({
        success: true,
        result: [{
          success: true,
          results: sql.includes('COUNT(*)') ? [{ count: 1 }] : [{ __iori_rowid: 1, content: 'fixture' }],
        }],
      });
    },
  });
  await expect(provider.getTableSummaries(['posts'])).rejects.toThrow('Cloudflare import read failed');
  expect(state.completed).toBe(false);
  expect(await readdir(state.spoolParent)).toEqual([]);
  await rm(state.spoolParent, { recursive: true, force: true });
});
