import { describe, expect, it } from 'vitest';
import { publishMigrationBundle } from '../migration-bundle.mjs';
import { createMigrationR2Storage } from '../migration-r2-storage.mjs';

describe('migration bundle boundary', () => {
  it('rejects unsafe remote namespace before transport access', async () => {
    await expect(publishMigrationBundle({ environment: '../production' } as any)).rejects.toThrow('Migration bundle');
  });
  it('requires explicit credentials', () => {
    expect(() => createMigrationR2Storage({ accountId: 'a'.repeat(32), bucket: 'private' } as any)).toThrow();
  });
});

import { cp, link, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { exportPostgres } from '../export-postgres.mjs';
import { convertD1Import } from '../convert-d1-import.mjs';
import { restoreMigrationBundle } from '../migration-bundle.mjs';
import { assertMigrationBucketPrivate } from '../migration-r2-storage.mjs';
import { validateProtectedMigrationEvidence } from '../run-protected-migration.mjs';
import { directories, receiptKeys, roots, validContract } from './migrationBundleFixture.js';

const checksum = (body: Buffer) => createHash('sha256').update(body).digest('hex');
const temp = async () => {
  const dir = await mkdtemp(join(await realpath(tmpdir()), 'iori-bundle-'));
  directories.push(dir);
  return dir;
};
const fixture = async () => {
  const data = await temp();
  await exportPostgres({
    connectionString: 'postgres://fixture.invalid/iori',
    outputDir: data,
    queueDrained: true,
    createClient: async () => ({
      connect: async () => {},
      end: async () => {},
      query: async (sql: string) => ({
        rows: sql.includes('FROM "actors"')
          ? [{
            row: {
              actorId: '11111111-1111-4111-8111-111111111111',
              uri: 'https://fixture.invalid/' + 'x'.repeat(1024),
              inboxUrl: 'https://fixture.invalid/inbox',
              type: 'Person',
            },
          }]
          : [],
      }),
    }),
  });
  await convertD1Import({
    manifestPath: join(data, 'export-manifest.json'),
    outputDir: data,
    schemaPath: new URL('../../drizzle-d1/0000_boring_xavin.sql', import.meta.url).pathname,
  });
  const contract = await validContract({
    postgres_export_manifest: JSON.parse(await readFile(join(data, 'export-manifest.json'), 'utf8')),
    d1_import_manifest: JSON.parse(await readFile(join(data, 'd1-import-manifest.json'), 'utf8')),
  });
  const root = roots.get(contract)!;
  await cp(data, root, { recursive: true });
  await writeFile(join(root, 'contract.json'), JSON.stringify(contract), { mode: 0o600 });
  const objects = new Map<string, Buffer>();
  const reads: string[] = [];
  const storage = {
    assertPrivate: async () => {},
    putNew: async (key: string, body: Buffer) => {
      if (objects.has(key)) throw new Error('exists');
      objects.set(key, Buffer.from(body));
    },
    get: async (key: string) => {
      reads.push(key);
      if (!objects.has(key)) throw new Error('missing');
      return Buffer.from(objects.get(key)!);
    },
  };
  const options = {
    root,
    contractPath: 'contract.json',
    environment: 'production' as const,
    expectedMainSha: contract.main_sha,
    expectedRunId: contract.run_id,
    receiptPublicKey: receiptKeys.publicKey,
    storage,
    chunkSize: 256,
  };
  const prefix = `iori-migration/v1/production/${contract.main_sha}/${contract.run_id}`;
  return { options, objects, prefix, reads, contract };
};

describe('portable signed bundle', () => {
  it('round trips generated v3 evidence, zero-byte tables and multi-chunk SQL without unrelated files', async () => {
    const { options, objects, prefix, contract } = await fixture();
    await writeFile(join(options.root, 'private-key.pem'), 'unrelated', { mode: 0o600 });
    const published = await publishMigrationBundle(options);
    const index = JSON.parse(objects.get(`${prefix}/index`)!.toString());
    expect(index.files.some((f: any) => f.size === 0)).toBe(true);
    expect(index.files.some((f: any) => f.path.endsWith('.sql') && f.parts.length > 1)).toBe(true);
    expect(index.files.some((f: any) => f.path.includes('private-key'))).toBe(false);
    const root = await temp();
    expect(await restoreMigrationBundle({ ...options, root })).toEqual({
      status: 'restored',
      fileCount: published.fileCount,
    });
    for (const f of index.files) {
      expect(await readFile(join(root, f.path))).toEqual(await readFile(join(options.root, f.path)));
    }
    await expect(validateProtectedMigrationEvidence(contract, { ...options, root })).resolves.toBeTruthy();
    await expect(publishMigrationBundle(options)).rejects.toThrow();
  }, 15000);
  it('keeps failed reservation without publishing completion and refuses retries', async () => {
    const { options, objects, prefix } = await fixture();
    const original = options.storage.putNew;
    options.storage.putNew = async (key, body) => {
      if (key.includes('/parts/')) throw new Error('interrupted');
      await original(key, body);
    };
    await expect(publishMigrationBundle(options)).rejects.toThrow();
    expect(objects.has(`${prefix}/reservation`)).toBe(true);
    expect(objects.has(`${prefix}/complete`)).toBe(false);
    options.storage.putNew = original;
    await expect(publishMigrationBundle(options)).rejects.toThrow();
  });
  it.each(['missing', 'truncated', 'tampered'])('rejects %s remote parts', async (mode) => {
    const { options, objects } = await fixture();
    await publishMigrationBundle(options);
    const key = [...objects.keys()].find((key) => key.includes('/parts/'))!;
    const original = objects.get(key)!;
    if (mode === 'missing') objects.delete(key);
    else if (mode === 'truncated') objects.set(key, original.subarray(1));
    else objects.set(key, Buffer.alloc(original.length));
    await expect(restoreMigrationBundle({ ...options, root: await temp() })).rejects.toThrow();
  });
  it('checks storage before downloading parts', async () => {
    const { options, reads } = await fixture();
    await publishMigrationBundle(options);
    reads.length = 0;
    await expect(restoreMigrationBundle({ ...options, root: await temp(), availableBytes: async () => 0n })).rejects
      .toThrow();
    expect(reads.every((key) => !key.includes('/parts/'))).toBe(true);
  });
  it.each(['environment', 'mainSha', 'runId', 'path', 'extra'])('rejects forged index %s', async (kind) => {
    const { options, objects, prefix } = await fixture();
    await publishMigrationBundle(options);
    const index = JSON.parse(objects.get(`${prefix}/index`)!.toString());
    if (kind === 'path') index.files[0].path = '../escape';
    else if (kind === 'extra') {
      index.files.push({ path: 'unrelated.cfg', size: 0, sha256: checksum(Buffer.alloc(0)), parts: [] });
    } else index[kind] = 'wrong';
    const body = Buffer.from(JSON.stringify(index));
    objects.set(`${prefix}/index`, body);
    objects.set(
      `${prefix}/complete`,
      Buffer.from(JSON.stringify({ schema: 'iori-migration-complete/v1', sha256: checksum(body) })),
    );
    await expect(restoreMigrationBundle({ ...options, root: await temp() })).rejects.toThrow();
  });
  it.each(['symlink', 'hardlink', 'missing', 'changed'])('rejects %s local file', async (kind) => {
    const { options } = await fixture();
    const path = join(options.root, 'd1-import-001.sql');
    if (kind === 'changed') await writeFile(path, 'tampered');
    else {
      const copy = join(await temp(), 'sql');
      await cp(path, copy);
      await rm(path);
      if (kind === 'symlink') await symlink(copy, path);
      if (kind === 'hardlink') await link(copy, path);
    }
    await expect(publishMigrationBundle(options)).rejects.toThrow();
  });
});

describe('official SDK adapter', () => {
  it('uses explicit R2 endpoint, credentials, conditional Put and bounded Get', async () => {
    const commands: any[] = [];
    let config: any;
    const storage = createMigrationR2Storage({
      accountId: 'a'.repeat(32),
      bucket: 'migration-private',
      accessKeyId: 'fixture-key',
      secretAccessKey: 'fixture-secret',
      createClient: (value: any) => {
        config = value;
        return {
          send: async (command: any) => {
            commands.push(command);
            return { Body: Buffer.from('abc') };
          },
        };
      },
    });
    await storage.putNew('key', Buffer.from('abc'));
    expect(await storage.get('key', 3)).toEqual(Buffer.from('abc'));
    expect(config.endpoint).toBe(`https://${'a'.repeat(32)}.r2.cloudflarestorage.com`);
    expect(config.region).toBe('auto');
    expect(config.credentials).toEqual({ accessKeyId: 'fixture-key', secretAccessKey: 'fixture-secret' });
    expect(commands[0].constructor.name).toBe('PutObjectCommand');
    expect(commands[0].input).toMatchObject({
      Bucket: 'migration-private',
      Key: 'key',
      IfNoneMatch: '*',
      ContentLength: 3,
    });
    expect(commands[1].constructor.name).toBe('GetObjectCommand');
    await expect(storage.get('key', 2)).rejects.toThrow('Migration storage read failed.');
  });
  it.each([true, false])('fails closed when public access enabled=%s', async (enabled) => {
    const input = {
      accountId: 'a'.repeat(32),
      bucket: 'migration-private',
      apiToken: 'fixture-token',
      fetchImpl: async (url: string) => ({
        ok: true,
        json: async () => ({ success: true, result: url.endsWith('/managed') ? { enabled } : { domains: [] } }),
      }),
    };
    if (enabled) await expect(assertMigrationBucketPrivate(input as any)).rejects.toThrow();
    else await expect(assertMigrationBucketPrivate(input as any)).resolves.toBeUndefined();
  });
});

describe('additional bundle failure boundaries', () => {
  it('rejects missing complete marker and incomplete file inventory', async () => {
    const { options, objects, prefix } = await fixture();
    await publishMigrationBundle(options);
    const complete = objects.get(`${prefix}/complete`)!;
    objects.delete(`${prefix}/complete`);
    await expect(restoreMigrationBundle({ ...options, root: await temp() })).rejects.toThrow();
    objects.set(`${prefix}/complete`, complete);
    const index = JSON.parse(objects.get(`${prefix}/index`)!.toString());
    index.files = index.files.filter((file: any) => !file.path.endsWith('.ndjson'));
    const bytes = Buffer.from(JSON.stringify(index));
    objects.set(`${prefix}/index`, bytes);
    objects.set(
      `${prefix}/complete`,
      Buffer.from(JSON.stringify({ schema: 'iori-migration-complete/v1', sha256: checksum(bytes) })),
    );
    await expect(restoreMigrationBundle({ ...options, root: await temp() })).rejects.toThrow();
  });
  it('requires successful privacy preflight before reservation', async () => {
    const { options, objects } = await fixture();
    options.storage.assertPrivate = async () => {
      throw new Error('public');
    };
    await expect(publishMigrationBundle(options)).rejects.toThrow();
    expect(objects.size).toBe(0);
  });
  it('permits Get with read-only credentials and blocks Put', async () => {
    const storage = createMigrationR2Storage({
      accountId: 'a'.repeat(32),
      bucket: 'migration-private',
      accessKeyId: 'read-only-fixture',
      secretAccessKey: 'fixture',
      readOnly: true,
      createClient: () => ({ send: async () => ({ Body: Buffer.from('abc') }) }),
    });
    expect(await storage.get('key', 3)).toEqual(Buffer.from('abc'));
    await expect(storage.putNew('key', Buffer.from('abc'))).rejects.toThrow();
  });
  it.each([{ domains: [{ enabled: true }] }, {}, { domains: [{}] }])(
    'rejects public or malformed custom domain response',
    async (custom) => {
      await expect(
        assertMigrationBucketPrivate({
          accountId: 'a'.repeat(32),
          bucket: 'migration-private',
          apiToken: 'fixture',
          fetchImpl: (async (url: string) => ({
            ok: true,
            json: async () => ({ success: true, result: url.endsWith('/managed') ? { enabled: false } : custom }),
          })) as any,
        }),
      ).rejects.toThrow();
    },
  );
});

for (const operation of [publishMigrationBundle, restoreMigrationBundle]) {
  describe(`${operation.name} invocation types`, () => {
    for (const field of ['expectedMainSha', 'expectedRunId']) {
      it.each([undefined, null, 42, { toString: () => field === 'expectedMainSha' ? 'a'.repeat(40) : 'run-001' }])(
        `rejects non-string ${field} before local or remote access (%s)`,
        async (invalid) => {
          let localAccesses = 0;
          let remoteAccesses = 0;
          const options = {
            environment: 'production',
            expectedMainSha: 'a'.repeat(40),
            expectedRunId: 'run-001',
            contractPath: 'contract.json',
            [field]: invalid,
            get root() {
              localAccesses += 1;
              return '/invalid-fixture-root';
            },
            storage: {
              assertPrivate: async () => {
                remoteAccesses += 1;
              },
              putNew: async () => {
                remoteAccesses += 1;
              },
              get: async () => {
                remoteAccesses += 1;
                return Buffer.alloc(0);
              },
            },
          };
          await expect(operation(options as any)).rejects.toThrow('Migration bundle');
          expect(localAccesses).toBe(0);
          expect(remoteAccesses).toBe(0);
        },
      );
    }
  });
}
