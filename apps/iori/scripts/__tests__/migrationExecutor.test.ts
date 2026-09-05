import { createHash, generateKeyPairSync } from 'node:crypto';
import { access, cp, mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, expect, it, vi } from 'vitest';
import {
  executeProtectedMigration,
  executionReservationKey,
  type ExecutorOptions,
} from '../execute-protected-migration.mjs';
import { expectedTargetFixture, preparationFixture } from './migrationTargetFixture.js';
import { preparationRecordKey, serializePreparationRecord } from '../migration-target-contract.mjs';
import { APPLICATION_TABLE_ORDER, exportPostgres } from '../export-postgres.mjs';
import { SOURCE_LIMITS, type SourceInventory } from '../source-transfer-protocol.mjs';
import { importMigrationD1, reviewedD1Schema } from '../migration-d1-import.mjs';
import { createCloudflareImportTransport } from '../cloudflare-import-provider.mjs';
import {
  createCloudflareImportProvider,
  createManifestExpectedProvider,
  verifyCloudflareImportWithProviders,
} from '../verify-cloudflare-import.mjs';
import { restoreMigrationBundle } from '../migration-bundle.mjs';
import { createMigrationR2Writer } from '../migration-r2-writer.mjs';
import { renderNodeOgImage } from '../../src/adaptor/node/ogImageRenderer.ts';
import { parseMigrationRehearsal } from '../migration-budget.mjs';
const roots: string[] = [];
const directory = async () => {
  const root = await mkdtemp(join(await realpath(tmpdir()), 'iori-executor-'));
  roots.push(root);
  return root;
};
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
const fixture = async () => {
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
      calls.push(key.endsWith('execution-reservation') ? 'reserve' : 'publish');
      if (remote.has(key)) throw new Error('collision');
      remote.set(key, Buffer.from(body));
    },
    get: async (key: string) => {
      if (!remote.has(key)) throw new Error('missing');
      return Buffer.from(remote.get(key)!);
    },
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
  const options: ExecutorOptions = {
    root,
    expectedTarget: target,
    receiptPrivateKey: keys.privateKey,
    receiptPublicKey: keys.publicKey,
    source,
    storage,
    bucket,
    actualProvider,
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
    close: () => {
      sourceDb.close();
      actualDb.close();
    },
  };
};
it('executes real export/conversion/SQL/S3/OGP/signatures and restores all files for fresh verification', async () => {
  const f = await fixture();
  try {
    await expect(executeProtectedMigration(f.options)).resolves.toMatchObject({ status: 'published' });
    expect(f.calls.indexOf('reserve')).toBeLessThan(f.calls.indexOf('freeze'));
    const fresh = await directory();
    await restoreMigrationBundle({
      expectedTarget: f.options.expectedTarget,
      environment: 'production',
      expectedMainSha: 'a'.repeat(40),
      expectedRunId: 'production-run-001',
      receiptPublicKey: f.options.receiptPublicKey,
      storage: f.options.storage,
      root: fresh,
      contractPath: 'contract.json',
    });
    const original = await readFile(join(f.options.root, 'contract.json'));
    expect(await readFile(join(fresh, 'contract.json'))).toEqual(original);
    const contract = JSON.parse(original.toString());
    const manifest = (name: string) =>
      join(fresh, contract.phases.find((phase: any) => phase.artifacts[name]).artifacts[name].path);
    expect(JSON.parse(await readFile(manifest('d1_import_manifest'), 'utf8')).files.length).toBeGreaterThan(1);
    for (const table of APPLICATION_TABLE_ORDER) await access(join(fresh, `source/export/${table}.ndjson`));
    const expectedProvider = createManifestExpectedProvider({
      exportManifestPath: manifest('postgres_export_manifest'),
      d1ImportManifestPath: manifest('d1_import_manifest'),
      uploadManifestPath: manifest('r2_import_manifest'),
      ogpManifestPath: manifest('ogp_import_manifest'),
    });
    expect(await verifyCloudflareImportWithProviders({ expectedProvider, actualProvider: f.actualProvider })).toEqual(
      [],
    );
  } finally {
    f.close();
  }
}, 30000);
it('rejects metadata preflight before reservation/freeze and post-drain growth before export', async () => {
  const f = await fixture();
  try {
    f.source.estimate.mockResolvedValueOnce({ ...await f.source.estimate(), upload_count: 99000 });
    await expect(executeProtectedMigration(f.options)).rejects.toThrow('metadata');
    expect(f.source.freeze).not.toHaveBeenCalled();
    expect(f.remote.has(executionReservationKey(f.options.expectedTarget))).toBe(false);
  } finally {
    f.close();
  }
  const g = await fixture();
  try {
    const estimate = await g.source.estimate();
    g.source.estimate.mockResolvedValueOnce(estimate).mockResolvedValueOnce({ ...estimate, upload_count: 99000 });
    await expect(executeProtectedMigration(g.options)).rejects.toThrow('metadata');
    expect(g.calls).toContain('freeze');
    expect(g.calls).not.toContain('export');
    expect(g.remote.has(executionReservationKey(g.options.expectedTarget))).toBe(true);
  } finally {
    g.close();
  }
});
it('rejects a consumed execution ID and missing expected target without source mutation', async () => {
  const f = await fixture();
  try {
    await expect(executeProtectedMigration({ ...f.options, expectedTarget: undefined as any })).rejects.toThrow();
    expect(f.calls).toEqual([]);
    f.remote.set(executionReservationKey(f.options.expectedTarget), Buffer.from('reserved'));
    await expect(executeProtectedMigration(f.options)).rejects.toThrow('collision');
    expect(f.source.freeze).not.toHaveBeenCalled();
  } finally {
    f.close();
  }
});
it('retains reservation and partial evidence after an uncertain D1 mutation, without later receipts', async () => {
  const f = await fixture();
  try {
    await expect(executeProtectedMigration({
      ...f.options,
      importD1: async () => {
        throw new Error('uncertain');
      },
    })).rejects.toThrow();
    expect(f.calls).toContain('freeze');
    expect(f.remote.has(executionReservationKey(f.options.expectedTarget))).toBe(true);
    await access(join(f.options.root, 'evidence/export-postgres.json'));
    await expect(access(join(f.options.root, 'evidence/convert-and-import-d1.json'))).rejects.toThrow();
    await expect(access(join(f.options.root, 'contract.json'))).rejects.toThrow();
    expect([...f.remote.keys()].some(key => key.endsWith('/complete'))).toBe(false);
  } finally {
    f.close();
  }
});
it('rejects already-aborted execution before storage/source operations', async () => {
  const f = await fixture();
  try {
    await expect(executeProtectedMigration({ ...f.options, signal: AbortSignal.abort() })).rejects.toThrow();
    expect(f.calls).toEqual([]);
  } finally {
    f.close();
  }
});
