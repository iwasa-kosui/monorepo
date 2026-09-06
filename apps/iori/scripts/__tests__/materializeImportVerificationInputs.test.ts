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
    });

    expect(await readFile(join(directory, 'articles.ndjson'), 'utf8')).toBe(articles);
    expect((await stat(join(directory, 'articles.ndjson'))).mode & 0o777).toBe(0o600);
    expect(inputs).not.toHaveProperty('importRunnerPath');
    await expect(stat(join(directory, 'import-runner.mjs'))).rejects.toThrow();
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
    })).resolves.toMatchObject({ exportManifestPath: expect.any(String) });
  });
  it('rejects executable and unreferenced data files', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'iori-import-contract-'));
    await expect(materializeImportVerificationInputs({
      directory,
      exportManifestJson: JSON.stringify({ tables: { articles: { file: 'articles.ndjson' } } }),
      d1ImportManifestJson: '{}',
      r2ImportManifestJson: '{}',
      ogpImportManifestJson: '{"objects":[]}',
      exportDataFilesJson: JSON.stringify({ 'articles.ndjson': '', 'payload.mjs': 'throw new Error();' }),
    })).rejects.toThrow('Protected export data-file contract is incomplete.');
  });
});
