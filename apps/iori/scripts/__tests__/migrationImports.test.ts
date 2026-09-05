import type { PutObjectCommand, S3ClientConfig } from '@aws-sdk/client-s3';
import { expect, it, vi } from 'vitest';
import { createMigrationR2Writer } from '../migration-r2-writer.mjs';
import { loadNodeOgFont } from '../../src/adaptor/node/ogImageFont.ts';
import { expectedTargetFixture } from './migrationTargetFixture.js';
it('uses actual S3 metadata with one attempt and rejects oversized bodies before send', async () => {
  const send = vi.fn(async (_command: PutObjectCommand) => ({}));
  const createClient = vi.fn((_config: S3ClientConfig) => ({ send }));
  const writer = createMigrationR2Writer({
    expectedTarget: expectedTargetFixture(),
    accessKeyId: 'fixture',
    secretAccessKey: 'fixture',
    createClient,
  });
  await writer.put('og/11111111-1111-4111-8111-111111111111.png', new Uint8Array([1]), {
    httpMetadata: { contentType: 'image/png', cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { sha256: 'a'.repeat(64) },
  });
  expect(createClient.mock.calls[0]![0]).toMatchObject({ maxAttempts: 1 });
  expect(send.mock.calls[0]![0].input).toMatchObject({
    Bucket: 'iori-production-fixture1-uploads',
    ContentType: 'image/png',
    Metadata: { sha256: 'a'.repeat(64) },
  });
  await expect(
    writer.put('og/x.png', new Uint8Array(33 * 1024 * 1024), {
      httpMetadata: { contentType: 'image/png', cacheControl: '' },
      customMetadata: {},
    }),
  ).rejects.toThrow();
  expect(send).toHaveBeenCalledTimes(1);
});
it('fetches only fixed bounded font URLs with redirects forbidden', async () => {
  const fetchRequest = vi.fn(async (url: string | URL | Request) =>
    new Response(
      String(url).includes('googleapis') ? 'url(https://fonts.gstatic.com/font.ttf)' : new Uint8Array([1, 2]),
    )
  );
  expect((await loadNodeOgFont({ fetchRequest })).byteLength).toBe(2);
  expect(fetchRequest.mock.calls[0]![0]).toBe('https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@700');
  await expect(loadNodeOgFont({ fetchRequest: async () => new Response('x'.repeat(65537)) })).rejects.toThrow();
  await expect(loadNodeOgFont({ fetchRequest: async () => new Response('url(https://evil.test/font.ttf)') })).rejects
    .toThrow();
});
it('converts all files before D1 mutation and checks every empty table before any data file', async () => {
  const { migrationSourceFixture } = await import('./migrationSourceFixture.js');
  const { convertD1Import } = await import('../convert-d1-import.mjs');
  const { importMigrationD1, reviewedD1Schema } = await import('../migration-d1-import.mjs');
  const { join } = await import('node:path');
  const { rm } = await import('node:fs/promises');
  const fixture = await migrationSourceFixture({
    posts: [{ content: 'newline\nquote\';test', postId: '11111111-1111-4111-8111-111111111111' }],
  });
  try {
    await convertD1Import({
      manifestPath: fixture.manifestPath,
      schemaPath: reviewedD1Schema,
      outputDir: join(fixture.root, 'sql'),
    });
    const calls: string[] = [];
    const runCommand = vi.fn(async (_program: string, args: string[]) => {
      calls.push(args.at(-1)!);
      return { stdout: '', stderr: '' };
    });
    const fetchRequest = vi.fn(async () => {
      calls.push('empty');
      return new Response(JSON.stringify({ success: true, result: [{ success: true, results: [{ count: 0 }] }] }));
    });
    await importMigrationD1({
      expectedTarget: expectedTargetFixture(),
      manifestPath: join(fixture.root, 'sql/d1-import-manifest.json'),
      apiToken: 'fixture',
      runCommand,
      fetchRequest,
    });
    expect(calls[0]).toBe(reviewedD1Schema);
    expect(calls.slice(1, 32)).toEqual(Array(31).fill('empty'));
    expect(calls[32]).toContain('d1-import-001.sql');
    calls.length = 0;
    fetchRequest.mockImplementationOnce(async () =>
      new Response(JSON.stringify({ success: true, result: [{ success: true, results: [{ count: 1 }] }] }))
    );
    await expect(
      importMigrationD1({
        expectedTarget: expectedTargetFixture(),
        manifestPath: join(fixture.root, 'sql/d1-import-manifest.json'),
        apiToken: 'fixture',
        runCommand,
        fetchRequest,
      }),
    ).rejects.toThrow();
    expect(calls).toEqual([reviewedD1Schema]);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
it('rejects a source-valid oversized SQL statement without completing conversion', async () => {
  const { migrationSourceFixture } = await import('./migrationSourceFixture.js');
  const { convertD1Import } = await import('../convert-d1-import.mjs');
  const { reviewedD1Schema } = await import('../migration-d1-import.mjs');
  const { join } = await import('node:path');
  const { rm, stat } = await import('node:fs/promises');
  const fixture = await migrationSourceFixture({ posts: [{ content: 'あ'.repeat(34000) }] });
  try {
    await expect(
      convertD1Import({
        manifestPath: fixture.manifestPath,
        schemaPath: reviewedD1Schema,
        outputDir: join(fixture.root, 'sql'),
      }),
    ).rejects.toThrow('100000');
    await expect(stat(join(fixture.root, 'sql/d1-import-manifest.json'))).rejects.toThrow();
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
});
it('streams empty OGP and rejects invalid article title before rendering', async () => {
  const { migrationSourceFixture } = await import('./migrationSourceFixture.js');
  const { importMigrationOgp } = await import('../migration-object-import.mjs');
  const { join } = await import('node:path');
  const { rm, readFile } = await import('node:fs/promises');
  const fixture = await migrationSourceFixture();
  const invalid = await migrationSourceFixture({
    articles: [{ articleId: '11111111-1111-4111-8111-111111111111', status: 'published', title: 'x'.repeat(201) }],
  });
  const generate = vi.fn(async () => Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const bucket = { put: vi.fn(async () => {}) };
  try {
    const result = await importMigrationOgp({
      manifestPath: fixture.manifestPath,
      outputDir: join(fixture.root, 'ogp'),
      bucket,
      generate,
    });
    expect(JSON.parse(await readFile(result.manifestPath, 'utf8'))).toEqual({ objects: [] });
    await expect(
      importMigrationOgp({
        manifestPath: invalid.manifestPath,
        outputDir: join(invalid.root, 'ogp'),
        bucket,
        generate,
      }),
    ).rejects.toThrow();
    expect(generate).not.toHaveBeenCalled();
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
    await rm(invalid.root, { recursive: true, force: true });
  }
});
it('renders with the actual isolated Satori/Sharp implementation and no Pg graph', async () => {
  const { renderNodeOgImage } = await import('../../src/adaptor/node/ogImageRenderer.ts');
  const { access, readFile } = await import('node:fs/promises');
  const { fileURLToPath } = await import('node:url');
  const candidates = [
    '/System/Library/Fonts/Supplemental/Arial.ttf',
    '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
  ];
  let fontPath: string | undefined;
  for (const path of candidates) {
    try {
      await access(path);
      fontPath = path;
      break;
    } catch {}
  }
  if (!fontPath) throw new Error('Local fixture font is required for actual renderer test.');
  const font = await readFile(fontPath);
  const body = await renderNodeOgImage({
    title: 'fixture article',
    fontData: font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength) as ArrayBuffer,
  });
  expect(body.subarray(0, 8)).toEqual(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const source = await readFile(
    fileURLToPath(new URL('../../src/adaptor/node/ogImageRenderer.ts', import.meta.url)),
    'utf8',
  );
  expect(source).not.toMatch(/Pg|scripts\//);
});
