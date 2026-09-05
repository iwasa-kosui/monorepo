import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compareCanonicalD1Rows } from './data-migration-mapping.mjs';
import { prepareExternalMigrationDirectory } from './migration-path-safety.mjs';

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

const checksum = (value) => createHash('sha256').update(value).digest('hex');
const quoteIdentifier = (identifier) => `"${identifier.replaceAll('"', '""')}"`;

const rowsFor = async (client, table) => {
  const result = await client.query(
    `SELECT to_jsonb(row) AS row FROM (SELECT * FROM ${quoteIdentifier(table)}) AS row ORDER BY to_jsonb(row)::text`,
  );
  return result.rows.map(({ row }) => row).sort((left, right) => compareCanonicalD1Rows(table, left, right));
};

/**
 * Exports the frozen PostgreSQL application data to an external, private directory.
 * The calling runbook must stop Lightsail and drain the Fedify queue before it sets
 * queueDrained; row contents are intentionally never written to stdout or stderr.
 */
export const exportPostgres = async ({
  connectionString,
  outputDir,
  queueDrained = false,
  now = () => new Date(),
  createClient,
}) => {
  const safeOutputDirectory = await prepareExternalMigrationDirectory(outputDir);
  if (!queueDrained) {
    throw new Error('Fedify queue must be drained before export.');
  }

  const clientFactory = createClient ?? (async () => {
    const { Client } = await import('pg');
    return new Client({ connectionString });
  });
  const client = await clientFactory();
  const manifest = {
    schemaVersion: 1,
    exportedAt: now().toISOString(),
    complete: false,
    tables: {},
  };

  try {
    await client.connect();
    for (const table of APPLICATION_TABLE_ORDER) {
      const rows = await rowsFor(client, table);
      const contents = rows.map((row) => JSON.stringify(row)).join('\n');
      const ndjson = contents.length === 0 ? '' : `${contents}\n`;
      const file = `${table}.ndjson`;
      await writeFile(resolve(safeOutputDirectory, file), ndjson, { encoding: 'utf8', mode: 0o600 });
      manifest.tables[table] = { file, count: rows.length, checksum: checksum(ndjson) };
    }
    manifest.complete = true;
    await writeFile(
      resolve(safeOutputDirectory, 'export-manifest.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
    return manifest;
  } finally {
    await client.end();
  }
};

const main = async () => {
  if (!process.argv.includes('--lightsail-stopped') || !process.argv.includes('--fedify-queue-drained')) {
    throw new Error('The Lightsail stop and Fedify queue drain confirmations are required.');
  }
  const connectionString = process.env.DATABASE_URL;
  const outputDir = process.env.IORI_MIGRATION_OUTPUT_DIR;
  if (connectionString === undefined || outputDir === undefined) {
    throw new Error('Required migration environment is missing.');
  }
  await exportPostgres({ connectionString, outputDir, queueDrained: true });
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(() => {
    console.error('PostgreSQL export failed.');
    process.exitCode = 1;
  });
}
