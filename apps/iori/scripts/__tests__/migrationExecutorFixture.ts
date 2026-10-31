import { createHash, generateKeyPairSync } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { vi } from 'vitest';
import { type ExecutorOptions } from '../execute-protected-migration.mjs';
import { expectedTargetFixture, preparationFixture } from './migrationTargetFixture.js';
import { preparationRecordKey, serializePreparationRecord } from '../migration-target-contract.mjs';
import { APPLICATION_TABLE_ORDER, exportPostgres } from '../export-postgres.mjs';
import { SOURCE_LIMITS, type SourceInventory } from '../source-transfer-protocol.mjs';
import { importMigrationD1, reviewedD1Schema } from '../migration-d1-import.mjs';
import { createCloudflareImportTransport } from '../cloudflare-import-provider.mjs';
import { createCloudflareImportProvider } from '../verify-cloudflare-import.mjs';
import { createMigrationR2Writer } from '../migration-r2-writer.mjs';
import { renderNodeOgImage } from '../../src/adaptor/node/ogImageRenderer.ts';
import { parseMigrationRehearsal } from '../migration-budget.mjs';
const roots: string[] = [];
export const directory = async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'iori-executor-'));
  roots.push(root);
  return root;
};
export const removeExecutorRoots = async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
};
export const fixture = async () => {
  const root = await directory();
  const sourceRoot = await directory();
  const target = expectedTargetFixture();
  target.resources.d1.id = '11111111-1111-4111-8111-111111111111';
  const record = preparationFixture();
  record.resources.d1.id = target.resources.d1.id;
  const keys = generateKeyPairSync('ed25519');
  const remote = new Map<string, Buffer>([[preparationRecordKey(target), serializePreparationRecord(record)]]);
  const calls: string[] = [];
  const storage = {
    assertPrivate: async () => {},
    putNew: async (key: string, body: Buffer) => {
      calls.push(
        key.endsWith('execution-reservation')
          ? 'reserve'
          : key.endsWith('/rehearsal.json')
          ? 'rehearsal-mark'
          : 'publish',
      );
      if (remote.has(key)) throw new Error('collision');
      remote.set(key, Buffer.from(body));
    },
    get: async (key: string) => {
      if (!remote.has(key)) throw new Error('missing');
      return Buffer.from(remote.get(key)!);
    },
    getIfExists: async (key: string) => remote.has(key) ? Buffer.from(remote.get(key)!) : null,
  };
  const sourceDb = new DatabaseSync(':memory:');
  const actualDb = new DatabaseSync(':memory:');
  sourceDb.exec(await readFile(reviewedD1Schema, 'utf8'));
  const actor = '11111111-1111-4111-8111-111111111111',
    post = '22222222-2222-4222-8222-222222222222',
    image = '33333333-3333-4333-8333-333333333333',
    article = '44444444-4444-4444-8444-444444444444';
  sourceDb.prepare('INSERT INTO actors (actorId, uri, inboxUrl, type) VALUES (?, ?, ?, ?)').run(
    actor,
    'https://fixture.test/' + 'x'.repeat(600),
    'https://fixture.test/inbox',
    'Person',
  );
  sourceDb.prepare('INSERT INTO users VALUES (?, ?)').run('user', 'fixture');
  sourceDb.prepare('INSERT INTO posts (postId, actorId, content, createdAt, type) VALUES (?, ?, ?, ?, ?)').run(
    post,
    actor,
    'fixture',
    1,
    'note',
  );
  sourceDb.prepare('INSERT INTO post_images (imageId, postId, url, createdAt) VALUES (?, ?, ?, ?)').run(
    image,
    post,
    `/uploads/${image}.png`,
    1,
  );
  sourceDb.prepare(
    'INSERT INTO articles (articleId, authorActorId, authorUserId, rootPostId, title, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(article, actor, 'user', post, 'fixture article', 'published', 1);
  const state = {
    source_revision: target.identity.main_sha,
    ingress_frozen: true,
    http_inflight: 0,
    queue_depth: 0,
    dequeue_work: 0,
    enqueue_work: 0,
    consumer_paused: true,
    queue_failed: false,
    drained: true,
    identity: { main_sha: target.identity.main_sha, run_id: target.identity.run_id },
  };
  let inventory: SourceInventory;
  const source = {
    estimate: vi.fn(async () => ({
      source_revision: target.identity.main_sha,
      table_bytes: 10000,
      upload_bytes: 8,
      rows: 5,
      upload_count: 1,
      article_count: 1,
      source_free_bytes: 10_000_000_000,
      source_required_bytes: 64_000_000,
      runner_required_bytes: 128_000_000,
      source_sufficient: true,
      limits: SOURCE_LIMITS,
    })),
    freeze: vi.fn(async () => {
      calls.push('freeze');
      return state;
    }),
    status: async () => state,
    resume: vi.fn(async () => {
      calls.push('resume');
      return { ...state, ingress_frozen: false, drained: false, identity: null };
    }),
    drain: async () => {
      calls.push('drain');
      return state;
    },
    export: async () => {
      calls.push('export');
      let table = '';
      let sent = false;
      await exportPostgres({
        outputDir: join(sourceRoot, 'export'),
        createClient: async () => ({
          connect: async () => {},
          end: async () => {},
          query: async (sql: string) => {
            if (sql.startsWith('DECLARE')) {
              table = /FROM "([a-z_]+)"/.exec(sql)![1]!;
              sent = false;
            }
            if (sql.startsWith('FETCH') && !sent) {
              sent = true;
              return { rows: sourceDb.prepare(`SELECT * FROM "${table}"`).all().map(row => ({ row })) };
            }
            return { rows: [] };
          },
        }),
      });
      await mkdir(join(sourceRoot, 'uploads'));
      await writeFile(join(sourceRoot, `uploads/${image}.png`), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), {
        mode: 0o600,
      });
      const paths = [...APPLICATION_TABLE_ORDER.map(name => ({ id: `table.${name}`, path: `export/${name}.ndjson` })), {
        id: 'manifest.export',
        path: 'export/export-manifest.json',
      }, { id: `upload.${image}.png`, path: `uploads/${image}.png` }];
      const files = await Promise.all(paths.map(async entry => {
        const body = await readFile(join(sourceRoot, entry.path));
        return { ...entry, bytes: body.length, checksum: createHash('sha256').update(body).digest('hex') };
      }));
      inventory = {
        schemaVersion: 1,
        complete: true,
        identity: state.identity,
        totalBytes: files.reduce((sum, f) => sum + f.bytes, 0),
        files,
      };
      return inventory;
    },
    restore: async (path: string) => {
      await cp(sourceRoot, path, { recursive: true });
      return {
        root: path,
        manifestPath: join(path, 'export/export-manifest.json'),
        uploadDir: join(path, 'uploads'),
        inventoryPath: join(path, 'source-inventory.json'),
      };
    },
  };
  const objects = new Map<string, { body: Buffer; contentType: string }>();
  const bucket = createMigrationR2Writer({
    expectedTarget: target,
    accessKeyId: 'fixture',
    secretAccessKey: 'fixture',
    createClient: () => ({
      send: async command => {
        objects.set(command.input.Key!, {
          body: Buffer.from(command.input.Body as Uint8Array),
          contentType: command.input.ContentType!,
        });
        return {};
      },
    }),
  });
  const fetchRequest: typeof fetch = async (_url, init) => {
    const { sql, params = [] } = JSON.parse(String(init?.body));
    const results = actualDb.prepare(sql).all(...params);
    return new Response(JSON.stringify({ success: true, result: [{ success: true, results }] }));
  };
  const transport = createCloudflareImportTransport({
    expectedWorkerName: target.identity.worker_name,
    accountId: target.identity.account_id,
    apiToken: 'fixture',
    accessKeyId: 'fixture',
    secretAccessKey: 'fixture',
    fetchImpl: fetchRequest,
    bindings: {
      worker_name: target.identity.worker_name,
      d1_database_id: target.resources.d1.id,
      kv_namespace_id: target.resources.kv.id,
      queue_name: target.resources.queue.name,
      r2_bucket_name: target.resources.uploads.name,
    },
    createClient: () => ({
      send: async (command: any) => {
        if (command.input.Prefix) {
          const keys = [...objects.keys()].filter(key => key.startsWith(command.input.Prefix));
          return { Contents: keys.map(Key => ({ Key })), KeyCount: keys.length, IsTruncated: false };
        }
        const object = objects.get(command.input.Key)!;
        return {
          Body: {
            transformToWebStream: () =>
              new ReadableStream({
                start(controller) {
                  controller.enqueue(object.body);
                  controller.close();
                },
              }),
          },
          ContentType: object.contentType,
        };
      },
    }),
  });
  const actualProvider = createCloudflareImportProvider(transport);
  const uploadsBucket = { public: false, urls: [] as string[] };
  const privacyFetch: typeof fetch = async url => {
    uploadsBucket.urls.push(String(url));
    return new Response(
      JSON.stringify({
        success: true,
        result: String(url).endsWith('/managed') ? { enabled: uploadsBucket.public } : { domains: [] },
      }),
    );
  };
  const options: ExecutorOptions = {
    root,
    expectedTarget: target,
    receiptPrivateKey: keys.privateKey,
    receiptPublicKey: keys.publicKey,
    source,
    storage,
    bucket,
    actualProvider,
    apiToken: 'fixture',
    fetchImpl: privacyFetch,
    maxSqlFileBytes: 1024,
    rehearsal: parseMigrationRehearsal({
      schema: 'iori-migration-rehearsal/v1',
      main_sha: target.identity.main_sha,
      measured_at: '2026-09-06T00:00:00Z',
      bytes_per_second: 10_000_000,
      rows_per_second: 10_000,
      files_per_second: 10,
      ogp_per_second: 1,
      d1_capacity_bytes: 10_000_000_000,
    }, target.identity.main_sha),
    availableBytes: async () => 10_000_000_000,
    readTarget: async () => {
      calls.push('target');
    },
    loadFont: async () => {
      for (
        const path of [
          '/System/Library/Fonts/Supplemental/Arial.ttf',
          '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        ]
      ) {
        try {
          await access(path);
          const font = await readFile(path);
          return font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength) as ArrayBuffer;
        } catch {}
      }
      throw new Error('Fixture font missing.');
    },
    render: renderNodeOgImage,
    importD1: input =>
      importMigrationD1({
        ...input,
        apiToken: 'fixture',
        fetchRequest,
        runCommand: async (_program, args) => {
          calls.push('d1');
          actualDb.exec(await readFile(args.at(-1)!, 'utf8'));
          return { stdout: '', stderr: '' };
        },
      }),
  };
  return {
    options,
    source,
    calls,
    remote,
    actualProvider,
    uploadsBucket,
    close: () => {
      sourceDb.close();
      actualDb.close();
    },
  };
};
