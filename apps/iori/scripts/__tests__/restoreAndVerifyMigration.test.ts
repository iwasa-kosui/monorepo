import { createHash } from 'node:crypto';
import { chmod, cp, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { convertD1Import } from '../convert-d1-import.mjs';
import { exportPostgres } from '../export-postgres.mjs';
import { publishMigrationBundle } from '../migration-bundle.mjs';
import { serializePreparationRecord } from '../migration-target-contract.mjs';
import { restoreAndVerifyMigration } from '../restore-and-verify-migration.mjs';
import { directories, receiptKeys, roots, validContract } from './migrationBundleFixture.js';
import { expectedTargetFixture, preparationFixture, targetSummaryFixture } from './migrationTargetFixture.js';

const held = vi.hoisted(() => ({ storage: undefined as any }));
vi.mock('../migration-r2-storage.mjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../migration-r2-storage.mjs')>()),
  createMigrationR2Storage: () => held.storage,
}));
vi.mock('../cloudflare-import-provider.mjs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../cloudflare-import-provider.mjs')>()),
  createCloudflareImportTransport: () =>
    new Proxy({}, {
      get: (_target, property) =>
        property === 'then' ? undefined : () => {
          throw new Error('unexpected Cloudflare access');
        },
    }),
}));
vi.mock('../read-sealed-migration-target.mjs', () => ({
  readSealedMigrationTarget: async () => ({ resources: {}, worker: {} }),
}));

const d1Id = '11111111-1111-4111-8111-111111111111';
const postImageRow = (imageId: string, url: string) => ({
  imageId,
  postId: '22222222-2222-4222-8222-222222222222',
  url,
  createdAt: '2026-01-02T03:04:05.000Z',
});
const temp = async () => {
  const dir = await mkdtemp(join(await realpath(tmpdir()), 'iori-restore-verify-'));
  directories.push(dir);
  return dir;
};
const sha256 = (body: Buffer) => createHash('sha256').update(body).digest('hex');

const setup = async (url: string) => {
  const data = join(await temp(), 'data');
  let table = '';
  let sent = false;
  await exportPostgres({
    outputDir: data,
    createClient: async () => ({
      connect: async () => {},
      end: async () => {},
      query: async (sql: string) => {
        if (sql.startsWith('DECLARE')) {
          table = /FROM "([a-z_]+)" AS row/.exec(sql)![1]!;
          sent = false;
        }
        if (sql.startsWith('FETCH') && table === 'post_images' && !sent) {
          sent = true;
          return { rows: [{ row: postImageRow('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', url) }] };
        }
        return { rows: [] };
      },
    }),
  });
  await convertD1Import({
    manifestPath: join(data, 'export-manifest.json'),
    outputDir: data,
    schemaPath: new URL('../../drizzle-d1/0000_boring_xavin.sql', import.meta.url).pathname,
  });

  const target = expectedTargetFixture();
  target.resources.d1.id = d1Id;
  const record = preparationFixture();
  record.resources.d1.id = d1Id;
  const summary = targetSummaryFixture();
  summary.resources.d1.id = d1Id;
  summary.preparation.record.resources.d1.id = d1Id;
  summary.preparation.record_sha256 = sha256(serializePreparationRecord(record));

  const contract = await validContract({
    postgres_export_manifest: JSON.parse(await readFile(join(data, 'export-manifest.json'), 'utf8')),
    d1_import_manifest: JSON.parse(await readFile(join(data, 'd1-import-manifest.json'), 'utf8')),
    terraform_target_summary: summary,
  });
  const bundleRoot = roots.get(contract)!;
  await cp(data, bundleRoot, { recursive: true });
  await writeFile(join(bundleRoot, 'contract.json'), JSON.stringify(contract), { mode: 0o600 });

  const objects = new Map<string, Buffer>();
  held.storage = {
    assertPrivate: async () => {},
    putNew: async (key: string, body: Buffer) => {
      if (objects.has(key)) throw new Error('exists');
      objects.set(key, Buffer.from(body));
    },
    get: async (key: string) => {
      if (!objects.has(key)) throw new Error('missing');
      return Buffer.from(objects.get(key)!);
    },
  };
  await publishMigrationBundle({
    root: bundleRoot,
    contractPath: 'contract.json',
    environment: 'production',
    expectedMainSha: contract.main_sha,
    expectedRunId: contract.run_id,
    receiptPublicKey: receiptKeys.publicKey,
    expectedTarget: target,
    storage: held.storage,
    chunkSize: 256,
  } as any);

  const inputs = await temp();
  const targetPath = join(inputs, 'expected-target.json');
  await writeFile(targetPath, JSON.stringify(target), { mode: 0o600 });
  const publicKey = Buffer.from(receiptKeys.publicKey.export({ type: 'spki', format: 'pem' }));
  const keyPath = join(inputs, 'receipt-public-key.pem');
  await writeFile(keyPath, publicKey, { mode: 0o600 });
  const restoreRoot = await temp();
  await chmod(restoreRoot, 0o700);
  const env = {
    IORI_MIGRATION_EXPECTED_TARGET_PATH: targetPath,
    MAIN_SHA: target.identity.main_sha,
    IORI_MIGRATION_RUN_ID: target.identity.run_id,
    IORI_MIGRATION_ROOT: restoreRoot,
    IORI_MIGRATION_RECEIPT_PUBLIC_KEY_PATH: keyPath,
    IORI_MIGRATION_RECEIPT_PUBLIC_KEY_SHA256: sha256(publicKey),
    CLOUDFLARE_API_TOKEN: 'fixture',
    CLOUDFLARE_ZONE_ID: 'b'.repeat(32),
    IORI_APPLICATION_R2_ACCESS_KEY_ID: 'fixture',
    IORI_APPLICATION_R2_SECRET_ACCESS_KEY: 'fixture',
    IORI_MIGRATION_R2_ACCESS_KEY_ID: 'fixture',
    IORI_MIGRATION_R2_SECRET_ACCESS_KEY: 'fixture',
  };
  return { env };
};

describe('restoreAndVerifyMigration', () => {
  it('rejects a post image URL that points at the sealed target origin', async () => {
    const { env } = await setup('https://blog.test/uploads/77777777-7777-4777-8777-777777777777.webp');
    await expect(restoreAndVerifyMigration({ env, signal: new AbortController().signal }))
      .rejects.toThrow('upload-same-origin');
  }, 30_000);

  it('rejects a post image URL that uses a legacy upload path', async () => {
    const { env } = await setup('/static/uploads/77777777-7777-4777-8777-777777777777.webp');
    await expect(restoreAndVerifyMigration({ env, signal: new AbortController().signal }))
      .rejects.toThrow('upload-legacy-path');
  }, 30_000);
});
