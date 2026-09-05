import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { materializeImportVerificationInputs } from '../materialize-import-verification-inputs.mjs';

describe('materializeImportVerificationInputs', () => {
  it('materializes every export file referenced by the private manifest for a hosted runner', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'iori-import-contract-'));
    const articles = '{"articleId":"fixture","status":"published"}\n';
    const inputs = await materializeImportVerificationInputs({
      directory,
      exportManifestJson: JSON.stringify({ tables: { articles: { file: 'articles.ndjson' } } }),
      d1ImportManifestJson: JSON.stringify({ tables: {} }),
      r2ImportManifestJson: JSON.stringify({ objects: [] }),
      ogpImportManifestJson: JSON.stringify({
        objects: [{ key: 'og/fixture.png', contentType: 'image/png', checksum: 'fixture-checksum' }],
      }),
      exportDataFilesJson: JSON.stringify({ 'articles.ndjson': articles }),
      importRunnerSource:
        'export const getObject = async () => null; export const listObjects = async () => ({ keys: [] }); export const getTableSummaries = async () => ({});',
    });

    expect(await readFile(join(directory, 'articles.ndjson'), 'utf8')).toBe(articles);
    expect((await stat(join(directory, 'articles.ndjson'))).mode & 0o777).toBe(0o600);
    expect((await stat(inputs.importRunnerPath)).mode & 0o777).toBe(0o700);
  });

  it('rejects a manifest reference missing from the protected data-file contract', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'iori-import-contract-'));

    await expect(materializeImportVerificationInputs({
      directory,
      exportManifestJson: JSON.stringify({ tables: { articles: { file: 'articles.ndjson' } } }),
      d1ImportManifestJson: JSON.stringify({ tables: {} }),
      r2ImportManifestJson: JSON.stringify({ objects: [] }),
      ogpImportManifestJson: JSON.stringify({ objects: [] }),
      exportDataFilesJson: JSON.stringify({}),
      importRunnerSource:
        'export const getObject = async () => null; export const listObjects = async () => ({ keys: [] }); export const getTableSummaries = async () => ({});',
    })).rejects.toThrow('Protected export data-file contract is incomplete.');
  });

  it('allows an empty OGP manifest when no article is published', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'iori-import-contract-'));

    await expect(materializeImportVerificationInputs({
      directory,
      exportManifestJson: JSON.stringify({ tables: { articles: { file: 'articles.ndjson' } } }),
      d1ImportManifestJson: JSON.stringify({ tables: {} }),
      r2ImportManifestJson: JSON.stringify({ objects: [] }),
      ogpImportManifestJson: JSON.stringify({ objects: [] }),
      exportDataFilesJson: JSON.stringify({ 'articles.ndjson': '{"articleId":"fixture","status":"draft"}\n' }),
      importRunnerSource:
        'export const getObject = async () => null; export const listObjects = async () => ({ keys: [] }); export const getTableSummaries = async () => ({});',
    })).resolves.toMatchObject({ importRunnerPath: expect.any(String) });
  });
});
