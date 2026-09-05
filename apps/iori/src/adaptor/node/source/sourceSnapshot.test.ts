import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';

import { SourceSnapshot } from './sourceSnapshot.ts';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));
});
const identity = { main_sha: 'a'.repeat(40), run_id: 'fixture' };
const imageId = '33333333-3333-4333-8333-333333333333';
const setup = async (url = `/uploads/${imageId}.png`) => {
  const base = await mkdtemp('/private/tmp/iori-source-files-');
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
