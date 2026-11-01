import { mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

import { createFixtureDirectory } from '../../../../scripts/__tests__/fixtureTemp.ts';
import { SOURCE_LIMITS } from '../../../../scripts/source-transfer-protocol.mjs';
import { SourceSnapshot } from './sourceSnapshot.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
const identity = { main_sha: 'a'.repeat(40), run_id: 'fixture' };
const imageId = '33333333-3333-4333-8333-333333333333';
const setup = async (url = `/uploads/${imageId}.png`) => {
  const base = await createFixtureDirectory('iori-source-files-');
  roots.push(base);
  const uploadDir = join(base, 'originals');
  await mkdir(uploadDir);
  await writeFile(join(uploadDir, `${imageId}.png`), 'image');
  await writeFile(join(uploadDir, 'unreferenced.txt'), 'must not transfer');
  const snapshot = new SourceSnapshot({
    base,
    uploadDir,
    createClient: async () => {
      let images = false;
      let sent = false;
      return {
        connect: async () => {},
        end: async () => {},
        query: async (sql: string) => {
          if (sql.startsWith('SELECT COALESCE')) return { rows: [{ bytes: '100', count: '1' }] };
          if (sql.startsWith('DECLARE')) {
            images = sql.includes('post_images');
            if (sql.includes('iori_images')) expect(sql).toContain('octet_length(url) <= 128');
            sent = false;
          }
          if (sql.startsWith('FETCH') && images && !sent) {
            sent = true;
            return { rows: [{ row: { imageId, url } }] };
          }
          return { rows: [] };
        },
      };
    },
  });
  return { snapshot, base, uploadDir };
};
it('estimates bounded read-only source and runner capacity with upload/article counts before freeze', async () => {
  const { snapshot } = await setup();
  const estimate = await snapshot.estimate(new AbortController().signal);
  expect(estimate).toMatchObject({
    table_bytes: 3100,
    upload_bytes: 5,
    rows: 31,
    upload_count: 1,
    article_count: 1,
    source_required_bytes: 3100 * 24 + 10 + 64 * 1024 ** 2,
    runner_required_bytes: 3100 * 24 + 15 + 128 * 1024 ** 2,
  });
  expect(estimate.source_sufficient).toBe(estimate.source_free_bytes >= estimate.source_required_bytes);
});
type Failure = { at?: (sql: string) => boolean; connect?: boolean; bytes?: string; row?: unknown; abort?: boolean };
const estimateWith = async (failure: Failure, uploadDir?: (base: string) => string, createFails = false) => {
  const { base } = await setup();
  const controller = new AbortController();
  const failing = new SourceSnapshot({
    base,
    uploadDir: uploadDir?.(base) ?? join(base, 'originals'),
    createClient: async () => {
      if (createFails) throw new Error('password=hunter2');
      let sent = false;
      return {
        connect: async () => {
          if (failure.connect) throw new Error('password=hunter2');
          if (failure.abort) controller.abort();
        },
        end: async () => {},
        query: async (sql: string) => {
          if (failure.at?.(sql)) throw new Error('password=hunter2');
          if (sql.startsWith('SELECT COALESCE')) return { rows: [{ bytes: failure.bytes ?? '100', count: '1' }] };
          if (sql.startsWith('FETCH') && !sent) {
            sent = true;
            return { rows: [{ row: failure.row ?? { imageId, url: `/uploads/${imageId}.png` } }] };
          }
          return { rows: [] };
        },
      };
    },
  });
  return failing.estimate(controller.signal).then(() => 'estimated', (error: Error) => error.message);
};
it.each<[string, Failure, string, ((base: string) => string)?, boolean?]>([
  ['createClient', {}, 'estimate-connect', undefined, true],
  ['connect', { connect: true }, 'estimate-connect'],
  ['BEGIN', { at: (sql) => sql.startsWith('BEGIN') }, 'estimate-connect'],
  ['SET LOCAL', { at: (sql) => sql.startsWith('SET LOCAL') }, 'estimate-connect'],
  ['table SELECT', { at: (sql) => sql.startsWith('SELECT COALESCE') }, 'estimate-query'],
  ['table result', { bytes: 'not a number' }, 'estimate-query'],
  ['DECLARE', { at: (sql) => sql.startsWith('DECLARE') }, 'estimate-query'],
  ['FETCH', { at: (sql) => sql.startsWith('FETCH') }, 'estimate-query'],
  ['COMMIT', { at: (sql) => sql.startsWith('COMMIT') }, 'estimate-query'],
  ['unparsable upload row', { row: { imageId: 'not-a-uuid', url: 'x' } }, 'estimate-upload-row'],
  ['upload url outside uploads', { row: { imageId, url: '/uploads/../x.png' } }, 'estimate-upload-row'],
  ['missing upload root', {}, 'estimate-upload-root', (base) => join(base, 'missing')],
  ['missing upload file', {
    row: { imageId: imageId.replace('3', '4'), url: `/uploads/${imageId.replace('3', '4')}.png` },
  }, 'estimate-upload-open'],
  ['oversized tables', { bytes: String(SOURCE_LIMITS.totalBytes + 1) }, 'estimate-too-large'],
  ['deadline', { abort: true }, 'estimate-limit'],
])('names the %s stage of a failed estimate with a fixed message', async (_name, failure, stage, uploadDir, create) => {
  expect(await estimateWith(failure, uploadDir, create)).toBe(`source_estimate_failed:${stage}`);
});
it('estimates with the same fake client when nothing fails', async () => {
  expect(await estimateWith({})).toBe('estimated');
});
it('publishes exactly generated tables and referenced uploads, then streams an allowlisted logical file', async () => {
  const { snapshot, base } = await setup();
  await mkdir(join(base, 'exports'), { mode: 0o700 });
  await expect(snapshot.inventory(identity)).rejects.toThrow();
  const inventory = await snapshot.export(identity, new AbortController().signal);
  expect(inventory.complete).toBe(true);
  expect(inventory.files).toHaveLength(33);
  const upload = inventory.files.find((file) => file.id.startsWith('upload.'))!;
  expect(upload.bytes).toBe(5);
  let bytes = '';
  await snapshot.transfer(identity, upload.id, async (_metadata, stream) => {
    for await (const chunk of stream) bytes += chunk.toString();
  }, new AbortController().signal);
  expect(bytes).toBe('image');
  await expect(snapshot.transfer(identity, '../unreferenced.txt', async () => {}, new AbortController().signal)).rejects
    .toThrow();
  await expect(snapshot.export(identity, new AbortController().signal)).rejects.toThrow();
  expect(await readFile(join(base, 'originals/unreferenced.txt'), 'utf8')).toBe('must not transfer');
});
it('fails on referenced upload symlinks or traversal without publishing inventory', async () => {
  const { snapshot, uploadDir } = await setup();
  await rm(join(uploadDir, `${imageId}.png`));
  await symlink(join(uploadDir, 'unreferenced.txt'), join(uploadDir, `${imageId}.png`));
  await expect(snapshot.export(identity, new AbortController().signal)).rejects.toThrow();
  await expect(snapshot.inventory(identity)).rejects.toThrow();
  const invalid = await setup('/uploads/../unreferenced.txt');
  await expect(invalid.snapshot.export(identity, new AbortController().signal)).rejects.toThrow();
});
