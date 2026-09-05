import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';
import { convertD1Import } from '../convert-d1-import.mjs';
import { APPLICATION_TABLE_ORDER, exportPostgres } from '../export-postgres.mjs';
import { backfillPublishedOgpImages, createWranglerBucket, importR2Uploads } from '../import-r2-uploads.mjs';
import {
  createCloudflareActualProvider,
  createCloudflareImportProvider,
  createManifestExpectedProvider,
  runVerificationCli,
  verifyCloudflareImport,
  verifyCloudflareImportWithProviders,
} from '../verify-cloudflare-import.mjs';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const sqliteSchema = join(appRoot, 'drizzle-d1/0000_boring_xavin.sql');
const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

const temporaryDirectory = async (): Promise<string> => {
  const directory = await realpath(await mkdtemp(join(tmpdir(), 'iori-data-migration-fixture-')));
  temporaryDirectories.push(directory);
  return directory;
};

const writeFixtureManifest = async (directory: string): Promise<string> => {
  const rows = {
    actors: [{
      actorId: '11111111-1111-4111-8111-111111111111',
      uri: 'https://fixture.invalid/actors/one',
      inboxUrl: 'https://fixture.invalid/inbox/one',
      type: 'Person',
    }],
    domain_events: [{
      eventId: '44444444-4444-4444-8444-444444444444',
      aggregateId: '22222222-2222-4222-8222-222222222222',
      aggregateName: 'post',
      aggregateState: '{"z":2,"a":1}',
      eventName: 'post.created',
      eventPayload: '{"nested":{"z":2,"a":1}}',
      occurredAt: '2026-01-02T03:04:05.000Z',
    }],
    articles: [{
      articleId: '55555555-5555-4555-8555-555555555555',
      status: 'published',
      title: 'fixture article',
    }],
    posts: [{
      postId: '22222222-2222-4222-8222-222222222222',
      actorId: '11111111-1111-4111-8111-111111111111',
      content: 'O\'Reilly fixture',
      createdAt: '2026-01-02T03:04:05.000Z',
      metadata: { b: 2, a: 1 },
      type: 'note',
    }],
    post_images: [{
      imageId: '33333333-3333-4333-8333-333333333333',
      postId: '22222222-2222-4222-8222-222222222222',
      url: '/uploads/33333333-3333-4333-8333-333333333333.webp',
      createdAt: '2026-01-02T03:04:05.000Z',
    }],
  } as const;
  const tables: Record<string, { file: string; count: number; checksum: string }> = {};
  for (const table of APPLICATION_TABLE_ORDER) {
    const file = `${table}.ndjson`;
    const ndjson = (rows[table as keyof typeof rows] ?? []).map((row) => JSON.stringify(row)).join('\n');
    const contents = ndjson.length === 0 ? '' : `${ndjson}\n`;
    await writeFile(join(directory, file), contents, { encoding: 'utf8', mode: 0o600 });
    tables[table] = {
      file,
      count: rows[table as keyof typeof rows]?.length ?? 0,
      checksum: createHash('sha256').update(contents).digest('hex'),
    };
  }

  const manifestPath = join(directory, 'export-manifest.json');
  await writeFile(
    manifestPath,
    JSON.stringify({
      schemaVersion: 1,
      complete: true,
      tables,
    }),
    { encoding: 'utf8', mode: 0o600 },
  );
  return manifestPath;
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, {
        force: true,
        recursive: true,
      })
    ),
  );
});

