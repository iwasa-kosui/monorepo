import { mkdir, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';

import { createFixtureDirectory } from '../../../../scripts/__tests__/fixtureTemp.ts';
import { SOURCE_LIMITS } from '../../../../scripts/source-transfer-protocol.mjs';
import { SourceSnapshot } from './sourceSnapshot.ts';

vi.mock('../../../../scripts/source-transfer-protocol.mjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../scripts/source-transfer-protocol.mjs')>();
  return { ...actual, SOURCE_LIMITS: Object.freeze({ ...actual.SOURCE_LIMITS, inventoryFiles: 35 }) };
});

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
const identity = { main_sha: 'a'.repeat(40), run_id: 'fixture' };
const imageId = '33333333-3333-4333-8333-333333333333';
const urlImageId = '55555555-5555-4555-8555-555555555555';
const spareImageIds = ['66666666-6666-4666-8666-666666666666', '77777777-7777-4777-8777-777777777777'];
const longRemoteUrl = `https://remote.test/${'y'.repeat(200)}.png`;
type ImageRow = { imageId: string; url: string };
const defaultRows: ImageRow[] = [
  { imageId, url: `/uploads/${imageId}.png` },
  { imageId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', url: `/uploads/${urlImageId}.png` },
  { imageId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', url: 'https://remote.test/media/a.png' },
  { imageId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', url: longRemoteUrl },
  { imageId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', url: `/uploads/${urlImageId}.png` },
];
const setup = async (rows: ImageRow[] = defaultRows) => {
  const base = await createFixtureDirectory('iori-source-files-');
  roots.push(base);
  const uploadDir = join(base, 'originals');
  await mkdir(uploadDir);
  await writeFile(join(uploadDir, `${imageId}.png`), 'image');
  await writeFile(join(uploadDir, `${urlImageId}.png`), 'second image');
  for (const spare of spareImageIds) await writeFile(join(uploadDir, `${spare}.png`), spare);
  await writeFile(join(uploadDir, 'unreferenced.txt'), 'must not transfer');
  const snapshot = new SourceSnapshot({
    base,
    uploadDir,
    createClient: async () => {
      let images = false;
      let truncate = false;
      let sent = false;
      return {
        connect: async () => {},
        end: async () => {},
        query: async (sql: string) => {
          if (sql.startsWith('SELECT COALESCE')) return { rows: [{ bytes: '100', count: '1' }] };
          if (sql.startsWith('DECLARE')) {
            images = sql.includes('post_images');
            truncate = sql.includes('iori_images');
            if (truncate) expect(sql).toContain('left(url, 128)');
            sent = false;
          }
          if (sql.startsWith('FETCH') && images && !sent) {
            sent = true;
            return { rows: rows.map((row) => ({ row: truncate ? { ...row, url: row.url.slice(0, 128) } : row })) };
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
    upload_bytes: 5 + 12,
    rows: 31,
    upload_count: 2,
    upload_duplicate_count: 1,
    article_count: 1,
    source_required_bytes: 3100 * 24 + 34 + 64 * 1024 ** 2,
    runner_required_bytes: 3100 * 24 + 51 + 128 * 1024 ** 2,
  });
  expect(estimate.source_sufficient).toBe(estimate.source_free_bytes >= estimate.source_required_bytes);
});
type Failure = {
  at?: (sql: string) => boolean;
  connect?: boolean;
  bytes?: string;
  row?: unknown;
  abort?: boolean;
  drop?: boolean;
  missingBase?: boolean;
  bigUpload?: boolean;
  rows?: number;
  rowList?: ImageRow[];
};
const estimateWith = async (failure: Failure, uploadDir?: (base: string) => string, createFails = false) => {
  const { base } = await setup();
  if (failure.bigUpload) await truncate(join(base, 'originals', `${imageId}.png`), SOURCE_LIMITS.uploadBytes + 1);
  const controller = new AbortController();
  let onError: ((error: Error) => void) | undefined;
  const failing = new SourceSnapshot({
    base: failure.missingBase ? join(base, 'missing') : base,
    uploadDir: uploadDir?.(base) ?? join(base, 'originals'),
    createClient: async () => {
      if (createFails) throw new Error('password=hunter2');
      let sent = false;
      return {
        on: (_event: 'error', listener: (error: Error) => void) => {
          onError = listener;
        },
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
            if (failure.drop) onError?.(new Error('password=hunter2'));
            const row = failure.row ?? { imageId, url: `/uploads/${imageId}.png` };
            return {
              rows: failure.rowList?.map((listed) => ({ row: listed }))
                ?? Array.from({ length: failure.rows ?? 1 }, () => ({ row })),
            };
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
  ['data upload url', { row: { imageId, url: 'data:image/png;base64,AAAA' } }, 'estimate-upload-row'],
  ['non-string upload url', { row: { imageId, url: 42 } }, 'estimate-upload-row'],
  ['missing upload url', { row: { imageId } }, 'estimate-upload-row'],
  ['legacy upload url', { row: { imageId, url: `/static/uploads/${imageId}.png` } }, 'estimate-upload-legacy-path'],
  ['same key with another extension', {
    rowList: [{ imageId, url: `/uploads/${imageId}.png` }, { imageId, url: `/uploads/${imageId}.jpg` }],
  }, 'estimate-upload-row'],
  ['missing upload root', {}, 'estimate-upload-root', (base) => join(base, 'missing')],
  ['missing upload file', {
    row: { imageId: imageId.replace('3', '4'), url: `/uploads/${imageId.replace('3', '4')}.png` },
  }, 'estimate-upload-open'],
  ['oversized tables', { bytes: String(SOURCE_LIMITS.totalBytes + 1) }, 'estimate-too-large'],
  ['deadline', { abort: true }, 'estimate-limit'],
  ['connection lost while reading the next page', { drop: true }, 'estimate-query'],
  ['free space', { missingBase: true }, 'estimate-other'],
  ['oversized upload file', { bigUpload: true }, 'estimate-upload-open'],
  ['too many upload files', {
    rowList: [imageId, urlImageId, ...spareImageIds].map((id) => ({ imageId: id, url: `/uploads/${id}.png` })),
  }, 'estimate-too-large'],
])('names the %s stage of a failed estimate with a fixed message', async (_name, failure, stage, uploadDir, create) => {
  expect(await estimateWith(failure, uploadDir, create)).toBe(`source_estimate_failed:${stage}`);
});
it('estimates with the same fake client when nothing fails', async () => {
  expect(await estimateWith({})).toBe('estimated');
});
it('does not count duplicate rows against the upload file limit', async () => {
  expect(await estimateWith({ rows: 4 })).toBe('estimated');
});
it('counts neither remote rows nor long remote urls as uploads', async () => {
  const { snapshot } = await setup([
    { imageId, url: 'https://remote.test/media/a.png' },
    { imageId: urlImageId, url: longRemoteUrl },
  ]);
  expect(await snapshot.estimate(new AbortController().signal)).toMatchObject({
    upload_bytes: 0,
    upload_count: 0,
    upload_duplicate_count: 0,
  });
});
it('publishes exactly generated tables and referenced uploads, then streams an allowlisted logical file', async () => {
  const { snapshot, base } = await setup();
  await mkdir(join(base, 'exports'), { mode: 0o700 });
  await expect(snapshot.inventory(identity)).rejects.toThrow();
  const inventory = await snapshot.export(identity, new AbortController().signal);
  expect(inventory.complete).toBe(true);
  expect(inventory.files).toHaveLength(34);
  expect(inventory.files.filter((file) => file.id.startsWith('upload.')).map((file) => file.id).sort()).toEqual([
    `upload.${imageId}.png`,
    `upload.${urlImageId}.png`,
  ]);
  const upload = inventory.files.find((file) => file.id === `upload.${imageId}.png`)!;
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
  const invalid = await setup([{ imageId, url: '/uploads/../unreferenced.txt' }]);
  await expect(invalid.snapshot.export(identity, new AbortController().signal)).rejects.toThrow();
});
it.each<[string, ImageRow[], string]>([
  ['a legacy url', [{ imageId, url: `/static/uploads/${imageId}.png` }], 'upload-legacy-path'],
  ['an invalid url', [{ imageId, url: 'data:image/png;base64,AAAA' }], 'invalid_upload'],
  [
    'the same key with another extension',
    [{ imageId, url: `/uploads/${imageId}.png` }, { imageId, url: `/uploads/${imageId}.jpg` }],
    'invalid_upload',
  ],
])('fails to export %s without publishing inventory', async (_name, rows, message) => {
  const { snapshot, uploadDir } = await setup(rows);
  await writeFile(join(uploadDir, `${imageId}.jpg`), 'other image');
  await expect(snapshot.export(identity, new AbortController().signal)).rejects.toThrow(message);
  await expect(snapshot.inventory(identity)).rejects.toThrow();
});
it('exports remote rows without copying anything for them', async () => {
  const { snapshot } = await setup([{ imageId, url: 'https://remote.test/media/a.png' }]);
  const inventory = await snapshot.export(identity, new AbortController().signal);
  expect(inventory.files.filter((file) => file.id.startsWith('upload.'))).toEqual([]);
});
