import { createHash } from 'node:crypto';
import { mkdir, open, rename, unlink } from 'node:fs/promises';
import { join } from 'node:path';

import { sortedCanonicalRecords } from './canonical-row-sort.mjs';
import { canonicalD1RowString } from './data-migration-mapping.mjs';
import { assertExternalMigrationPath, assertExternalMigrationRoot } from './migration-path-safety.mjs';

export const APPLICATION_TABLE_ORDER = [
  'users',
  'actors',
  'instance_actor_keys',
  'domain_events',
  'relays',
  'keys',
  'user_passwords',
  'sessions',
  'local_actors',
  'remote_actors',
  'follows',
  'posts',
  'remote_posts',
  'local_posts',
  'likes',
  'local_likes',
  'remote_likes',
  'post_images',
  'notifications',
  'notification_likes',
  'notification_follows',
  'notification_emoji_reacts',
  'notification_replies',
  'push_subscriptions',
  'reposts',
  'timeline_items',
  'emoji_reacts',
  'mutes',
  'articles',
  'link_previews',
  'federated_timeline_items',
];

export const EXPORT_LIMITS = Object.freeze({
  rowBytes: 8 * 1024 * 1024,
  pageRows: 16,
  totalBytes: 10 * 1024 ** 3,
  deadlineMs: 30 * 60 * 1000,
});

// This low-level writer receives only an initialized runtime-owned client factory.
// Admission/quiescence authorization is exclusively enforced by SourceControl.
export const exportPostgres = async (
  {
    outputDir,
    createClient,
    now = () => new Date(),
    pageSize = 16,
    sortChunkBytes,
    signal,
    maxBytes = EXPORT_LIMITS.totalBytes,
  },
) => {
  const directory = await assertExternalMigrationPath(outputDir);
  if (
    typeof createClient !== 'function' || !Number.isSafeInteger(pageSize) || pageSize < 1
    || pageSize > EXPORT_LIMITS.pageRows
    || !Number.isSafeInteger(maxBytes) || maxBytes < 0 || maxBytes > EXPORT_LIMITS.totalBytes
  ) throw new Error('Invalid export options.');
  await mkdir(directory, { mode: 0o700 }); // Existing output is never reused, even if empty.
  await assertExternalMigrationRoot(directory);
  const client = await createClient();
  const manifest = { schemaVersion: 1, exportedAt: now().toISOString(), complete: false, tables: {} };
  let transaction = false;
  let published = false;
  let totalBytes = 0;
  let closing;
  const close = () => closing ??= client.end();
  const abort = () => {
    close().catch(() => {});
  };
  signal?.addEventListener('abort', abort, { once: true });
  try {
    signal?.throwIfAborted();
    await client.connect();
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transaction = true;
    await client.query('SET LOCAL statement_timeout = \'60s\'');
    for (const table of APPLICATION_TABLE_ORDER) {
      signal?.throwIfAborted();
      await client.query(
        `DECLARE iori_export NO SCROLL CURSOR FOR SELECT CASE WHEN octet_length(to_jsonb(row)::text) <= ${EXPORT_LIMITS.rowBytes} THEN to_jsonb(row) ELSE NULL END AS row FROM "${table}" AS row`,
      );
      const records = async function*() {
        while (true) {
          signal?.throwIfAborted();
          const page = await client.query(`FETCH FORWARD ${pageSize} FROM iori_export`);
          if (!Array.isArray(page.rows) || page.rows.length > pageSize) throw new Error('Invalid export page.');
          if (page.rows.length === 0) break;
          for (const { row } of page.rows) {
            if (!row || Array.isArray(row) || typeof row !== 'object') throw new Error('Invalid export row.');
            const payload = JSON.stringify(row);
            const bytes = Buffer.byteLength(payload) + 1;
            if (bytes > EXPORT_LIMITS.rowBytes || totalBytes + bytes > maxBytes) throw new Error('Export size limit.');
            totalBytes += bytes;
            yield { key: canonicalD1RowString(table, row), payload };
          }
        }
      };
      const file = `${table}.ndjson`;
      const handle = await open(join(directory, file), 'wx', 0o600);
      const hash = createHash('sha256');
      let count = 0;
      let bytes = 0;
      try {
        for await (
          const { payload } of sortedCanonicalRecords(records(), {
            chunkBytes: sortChunkBytes,
            spoolParent: directory,
            signal,
          })
        ) {
          signal?.throwIfAborted();
          const line = payload + '\n';
          await handle.writeFile(line);
          hash.update(line);
          bytes += Buffer.byteLength(line);
          count++;
        }
        await handle.sync();
      } finally {
        await handle.close();
      }
      await client.query('CLOSE iori_export');
      manifest.tables[table] = { file, count, bytes, checksum: hash.digest('hex') };
    }
    signal?.throwIfAborted();
    await client.query('COMMIT');
    transaction = false;
    signal?.throwIfAborted();
    await close();
    signal?.throwIfAborted();
    manifest.complete = true;
    const pending = join(directory, 'export-manifest.pending');
    const completed = await open(pending, 'wx', 0o600);
    try {
      await completed.writeFile(JSON.stringify(manifest) + '\n');
      await completed.sync();
    } finally {
      await completed.close();
    }
    signal?.throwIfAborted();
    await rename(pending, join(directory, 'export-manifest.json'));
    published = true;
    const parent = await open(directory, 'r');
    try {
      await parent.sync();
    } finally {
      await parent.close();
    }
    signal?.throwIfAborted();
    return manifest;
  } catch {
    if (published) await unlink(join(directory, 'export-manifest.json'));
    if (transaction) {
      try {
        await client.query('ROLLBACK');
      } catch { /* Connection abort already rolled back. */ }
    }
    throw new Error('PostgreSQL export failed.');
  } finally {
    signal?.removeEventListener('abort', abort);
    await close();
  }
};