describe('Cloudflare data migration tooling', () => {
  it('converts anonymized NDJSON deterministically in foreign-key order', async () => {
    const fixtureDirectory = await temporaryDirectory();
    const firstOutputDirectory = await temporaryDirectory();
    const secondOutputDirectory = await temporaryDirectory();
    const manifestPath = await writeFixtureManifest(fixtureDirectory);

    const firstFiles = await convertD1Import({
      manifestPath,
      schemaPath: sqliteSchema,
      outputDir: firstOutputDirectory,
      maxFileBytes: 512,
    });
    const secondFiles = await convertD1Import({
      manifestPath,
      schemaPath: sqliteSchema,
      outputDir: secondOutputDirectory,
      maxFileBytes: 512,
    });

    expect(firstFiles.length).toBeGreaterThan(1);
    expect(firstFiles.map((file) => file.split('/').at(-1))).toEqual(
      firstFiles.map((_, index) => `d1-import-${String(index + 1).padStart(3, '0')}.sql`),
    );
    const firstSql = await Promise.all(firstFiles.map((file) => readFile(file, 'utf8')));
    const secondSql = await Promise.all(secondFiles.map((file) => readFile(file, 'utf8')));
    expect(firstSql).toEqual(secondSql);
    expect(firstSql.join('\n')).toContain('INSERT INTO "actors"');
    expect(firstSql.join('\n')).toContain('INSERT INTO "posts"');
    expect(firstSql.join('\n')).toContain('INSERT INTO "post_images"');
    expect(firstSql.join('\n').indexOf('INSERT INTO "actors"')).toBeLessThan(
      firstSql.join('\n').indexOf('INSERT INTO "posts"'),
    );
    expect(firstSql.join('\n')).toContain('\'O\'\'Reilly fixture\'');
    expect(firstSql.join('\n')).toContain('1767323045000');
    expect(firstSql.join('\n')).toContain('\'{"a":1,"b":2}\'');
    expect(firstSql.join('\n')).toContain('\'{"a":1,"z":2}\'');
    expect(firstSql.join('\n')).toContain('\'{"nested":{"a":1,"z":2}}\'');
    expect(firstSql.join('\n')).toContain('\'22222222-2222-4222-8222-222222222222\'');
    await Promise.all(firstFiles.map(async (file) => {
      expect((await stat(file)).size).toBeLessThanOrEqual(512);
    }));
  });

  it('rejects an oversized SQL row without creating an oversized import file', async () => {
    const fixtureDirectory = await temporaryDirectory();
    const outputDirectory = await temporaryDirectory();
    const manifestPath = await writeFixtureManifest(fixtureDirectory);

    await expect(convertD1Import({
      manifestPath,
      schemaPath: sqliteSchema,
      outputDir: outputDirectory,
      maxFileBytes: 20,
    })).rejects.toThrow('row exceeds');
    expect((await readdir(outputDirectory)).filter((file) => file.endsWith('.sql'))).toEqual([]);
  });

  it.each([
    ['incomplete', (manifest: { complete: boolean }) => {
      manifest.complete = false;
    }],
    ['count mismatch', (manifest: { tables: Record<string, { count: number }> }) => {
      manifest.tables.posts.count += 1;
    }],
    ['checksum mismatch', (manifest: { tables: Record<string, { checksum: string }> }) => {
      manifest.tables.posts.checksum = '0000000000000000000000000000000000000000000000000000000000000000';
    }],
  ])('rejects an export manifest with %s metadata', async (_name, mutate) => {
    const fixtureDirectory = await temporaryDirectory();
    const outputDirectory = await temporaryDirectory();
    const manifestPath = await writeFixtureManifest(fixtureDirectory);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    mutate(manifest);
    await writeFile(manifestPath, JSON.stringify(manifest));

    await expect(convertD1Import({
      manifestPath,
      schemaPath: sqliteSchema,
      outputDir: outputDirectory,
    })).rejects.toThrow(/complete|count|checksum/);
  });

  it('rejects an export manifest that references a missing table file', async () => {
    const fixtureDirectory = await temporaryDirectory();
    const outputDirectory = await temporaryDirectory();
    const manifestPath = await writeFixtureManifest(fixtureDirectory);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.tables.posts.file = 'missing-posts.ndjson';
    await writeFile(manifestPath, JSON.stringify(manifest));

    await expect(convertD1Import({
      manifestPath,
      schemaPath: sqliteSchema,
      outputDir: outputDirectory,
    })).rejects.toThrow(/missing|read|ENOENT/i);
  });

  it('rejects rows that are not in canonical order instead of buffering a table', async () => {
    const fixtureDirectory = await temporaryDirectory();
    const outputDirectory = await temporaryDirectory();
    const manifestPath = await writeFixtureManifest(fixtureDirectory);
    const rows = [
      { postId: '33333333-3333-4333-8333-333333333333', actorId: 'fixture', content: 'later', type: 'note' },
      { postId: '22222222-2222-4222-8222-222222222222', actorId: 'fixture', content: 'first', type: 'note' },
    ];
    const contents = `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
    await writeFile(join(fixtureDirectory, 'posts.ndjson'), contents);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.tables.posts = {
      file: 'posts.ndjson',
      count: rows.length,
      checksum: createHash('sha256').update(contents).digest('hex'),
    };
    await writeFile(manifestPath, JSON.stringify(manifest));

    await expect(convertD1Import({
      manifestPath,
      schemaPath: sqliteSchema,
      outputDir: outputDirectory,
    })).rejects.toThrow(/canonical order/);
  });

  it('converts a large canonical NDJSON stream with bounded passes', async () => {
    const fixtureDirectory = await temporaryDirectory();
    const outputDirectory = await temporaryDirectory();
    const manifestPath = await writeFixtureManifest(fixtureDirectory);
    const rows = Array.from({ length: 2048 }, (_, index) => ({
      postId: `post-${String(index).padStart(5, '0')}`,
      actorId: 'fixture-actor',
      content: `fixture-${String(index).padStart(5, '0')}`,
      type: 'note',
    }));
    const contents = `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
    await writeFile(join(fixtureDirectory, 'posts.ndjson'), contents);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.tables.posts = {
      file: 'posts.ndjson',
      count: rows.length,
      checksum: createHash('sha256').update(contents).digest('hex'),
    };
    await writeFile(manifestPath, JSON.stringify(manifest));

    await convertD1Import({ manifestPath, schemaPath: sqliteSchema, outputDir: outputDirectory });
    const d1ImportManifest = JSON.parse(await readFile(join(outputDirectory, 'd1-import-manifest.json'), 'utf8'));
    expect(d1ImportManifest.tables.posts.count).toBe(rows.length);
  });

  it('rejects repository output directories before accessing PostgreSQL or writing SQL', async () => {
    const fixtureDirectory = await temporaryDirectory();
    const manifestPath = await writeFixtureManifest(fixtureDirectory);

    await expect(exportPostgres({
      connectionString: 'postgres://fixture.invalid/iori',
      outputDir: appRoot,
    })).rejects.toThrow('outside the repository');
    await expect(convertD1Import({
      manifestPath,
      schemaPath: sqliteSchema,
      outputDir: join(appRoot, 'temporary-migration-output'),
    })).rejects.toThrow('outside the repository');
  });

  it('writes an external PostgreSQL export through an injected fixture client', async () => {
    const outputDirectory = await temporaryDirectory();
    let ended = false;
    const manifest = await exportPostgres({
      connectionString: 'postgres://fixture.invalid/iori',
      outputDir: outputDirectory,
      queueDrained: true,
      now: () => new Date('2026-01-02T03:04:05.000Z'),
      createClient: async () => ({
        connect: async () => undefined,
        end: async () => {
          ended = true;
        },
        query: async (sql) =>
          sql.includes('FROM "actors"')
            ? { rows: [{ row: { actorId: '11111111-1111-4111-8111-111111111111', type: 'Person' } }] }
            : { rows: [] },
      }),
    });

    expect(manifest.complete).toBe(true);
    expect(manifest.tables.actors.count).toBe(1);
    expect(await readFile(join(outputDirectory, 'actors.ndjson'), 'utf8')).toContain('"actorId"');
    expect(JSON.parse(await readFile(join(outputDirectory, 'export-manifest.json'), 'utf8'))).toMatchObject({
      complete: true,
      exportedAt: '2026-01-02T03:04:05.000Z',
    });
    expect(ended).toBe(true);
  });

  it('verifies transformed table checksums from an external D1 manifest', async () => {
    const exportDirectory = await temporaryDirectory();
    const importDirectory = await temporaryDirectory();
    const rows = [
      {
        postId: '22222222-2222-4222-8222-222222222222',
        actorId: '11111111-1111-4111-8111-111111111111',
        content: 'fixture',
        createdAt: '2026-01-02T12:04:05+09:00',
        metadata: { b: 2, a: 1 },
        type: 'note',
      },
      {
        postId: '33333333-3333-4333-8333-333333333333',
        actorId: '11111111-1111-4111-8111-111111111111',
        content: 'fixture',
        createdAt: '2026-01-02T03:04:05.000Z',
        metadata: { a: 1, b: 2 },
        type: 'note',
      },
    ];
    const manifest = await exportPostgres({
      connectionString: 'postgres://fixture.invalid/iori',
      outputDir: exportDirectory,
      queueDrained: true,
      createClient: async () => ({
        connect: async () => undefined,
        end: async () => undefined,
        query: async (sql) =>
          sql.includes('FROM "posts"')
            ? { rows: rows.map((row) => ({ row })) }
            : { rows: [] },
      }),
    });
    expect(manifest.tables.posts.count).toBe(2);

    await convertD1Import({
      manifestPath: join(exportDirectory, 'export-manifest.json'),
      schemaPath: sqliteSchema,
      outputDir: importDirectory,
    });
    const d1ImportManifestPath = join(importDirectory, 'd1-import-manifest.json');
    const d1ImportManifest = JSON.parse(await readFile(d1ImportManifestPath, 'utf8'));
    const expectedProvider = createManifestExpectedProvider({
      exportManifestPath: join(exportDirectory, 'export-manifest.json'),
      d1ImportManifestPath,
    });
    const actualProvider = createCloudflareImportProvider({
      getTableSummaries: async (tableNames) =>
        Object.fromEntries(
          tableNames.map((table) => [table, d1ImportManifest.tables?.[table] ?? { count: 0 }]),
        ),
      getObject: async () => null,
      listObjects: async () => ({ keys: [] }),
    });

    await expect(verifyCloudflareImportWithProviders({ expectedProvider, actualProvider })).resolves.toEqual([]);

    const runnerPath = join(importDirectory, 'runner.mjs');
    await writeFile(
      runnerPath,
      `export const getTableSummaries = async () => (${JSON.stringify(d1ImportManifest.tables)});\n`
        + 'export const getObject = async () => null;\n'
        + 'export const listObjects = async () => ({ keys: [] });\n',
      { mode: 0o600 },
    );
    const verifyScript = new URL('../verify-cloudflare-import.mjs', import.meta.url).pathname;
    const { stderr, stdout } = await execFileAsync(process.execPath, [verifyScript], {
      env: {
        PATH: process.env.PATH,
        TMPDIR: tmpdir(),
        IORI_EXPORT_MANIFEST: join(exportDirectory, 'export-manifest.json'),
        IORI_D1_IMPORT_MANIFEST: d1ImportManifestPath,
        IORI_IMPORT_RUNNER: runnerPath,
      },
    });
    expect(stdout).toBe('');
    expect(stderr).toBe('');
  });

  it('rejects expected state when the raw export file changes after conversion', async () => {
    const fixtureDirectory = await temporaryDirectory();
    const d1Directory = await temporaryDirectory();
    const manifestPath = await writeFixtureManifest(fixtureDirectory);
    await convertD1Import({ manifestPath, schemaPath: sqliteSchema, outputDir: d1Directory });
    await writeFile(
      join(fixtureDirectory, 'posts.ndjson'),
      `${await readFile(join(fixtureDirectory, 'posts.ndjson'), 'utf8')}\n`,
    );
    const uploadManifestPath = join(fixtureDirectory, 'r2-import-manifest.json');
    const ogpManifestPath = join(fixtureDirectory, 'ogp-import-manifest.json');
    await writeFile(
      uploadManifestPath,
      JSON.stringify({
        objects: [{
          key: 'post-images/33333333-3333-4333-8333-333333333333/original',
          checksum: 'a'.repeat(64),
          contentType: 'image/webp',
        }],
      }),
    );
    await writeFile(
      ogpManifestPath,
      JSON.stringify({
        objects: [{
          key: 'og/55555555-5555-4555-8555-555555555555.png',
          checksum: 'b'.repeat(64),
          contentType: 'image/png',
        }],
      }),
    );

    await expect(
      createManifestExpectedProvider({
        exportManifestPath: manifestPath,
        d1ImportManifestPath: join(d1Directory, 'd1-import-manifest.json'),
        uploadManifestPath,
        ogpManifestPath,
      }).loadExpected(),
    ).rejects.toThrow(/checksum/);
  });

  it('rejects expected state when a transformed D1 checksum changes', async () => {
    const fixtureDirectory = await temporaryDirectory();
    const d1Directory = await temporaryDirectory();
    const manifestPath = await writeFixtureManifest(fixtureDirectory);
    await convertD1Import({ manifestPath, schemaPath: sqliteSchema, outputDir: d1Directory });
    const d1ManifestPath = join(d1Directory, 'd1-import-manifest.json');
    const d1Manifest = JSON.parse(await readFile(d1ManifestPath, 'utf8'));
    d1Manifest.tables.posts.checksum = '0000000000000000000000000000000000000000000000000000000000000000';
    await writeFile(d1ManifestPath, JSON.stringify(d1Manifest));
    const uploadManifestPath = join(fixtureDirectory, 'r2-import-manifest.json');
    const ogpManifestPath = join(fixtureDirectory, 'ogp-import-manifest.json');
    await writeFile(
      uploadManifestPath,
      JSON.stringify({
        objects: [{
          key: 'post-images/33333333-3333-4333-8333-333333333333/original',
          checksum: 'a'.repeat(64),
          contentType: 'image/webp',
        }],
      }),
    );
    await writeFile(
      ogpManifestPath,
      JSON.stringify({
        objects: [{
          key: 'og/55555555-5555-4555-8555-555555555555.png',
          checksum: 'b'.repeat(64),
          contentType: 'image/png',
        }],
      }),
    );

    await expect(
      createManifestExpectedProvider({
        exportManifestPath: manifestPath,
        d1ImportManifestPath: d1ManifestPath,
        uploadManifestPath,
        ogpManifestPath,
      }).loadExpected(),
    ).rejects.toThrow(/canonical|checksum/i);
  });

  it('rejects an external symlink that resolves into the repository', async () => {
    const fixtureDirectory = await temporaryDirectory();
    const linkedDirectory = join(fixtureDirectory, 'linked-output');
    await symlink(appRoot, linkedDirectory);

    await expect(exportPostgres({
      connectionString: 'postgres://fixture.invalid/iori',
      outputDir: join(linkedDirectory, 'data'),
    })).rejects.toThrow('symlink');
  });

  it('imports referenced uploads with stable R2 keys and rejects missing files', async () => {
    const fixtureDirectory = await temporaryDirectory();
    const uploadDirectory = join(fixtureDirectory, 'uploads');
    const outputDirectory = await temporaryDirectory();
    await mkdir(uploadDirectory);
    const image = new Uint8Array([1, 2, 3, 4]);
    await writeFile(join(uploadDirectory, '33333333-3333-4333-8333-333333333333.webp'), image);
    const manifestPath = await writeFixtureManifest(fixtureDirectory);
    const puts: Array<{ key: string; contentType?: string; body: Uint8Array; checksum?: string }> = [];

    const result = await importR2Uploads({
      sourceDir: uploadDirectory,
      bucket: {
        put: async (key, body, options) => {
          puts.push({
            key,
            body: new Uint8Array(body),
            contentType: options.httpMetadata?.contentType,
            checksum: options.customMetadata?.sha256,
          });
        },
      },
      manifestPath,
      outputDir: outputDirectory,
    });

    expect(puts).toEqual([{
      key: 'post-images/33333333-3333-4333-8333-333333333333/original',
      body: image,
      contentType: 'image/webp',
      checksum: createHash('sha256').update(image).digest('hex'),
    }]);
    expect(result.objects[0]).toMatchObject({
      key: 'post-images/33333333-3333-4333-8333-333333333333/original',
      contentType: 'image/webp',
      checksum: createHash('sha256').update(image).digest('hex'),
    });
    expect(puts[0]).toMatchObject({
      checksum: createHash('sha256').update(image).digest('hex'),
    });
    expect(JSON.parse(await readFile(join(outputDirectory, 'r2-import-manifest.json'), 'utf8'))).toMatchObject({
      objects: [result.objects[0]],
    });
    await rm(join(uploadDirectory, '33333333-3333-4333-8333-333333333333.webp'));
    await expect(importR2Uploads({
      sourceDir: uploadDirectory,
      bucket: { put: async () => undefined },
      manifestPath,
      outputDir: outputDirectory,
    })).rejects.toThrow('Referenced upload is missing');
  });

  it('rejects symlinked upload files and unsafe post-image manifest paths', async () => {
    const fixtureDirectory = await temporaryDirectory();
    const uploadDirectory = join(fixtureDirectory, 'uploads');
    await mkdir(uploadDirectory);
    const manifestPath = await writeFixtureManifest(fixtureDirectory);
    const uploadPath = join(uploadDirectory, '33333333-3333-4333-8333-333333333333.webp');
    await symlink(join(appRoot, 'package.json'), uploadPath);

    await expect(importR2Uploads({
      sourceDir: uploadDirectory,
      bucket: { put: async () => undefined },
      manifestPath,
      outputDir: await temporaryDirectory(),
    })).rejects.toThrow(/symlink/i);

    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.tables.post_images.file = '../../package.json';
    await writeFile(manifestPath, JSON.stringify(manifest));
    await rm(uploadPath);
    await expect(importR2Uploads({
      sourceDir: uploadDirectory,
      bucket: { put: async () => undefined },
      manifestPath,
      outputDir: await temporaryDirectory(),
    })).rejects.toThrow(/file reference is invalid/i);
  });

  it('rejects a symlinked post-image export file', async () => {
    const fixtureDirectory = await temporaryDirectory();
    const uploadDirectory = join(fixtureDirectory, 'uploads');
    await mkdir(uploadDirectory);
    const manifestPath = await writeFixtureManifest(fixtureDirectory);
    const postImagesPath = join(fixtureDirectory, 'post_images.ndjson');
    await rm(postImagesPath);
    await symlink(join(appRoot, 'package.json'), postImagesPath);

    await expect(importR2Uploads({
      sourceDir: uploadDirectory,
      bucket: { put: async () => undefined },
      manifestPath,
      outputDir: await temporaryDirectory(),
    })).rejects.toThrow(/symlink/i);
  });

  it('rejects legacy upload paths that are not UUID image files', async () => {
    const fixtureDirectory = await temporaryDirectory();
    const uploadDirectory = join(fixtureDirectory, 'uploads');
    await mkdir(uploadDirectory);
    const manifestPath = await writeFixtureManifest(fixtureDirectory);
    const invalidUploadContents = `${
      JSON.stringify({
        imageId: 'not-a-uuid',
        postId: '22222222-2222-4222-8222-222222222222',
        url: '/uploads/not-an-image.txt',
      })
    }\n`;
    await writeFile(join(fixtureDirectory, 'post_images.ndjson'), invalidUploadContents);
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    manifest.tables.post_images.count = 1;
    manifest.tables.post_images.checksum = createHash('sha256').update(invalidUploadContents).digest('hex');
    await writeFile(manifestPath, JSON.stringify(manifest));

    await expect(importR2Uploads({
      sourceDir: uploadDirectory,
      bucket: { put: async () => undefined },
      manifestPath,
      outputDir: await temporaryDirectory(),
    })).rejects.toThrow('invalid legacy upload');
  });

  it('backfills only published OGP PNG objects through the offline pipeline boundary', async () => {
    const outputDirectory = await temporaryDirectory();
    const uploaded: Array<{ key: string; contentType?: string }> = [];
    const result = await backfillPublishedOgpImages({
      articles: [
        { articleId: '55555555-5555-4555-8555-555555555555', status: 'published', title: 'fixture' },
        { articleId: '66666666-6666-4666-8666-666666666666', status: 'draft', title: 'ignored' },
      ],
      bucket: {
        put: async (key, _body, options) => uploaded.push({ key, contentType: options.httpMetadata?.contentType }),
      },
      generate: async () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
      outputDir: outputDirectory,
    });

    expect(uploaded).toEqual([{ key: 'og/55555555-5555-4555-8555-555555555555.png', contentType: 'image/png' }]);
    expect(result.objects).toHaveLength(1);
    expect(JSON.parse(await readFile(join(outputDirectory, 'ogp-import-manifest.json'), 'utf8'))).toMatchObject({
      objects: result.objects,
    });
  });

  it('writes an empty complete OGP manifest when no articles are published', async () => {
    const outputDirectory = await temporaryDirectory();
    const result = await backfillPublishedOgpImages({
      articles: [{ articleId: '66666666-6666-4666-8666-666666666666', status: 'draft', title: 'ignored' }],
      bucket: {
        put: async () => {
          throw new Error('must not write');
        },
      },
      generate: async () => {
        throw new Error('must not generate');
      },
      outputDir: outputDirectory,
    });
    expect(result.objects).toEqual([]);
    expect(JSON.parse(await readFile(join(outputDirectory, 'ogp-import-manifest.json'), 'utf8'))).toEqual({
      objects: [],
    });
  });

  it('rejects non-PNG bytes from the offline OGP pipeline', async () => {
    await expect(backfillPublishedOgpImages({
      articles: [{ articleId: '55555555-5555-4555-8555-555555555555', status: 'published', title: 'fixture' }],
      bucket: { put: async () => undefined },
      generate: async () => new TextEncoder().encode('<svg/>'),
      outputDir: await temporaryDirectory(),
    })).rejects.toThrow('valid PNG');
  });

  it('runs Wrangler with metadata sidecar and HTTP metadata for an upload', async () => {
    const invocations: Array<{ command: string; args: readonly string[] }> = [];
    const bucket = createWranglerBucket('fixture-bucket', {
      executeFile: async (command, args) => {
        invocations.push({ command, args });
      },
    });
    await bucket.put('post-images/fixture/original', new Uint8Array([1]), {
      httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=60' },
      customMetadata: { imageId: 'fixture', sha256: 'fixture-checksum' },
    });

    expect(invocations).toHaveLength(2);
    expect(invocations[0]).toMatchObject({
      command: 'wrangler',
      args: expect.arrayContaining([
        'fixture-bucket/post-images/fixture/original',
        '--content-type',
        'image/webp',
        '--cache-control',
        'public, max-age=60',
      ]),
    });
    expect(invocations[1]).toMatchObject({
      command: 'wrangler',
      args: expect.arrayContaining([
        'fixture-bucket/post-images/fixture/original.metadata.json',
        '--content-type',
        'application/json',
        '--cache-control',
        'private, max-age=0',
      ]),
    });
  });

  it('reports only redacted table, upload, and OGP mismatches', () => {
    expect(verifyCloudflareImport({
      expected: {
        tables: { posts: { count: 2, checksum: 'expected-checksum' } },
        r2Keys: ['post-images/fixture/original'],
        ogpKeys: ['og/fixture.png'],
      },
      actual: {
        tables: { posts: { count: 1, checksum: 'actual-checksum' } },
        r2Keys: [],
        ogpKeys: [],
      },
    })).toEqual([
      'table=posts expected=2 actual=1',
      'table=posts checksum=mismatch',
      'r2=missing count=1',
      'ogp=missing count=1',
    ]);
  });

  it('reports extra actual keys for legacy key-only expected state', () => {
    expect(verifyCloudflareImport({
      expected: { tables: {}, r2Keys: ['post-images/expected/original'], ogpKeys: [] },
      actual: { tables: {}, r2Keys: ['post-images/expected/original', 'post-images/extra/original'], ogpKeys: [] },
    })).toEqual(['r2=missing count=1']);
  });

  it('builds expected state from manifests and fetches redacted actual state through providers', async () => {
    const fixtureDirectory = await temporaryDirectory();
    const manifestPath = await writeFixtureManifest(fixtureDirectory);
    const d1Directory = await temporaryDirectory();
    await convertD1Import({ manifestPath, schemaPath: sqliteSchema, outputDir: d1Directory });
    const d1ImportManifest = JSON.parse(await readFile(join(d1Directory, 'd1-import-manifest.json'), 'utf8'));
    const uploadManifestPath = join(fixtureDirectory, 'r2-import-manifest.json');
    const ogpManifestPath = join(fixtureDirectory, 'ogp-import-manifest.json');
    const image = new Uint8Array([1, 2, 3, 4]);
    await writeFile(
      uploadManifestPath,
      JSON.stringify({
        objects: [{
          key: 'post-images/33333333-3333-4333-8333-333333333333/original',
          checksum: createHash('sha256').update(image).digest('hex'),
          contentType: 'image/webp',
        }],
      }),
    );
    await writeFile(
      ogpManifestPath,
      JSON.stringify({
        objects: [{
          key: 'og/55555555-5555-4555-8555-555555555555.png',
          checksum: 'b'.repeat(64),
          contentType: 'image/png',
        }],
      }),
    );
    const expectedProvider = createManifestExpectedProvider({
      exportManifestPath: manifestPath,
      d1ImportManifestPath: join(d1Directory, 'd1-import-manifest.json'),
      uploadManifestPath,
      ogpManifestPath,
    });
    const actualProvider = createCloudflareImportProvider({
      getTableSummaries: async (tables) =>
        Object.fromEntries(tables.map((table) => [table, d1ImportManifest.tables[table]])),
      getObject: async (key) =>
        key.startsWith('post-images')
          ? {
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(image);
                controller.close();
              },
            }),
            httpMetadata: { contentType: 'image/webp' },
          }
          : null,
      listObjects: async (prefix) =>
        prefix.startsWith('post-images')
          ? { keys: ['post-images/33333333-3333-4333-8333-333333333333/original'] }
          : { keys: [] },
    });

    await expect(verifyCloudflareImportWithProviders({ expectedProvider, actualProvider })).resolves.toEqual([
      'ogp=missing count=1',
    ]);
  });

  it('fails closed when expected import artifacts are missing', async () => {
    const fixtureDirectory = await temporaryDirectory();
    const d1Directory = await temporaryDirectory();
    const manifestPath = await writeFixtureManifest(fixtureDirectory);
    await convertD1Import({ manifestPath, schemaPath: sqliteSchema, outputDir: d1Directory });

    await expect(
      createManifestExpectedProvider({
        exportManifestPath: manifestPath,
        d1ImportManifestPath: join(d1Directory, 'd1-import-manifest.json'),
      }).loadExpected(),
    ).rejects.toThrow(/upload|OGP|manifest/i);
  });

  it('rejects an upload manifest without required checksum metadata', async () => {
    const fixtureDirectory = await temporaryDirectory();
    const d1Directory = await temporaryDirectory();
    const manifestPath = await writeFixtureManifest(fixtureDirectory);
    await convertD1Import({ manifestPath, schemaPath: sqliteSchema, outputDir: d1Directory });
    const uploadManifestPath = join(fixtureDirectory, 'r2-import-manifest.json');
    const ogpManifestPath = join(fixtureDirectory, 'ogp-import-manifest.json');
    await writeFile(
      uploadManifestPath,
      JSON.stringify({
        objects: [{
          key: 'post-images/33333333-3333-4333-8333-333333333333/original',
          contentType: 'image/webp',
        }],
      }),
    );
    await writeFile(
      ogpManifestPath,
      JSON.stringify({
        objects: [{
          key: 'og/55555555-5555-4555-8555-555555555555.png',
          checksum: 'b'.repeat(64),
          contentType: 'image/png',
        }],
      }),
    );

    await expect(
      createManifestExpectedProvider({
        exportManifestPath: manifestPath,
        d1ImportManifestPath: join(d1Directory, 'd1-import-manifest.json'),
        uploadManifestPath,
        ogpManifestPath,
      }).loadExpected(),
    ).rejects.toThrow(/R2 upload manifest object metadata/);
  });

  it('rejects an OGP manifest with an unexpected key', async () => {
    const fixtureDirectory = await temporaryDirectory();
    const d1Directory = await temporaryDirectory();
    const manifestPath = await writeFixtureManifest(fixtureDirectory);
    await convertD1Import({ manifestPath, schemaPath: sqliteSchema, outputDir: d1Directory });
    const uploadManifestPath = join(fixtureDirectory, 'r2-import-manifest.json');
    const ogpManifestPath = join(fixtureDirectory, 'ogp-import-manifest.json');
    await writeFile(
      uploadManifestPath,
      JSON.stringify({
        objects: [{
          key: 'post-images/33333333-3333-4333-8333-333333333333/original',
          checksum: 'a'.repeat(64),
          contentType: 'image/webp',
        }],
      }),
    );
    await writeFile(
      ogpManifestPath,
      JSON.stringify({
        objects: [{
          key: 'og/unexpected.png',
          checksum: 'b'.repeat(64),
          contentType: 'image/png',
        }],
      }),
    );

    await expect(
      createManifestExpectedProvider({
        exportManifestPath: manifestPath,
        d1ImportManifestPath: join(d1Directory, 'd1-import-manifest.json'),
        uploadManifestPath,
        ogpManifestPath,
      }).loadExpected(),
    ).rejects.toThrow(/unexpected object/);
  });

  it('rejects duplicate R2 keys even when the manifest count matches', async () => {
    const fixtureDirectory = await temporaryDirectory();
    const d1Directory = await temporaryDirectory();
    const manifestPath = await writeFixtureManifest(fixtureDirectory);
    const postImages = [
      {
        imageId: '33333333-3333-4333-8333-333333333333',
        postId: '22222222-2222-4222-8222-222222222222',
        url: '/uploads/33333333-3333-4333-8333-333333333333.webp',
        createdAt: '2026-01-02T03:04:05.000Z',
      },
      {
        imageId: '44444444-4444-4444-8444-444444444444',
        postId: '22222222-2222-4222-8222-222222222222',
        url: '/uploads/44444444-4444-4444-8444-444444444444.webp',
        createdAt: '2026-01-02T03:04:05.000Z',
      },
    ];
    const postImageContents = `${postImages.map((row) => JSON.stringify(row)).join('\n')}\n`;
    await writeFile(join(fixtureDirectory, 'post_images.ndjson'), postImageContents);
    const exportManifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    exportManifest.tables.post_images = {
      file: 'post_images.ndjson',
      count: postImages.length,
      checksum: createHash('sha256').update(postImageContents).digest('hex'),
    };
    await writeFile(manifestPath, JSON.stringify(exportManifest));
    await convertD1Import({ manifestPath, schemaPath: sqliteSchema, outputDir: d1Directory });
    const uploadManifestPath = join(fixtureDirectory, 'r2-import-manifest.json');
    const ogpManifestPath = join(fixtureDirectory, 'ogp-import-manifest.json');
    const duplicateUpload = {
      key: 'post-images/33333333-3333-4333-8333-333333333333/original',
      checksum: 'a'.repeat(64),
      contentType: 'image/webp',
    };
    await writeFile(uploadManifestPath, JSON.stringify({ objects: [duplicateUpload, duplicateUpload] }));
    await writeFile(
      ogpManifestPath,
      JSON.stringify({
        objects: [{
          key: 'og/55555555-5555-4555-8555-555555555555.png',
          checksum: 'b'.repeat(64),
          contentType: 'image/png',
        }],
      }),
    );

    await expect(
      createManifestExpectedProvider({
        exportManifestPath: manifestPath,
        d1ImportManifestPath: join(d1Directory, 'd1-import-manifest.json'),
        uploadManifestPath,
        ogpManifestPath,
      }).loadExpected(),
    ).rejects.toThrow(/duplicate keys/);
  });

  it('emits only redacted CLI verification output from repository-owned providers', async () => {
    const output: string[] = [];
    const exitCode = await runVerificationCli({
      expectedProvider: {
        loadExpected: async () => ({
          tables: { posts: { count: 1, checksum: 'fixture-checksum' } },
          r2Objects: [{ key: 'post-images/private-fixture/original', checksum: 'fixture-object' }],
          ogpObjects: [],
        }),
      },
      actualProvider: {
        loadActual: async () => ({
          tables: { posts: { count: 0, checksum: 'different-fixture-checksum' } },
          r2Objects: [],
          ogpObjects: [],
        }),
      },
      write: (line) => output.push(line),
    });

    expect(exitCode).toBe(1);
    expect(output).toEqual([
      'table=posts expected=1 actual=0',
      'table=posts checksum=mismatch',
      'r2=missing count=1',
    ]);
    expect(output.join('\n')).not.toContain('private-fixture');
  });

  it('bounds concurrent R2 and OGP object verification and hashes streamed bodies', async () => {
    let active = 0;
    let maximumActive = 0;
    const objects = Array.from({ length: 24 }, (_, index) => ({
      key: `post-images/fixture-${String(index).padStart(2, '0')}/original`,
      checksum: createHash('sha256').update(`body-${index}`).digest('hex'),
      contentType: 'image/webp',
    }));
    const ogpObjects = Array.from({ length: 24 }, (_, index) => ({
      key: `og/fixture-${String(index).padStart(2, '0')}.png`,
      checksum: createHash('sha256').update(`body-${index}`).digest('hex'),
      contentType: 'image/png',
    }));
    const provider = createCloudflareActualProvider({
      d1: { getTableSummaries: async () => ({}) },
      r2: {
        get: async (key) => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          await new Promise((resolve) => setTimeout(resolve, 1));
          active -= 1;
          const index = Number(key.match(/fixture-(\d+)/)?.[1]);
          return {
            body: new ReadableStream({
              start(controller) {
                controller.enqueue(new TextEncoder().encode(`body-`));
                controller.enqueue(new TextEncoder().encode(`${index}`));
                controller.close();
              },
            }),
            httpMetadata: { contentType: key.startsWith('og/') ? 'image/png' : 'image/webp' },
          };
        },
        listObjects: async (prefix) =>
          prefix === 'post-images/'
            ? { keys: objects.map((object) => object.key) }
            : { keys: ogpObjects.map((object) => object.key) },
      },
    });

    const actual = await provider.loadActual({ tables: {}, r2Objects: objects, ogpObjects });

    expect(maximumActive).toBeLessThanOrEqual(4);
    expect(actual.r2Objects).toEqual(objects);
    expect(actual.ogpObjects).toEqual(ogpObjects);
  });

  it('hashes an arrayBuffer-only body once', async () => {
    const key = 'post-images/array-buffer/original';
    const body = new Uint8Array([1, 2, 3]);
    let arrayBufferCalls = 0;
    const provider = createCloudflareActualProvider({
      d1: { getTableSummaries: async () => ({}) },
      r2: {
        get: async () => ({
          body: {
            arrayBuffer: async () => {
              arrayBufferCalls += 1;
              return body.buffer as ArrayBuffer;
            },
          },
          httpMetadata: { contentType: 'image/webp' },
        }),
        listObjects: async (prefix) => prefix === 'post-images/' ? { keys: [key] } : { keys: [] },
      },
    });
    const actual = await provider.loadActual({
      tables: {},
      r2Objects: [{
        key,
        checksum: createHash('sha256').update(body).digest('hex'),
        contentType: 'image/webp',
      }],
      ogpObjects: [],
    });

    expect(arrayBufferCalls).toBe(1);
    expect(actual.r2Objects).toEqual([{
      key,
      checksum: createHash('sha256').update(body).digest('hex'),
      contentType: 'image/webp',
    }]);
  });

  it('reports actual objects that are outside the expected exact key set', async () => {
    const expectedKey = 'post-images/expected/original';
    const unexpectedKey = 'post-images/unexpected/original';
    const unexpectedSidecarKey = `${unexpectedKey}.metadata.json`;
    const body = new Uint8Array([4, 5, 6]);
    const expectedObjects = [{
      key: expectedKey,
      checksum: createHash('sha256').update(body).digest('hex'),
      contentType: 'image/webp',
    }];
    const provider = createCloudflareActualProvider({
      d1: { getTableSummaries: async () => ({}) },
      r2: {
        get: async () => ({ body, httpMetadata: { contentType: 'image/webp' } }),
        listObjects: async (prefix) =>
          prefix === 'post-images/'
            ? { keys: [expectedKey, `${expectedKey}.metadata.json`, unexpectedKey, unexpectedSidecarKey] }
            : { keys: [] },
      },
    });
    const actual = await provider.loadActual({ tables: {}, r2Objects: expectedObjects, ogpObjects: [] });

    expect(verifyCloudflareImport({
      expected: { tables: {}, r2Objects: expectedObjects, ogpObjects: [] },
      actual,
    })).toEqual(['r2=missing count=2']);
  });
});
