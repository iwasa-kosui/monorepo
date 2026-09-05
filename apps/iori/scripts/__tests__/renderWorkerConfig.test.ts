import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { renderWorkerConfig } from '../render-worker-config.mjs';

const execFileAsync = promisify(execFile);

const values = {
  __WORKER_NAME__: 'iori-fixture',
  __ACCOUNT_ID__: '00000000-0000-4000-8000-000000000001',
  __D1_DATABASE_ID__: '00000000-0000-4000-8000-000000000002',
  __KV_NAMESPACE_ID__: '00000000-0000-4000-8000-000000000003',
  __R2_BUCKET_NAME__: 'iori-uploads-fixture',
  __QUEUE_NAME__: 'iori-fedify-fixture',
  __ORIGIN__: 'https://iori.example.invalid',
  __VAPID_SUBJECT__: 'mailto:admin@example.invalid',
};

const template =
  `// Keep this JSONC comment.\n{\n  "name": "__WORKER_NAME__",\n  "account_id": "__ACCOUNT_ID__",\n  "database_id": "__D1_DATABASE_ID__",\n  "namespace_id": "__KV_NAMESPACE_ID__",\n  "bucket_name": "__R2_BUCKET_NAME__",\n  "queue": "__QUEUE_NAME__",\n  "origin": "__ORIGIN__",\n  "subject": "__VAPID_SUBJECT__",\n}\n`;

describe('renderWorkerConfig', () => {
  it('replaces every fixture token while preserving JSONC content', () => {
    const result = renderWorkerConfig({ template, values });

    expect(result).toContain('// Keep this JSONC comment.');
    for (const [token, value] of Object.entries(values)) {
      expect(result).not.toContain(token);
      expect(result).toContain(value);
    }
  });

  it('rejects unresolved or missing token values', () => {
    expect(() =>
      renderWorkerConfig({
        template,
        values: { ...values, __QUEUE_NAME__: undefined as unknown as string },
      })
    ).toThrow('__QUEUE_NAME__');
    expect(() => renderWorkerConfig({ template: `${template}\n// __UNKNOWN__`, values })).toThrow('__UNKNOWN__');
  });

  it('rejects newline-containing values', () => {
    expect(() =>
      renderWorkerConfig({
        template,
        values: { ...values, __ORIGIN__: 'https://iori.example.invalid\nleak' },
      })
    ).toThrow('__ORIGIN__');
  });

  it('writes a mode 0600 config and prints only its path', async () => {
    const outputDirectory = await mkdtemp(join(tmpdir(), 'iori-render-test-'));
    const script = new URL('../render-worker-config.mjs', import.meta.url).pathname;
    const { stdout, stderr } = await execFileAsync(process.execPath, [
      script,
      '--output-dir',
      outputDirectory,
      '--template',
      new URL('../../workers/iori/wrangler.template.jsonc', import.meta.url).pathname,
      '--values',
      JSON.stringify(values),
    ]);
    const outputPath = stdout.trim();

    expect(stderr).toBe('');
    expect(outputPath).toMatch(new RegExp(`^${outputDirectory}/wrangler\\.jsonc$`));
    expect(stdout).not.toContain(values.__ACCOUNT_ID__);
    expect((await stat(outputPath)).mode & 0o777).toBe(0o600);
    expect(await readFile(outputPath, 'utf8')).toContain(values.__ACCOUNT_ID__);
  });
});
