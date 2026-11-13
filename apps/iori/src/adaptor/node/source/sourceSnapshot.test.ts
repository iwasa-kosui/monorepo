import { chmod, mkdir, open, readdir, readFile, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, afterEach, beforeAll, expect, it, type MockInstance, vi } from 'vitest';

import { createFixtureDirectory } from '../../../../scripts/__tests__/fixtureTemp.ts';
import { SOURCE_LIMITS } from '../../../../scripts/source-transfer-protocol.mjs';
import { SourceSnapshot } from './sourceSnapshot.ts';

vi.mock('../../../../scripts/source-transfer-protocol.mjs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../../scripts/source-transfer-protocol.mjs')>();
  return { ...actual, SOURCE_LIMITS: Object.freeze({ ...actual.SOURCE_LIMITS, inventoryFiles: 35 }) };
});

// macOS の fsync は F_FULLFSYNC でドライブの書き込みキャッシュ全体を flush させ、全体実行の I/O と重なると 5 秒の timeout を超えることがある。
let syncSpy: MockInstance | undefined;
beforeAll(async () => {
  const handle = await open(import.meta.filename, 'r');
  syncSpy = vi.spyOn(Object.getPrototypeOf(handle), 'sync').mockResolvedValue(undefined);
  await handle.close();
});
afterAll(() => {
  syncSpy?.mockRestore();
});

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
const origin = 'https://blog.test';
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
    origin,
    createClient: async () => {
      let images = false;
      let truncate = false;
      let sent = false;
      return {
        connect: async () => {},
        end: async () => {},
        query: async (sql: string) => {
          if (sql.includes('AS owner')) return { rows: [{ count: '1' }] };
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
    upload_missing_count: 0,
    upload_ext_png_count: 2,
    upload_failed_ext_png_count: 0,
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
  owners?: string;
  row?: unknown;
  abort?: boolean;
  drop?: boolean;
  missingBase?: boolean;
  rows?: number;
  rowList?: ImageRow[];
};
const estimateWith = async (failure: Failure, uploadDir?: (base: string) => string, createFails = false) => {
  const { base } = await setup();
  const controller = new AbortController();
  let onError: ((error: Error) => void) | undefined;
  const failing = new SourceSnapshot({
    base: failure.missingBase ? join(base, 'missing') : base,
    uploadDir: uploadDir?.(base) ?? join(base, 'originals'),
    origin,
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
          if (sql.includes('AS owner')) return { rows: [{ count: failure.owners ?? '1' }] };
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
  ['owner SELECT', { at: (sql) => sql.includes('AS owner') }, 'estimate-query'],
  ['owner result', { owners: 'not a number' }, 'estimate-query'],
  ['no owner', { owners: '0' }, 'estimate-export-owner'],
  ['two owners', { owners: '2' }, 'estimate-export-owner'],
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
  [
    'same-origin upload url',
    { row: { imageId, url: `${origin}/uploads/${imageId}.png` } },
    'estimate-upload-same-origin',
  ],
  [
    'same-origin upload url over http',
    { row: { imageId, url: `http://blog.test/uploads/${imageId}.png` } },
    'estimate-upload-same-origin',
  ],
  [
    'same-origin upload url cut at 128 characters',
    { row: { imageId, url: `${origin}/static/uploads/${'x'.repeat(200)}.png`.slice(0, 128) } },
    'estimate-upload-same-origin',
  ],
  ['same key with another extension', {
    rowList: [{ imageId, url: `/uploads/${imageId}.png` }, { imageId, url: `/uploads/${imageId}.jpg` }],
  }, 'estimate-upload-row'],
  ['missing upload root', {}, 'estimate-upload-root', (base) => join(base, 'missing')],
  ['oversized tables', { bytes: String(SOURCE_LIMITS.totalBytes + 1) }, 'estimate-too-large'],
  ['deadline', { abort: true }, 'estimate-limit'],
  ['connection lost while reading the next page', { drop: true }, 'estimate-query'],
  ['free space', { missingBase: true }, 'estimate-other'],
  ['too many upload files', {
    rowList: [imageId, urlImageId, ...spareImageIds].map((id) => ({ imageId: id, url: `/uploads/${id}.png` })),
  }, 'estimate-too-large'],
])('names the %s stage of a failed estimate with a fixed message', async (_name, failure, stage, uploadDir, create) => {
  expect(await estimateWith(failure, uploadDir, create)).toBe(`source_estimate_failed:${stage}`);
});
const countsOf = (estimate: Awaited<ReturnType<SourceSnapshot['estimate']>>) =>
  Object.fromEntries(Object.entries(estimate).filter(([key, value]) => key.startsWith('upload_') && value !== 0));
const spareId = (letter: string) =>
  `${letter.repeat(8)}-${letter.repeat(4)}-4${letter.repeat(3)}-8${letter.repeat(3)}-${letter.repeat(12)}`;
const rowFor = (id: string, extension: string) => ({ imageId: id, url: `/uploads/${id}.${extension}` });
it('counts every unopened upload by cause and extension, and adds only opened files to upload_bytes', async () => {
  const [webp, jpg] = [spareId('e'), spareId('f')];
  const { snapshot, uploadDir } = await setup([
    rowFor(imageId, 'png'),
    rowFor(webp, 'webp'),
    rowFor(jpg, 'jpg'),
    rowFor(webp, 'webp'),
  ]);
  await symlink(join(uploadDir, 'unreferenced.txt'), join(uploadDir, `${jpg}.jpg`));
  expect(countsOf(await snapshot.estimate(new AbortController().signal))).toEqual({
    upload_count: 3,
    upload_duplicate_count: 1,
    upload_bytes: 5,
    upload_missing_count: 1,
    upload_not_regular_count: 1,
    upload_ext_webp_count: 1,
    upload_ext_png_count: 1,
    upload_ext_jpeg_count: 1,
    upload_failed_ext_webp_count: 1,
    upload_failed_ext_jpeg_count: 1,
  });
});
it('counts oversized and absent uploads without stopping at the first failure', async () => {
  const [gif, jpeg] = [spareId('a'), spareId('b')];
  const { snapshot, uploadDir } = await setup([
    rowFor(gif, 'gif'),
    rowFor(jpeg, 'jpeg'),
    rowFor(urlImageId, 'png'),
  ]);
  await writeFile(join(uploadDir, `${gif}.gif`), '');
  await truncate(join(uploadDir, `${gif}.gif`), SOURCE_LIMITS.uploadBytes + 1);
  expect(countsOf(await snapshot.estimate(new AbortController().signal))).toEqual({
    upload_count: 3,
    upload_bytes: 12,
    upload_missing_count: 1,
    upload_too_large_count: 1,
    upload_ext_png_count: 1,
    upload_ext_jpeg_count: 1,
    upload_ext_gif_count: 1,
    upload_failed_ext_jpeg_count: 1,
    upload_failed_ext_gif_count: 1,
  });
});
it.skipIf(process.getuid?.() === 0)('counts an upload the process cannot open as access', async () => {
  const { snapshot, uploadDir } = await setup([rowFor(imageId, 'png'), rowFor(urlImageId, 'png')]);
  await chmod(join(uploadDir, `${imageId}.png`), 0o000);
  expect(countsOf(await snapshot.estimate(new AbortController().signal))).toEqual({
    upload_count: 2,
    upload_bytes: 12,
    upload_access_count: 1,
    upload_ext_png_count: 2,
    upload_failed_ext_png_count: 1,
  });
});
it('counts an uppercase extension under its lowercase name', async () => {
  const upper = spareId('c');
  const { snapshot, uploadDir } = await setup([rowFor(upper, 'WEBP')]);
  await writeFile(join(uploadDir, `${upper}.WEBP`), 'x');
  expect(countsOf(await snapshot.estimate(new AbortController().signal))).toEqual({
    upload_count: 1,
    upload_bytes: 1,
    upload_ext_webp_count: 1,
  });
});
const pagedSnapshot = (base: string, uploadDir: string, pages: { row: unknown }[][]) =>
  new SourceSnapshot({
    base,
    uploadDir,
    origin,
    createClient: async () => {
      let fetched = 0;
      return {
        connect: async () => {},
        end: async () => {},
        query: async (sql: string) => {
          if (sql.includes('AS owner')) return { rows: [{ count: '1' }] };
          if (sql.startsWith('SELECT COALESCE')) return { rows: [{ bytes: '100', count: '1' }] };
          if (sql.startsWith('FETCH')) {
            return { rows: pages[fetched++] ?? [] };
          }
          return { rows: [] };
        },
      };
    },
  });
it('counts unopened uploads on later pages when the scan spans more than one page of 100 rows', async () => {
  const [webp, gif] = [spareId('e'), spareId('f')];
  const { base, uploadDir } = await setup();
  const first = Array.from({ length: 100 }, () => ({ row: rowFor(imageId, 'png') }));
  const second = [{ row: rowFor(webp, 'webp') }, { row: rowFor(gif, 'gif') }, { row: rowFor(imageId, 'png') }];
  const estimate = await pagedSnapshot(base, uploadDir, [first, second]).estimate(new AbortController().signal);
  expect(countsOf(estimate)).toEqual({
    upload_count: 3,
    upload_duplicate_count: 100,
    upload_bytes: 5,
    upload_missing_count: 2,
    upload_ext_png_count: 1,
    upload_ext_webp_count: 1,
    upload_ext_gif_count: 1,
    upload_failed_ext_webp_count: 1,
    upload_failed_ext_gif_count: 1,
  });
});
it('stops at the next row with the limit stage when the signal aborts while a page is being processed', async () => {
  const { base, uploadDir } = await setup();
  const controller = new AbortController();
  let reads = 0;
  const rows = Array.from({ length: 3 }, () => ({
    row: {
      imageId,
      get url() {
        reads += 1;
        controller.abort();
        return `/uploads/${imageId}.png`;
      },
    },
  }));
  await expect(pagedSnapshot(base, uploadDir, [rows]).estimate(controller.signal)).rejects.toThrow(
    'source_estimate_failed:estimate-limit',
  );
  expect(reads).toBe(1);
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
  ['a same-origin url', [{ imageId, url: `${origin}/uploads/${imageId}.png` }], 'upload-same-origin'],
  ['a same-host url over http', [{ imageId, url: `http://blog.test/uploads/${imageId}.png` }], 'upload-same-origin'],
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
it('constructs without a source origin but fails to estimate and export', async () => {
  const createClient = async () => {
    throw new Error('unused');
  };
  const options = { base: '/unused', uploadDir: '/unused', createClient };
  const snapshot = new SourceSnapshot(options as unknown as ConstructorParameters<typeof SourceSnapshot>[0]);
  await expect(snapshot.estimate(new AbortController().signal)).rejects.toThrow(
    'source_estimate_failed:estimate-other',
  );
  await expect(snapshot.export(identity, new AbortController().signal)).rejects.toThrow('source-origin-required');
});
it('exports remote rows without copying anything for them', async () => {
  const { snapshot } = await setup([{ imageId, url: 'https://remote.test/media/a.png' }]);
  const inventory = await snapshot.export(identity, new AbortController().signal);
  expect(inventory.files.filter((file) => file.id.startsWith('upload.'))).toEqual([]);
});
it('skips an upload whose file is missing, counts it once and records the count in the persisted inventory', async () => {
  const [webp, other] = [spareId('e'), spareId('f')];
  const { snapshot, base } = await setup([
    rowFor(imageId, 'png'),
    rowFor(webp, 'webp'),
    rowFor(webp, 'webp'),
    rowFor(other, 'jpg'),
  ]);
  const inventory = await snapshot.export(identity, new AbortController().signal);
  expect(inventory.missingUploadCount).toBe(2);
  expect(inventory.files.filter((file) => file.id.startsWith('upload.')).map((file) => file.id)).toEqual([
    `upload.${imageId}.png`,
  ]);
  const uploads = await readdir(join(base, 'exports', `${identity.main_sha}-${identity.run_id}`, 'uploads'));
  expect(uploads).toEqual([`${imageId}.png`]);
  const reloaded = new SourceSnapshot({
    base,
    uploadDir: join(base, 'originals'),
    origin,
    createClient: async () => {
      throw new Error('unused');
    },
  });
  expect((await reloaded.inventory(identity)).missingUploadCount).toBe(2);
});
it('exports a zero missing count when every referenced upload exists', async () => {
  const { snapshot } = await setup();
  expect((await snapshot.export(identity, new AbortController().signal)).missingUploadCount).toBe(0);
});
it('fails to export an upload that is not a regular file even when another upload is missing', async () => {
  const [webp, jpg] = [spareId('e'), spareId('f')];
  const { snapshot, uploadDir } = await setup([rowFor(webp, 'webp'), rowFor(jpg, 'jpg')]);
  await symlink(join(uploadDir, 'unreferenced.txt'), join(uploadDir, `${jpg}.jpg`));
  await expect(snapshot.export(identity, new AbortController().signal)).rejects.toThrow();
  await expect(snapshot.inventory(identity)).rejects.toThrow();
});
it('fails to export an oversized upload even when another upload is missing', async () => {
  const [webp, gif] = [spareId('e'), spareId('f')];
  const { snapshot, uploadDir } = await setup([rowFor(webp, 'webp'), rowFor(gif, 'gif')]);
  await writeFile(join(uploadDir, `${gif}.gif`), '');
  await truncate(join(uploadDir, `${gif}.gif`), SOURCE_LIMITS.uploadBytes + 1);
  await expect(snapshot.export(identity, new AbortController().signal)).rejects.toThrow();
  await expect(snapshot.inventory(identity)).rejects.toThrow();
});
it.skipIf(process.getuid?.() === 0)(
  'fails to export an upload the process cannot open even when another is missing',
  async () => {
    const webp = spareId('e');
    const { snapshot, uploadDir } = await setup([rowFor(webp, 'webp'), rowFor(imageId, 'png')]);
    await chmod(join(uploadDir, `${imageId}.png`), 0o000);
    await expect(snapshot.export(identity, new AbortController().signal)).rejects.toThrow();
    await expect(snapshot.inventory(identity)).rejects.toThrow();
  },
);
