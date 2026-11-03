import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { admissionFixture } from '../../src/testing/admissionFixture.ts';
import { createDeploymentWorkerConfig } from '../temporary-worker-config.mjs';

const readAppFile = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const stripJsonc = (source: string) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
    .replace(/,\s*([}\]])/g, '$1');

const parseJsonc = (source: string) => JSON.parse(stripJsonc(source)) as { assets: { run_worker_first: unknown } };

const matchesPattern = (pattern: string, path: string) =>
  new RegExp(`^${pattern.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`).test(path);

const route = (rules: readonly string[], path: string) => {
  if (rules.some((rule) => rule.startsWith('!') && matchesPattern(rule.slice(1), path))) return 'assets';
  if (rules.some((rule) => !rule.startsWith('!') && matchesPattern(rule, path))) return 'worker';
  return 'assets';
};

const workerPaths = [
  '/',
  '/api/v1/home',
  '/uploads/x.png',
  '/api/og/articles/x',
  '/users/kosui',
  '/.well-known/webfinger',
  '/inbox',
  '/health',
  '/readyz',
  '/sw.js',
];
const assetPaths = [
  '/static/home.js',
  '/static/chunks/x-abc.js',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
];

const expectRouting = (rules: unknown) => {
  expect(Array.isArray(rules)).toBe(true);
  const list = rules as string[];
  for (const path of workerPaths) expect(route(list, path), path).toBe('worker');
  for (const path of assetPaths) expect(route(list, path), path).toBe('assets');
};

const fixtureEnvironment = {
  ...admissionFixture('iori.example.invalid'),
  IORI_ADMISSION_MODE: 'sealed',
  WORKER_NAME: 'iori-production-fixture1',
  ACCOUNT_ID: '00000000-0000-4000-8000-000000000001',
  D1_DATABASE_ID: '00000000-0000-4000-8000-000000000002',
  KV_NAMESPACE_ID: '00000000000000000000000000000003',
  R2_BUCKET_NAME: 'iori-uploads-fixture',
  QUEUE_NAME: 'iori-fedify-fixture',
  ORIGIN: 'https://iori.example.invalid',
  VAPID_SUBJECT: 'mailto:admin@example.invalid',
  IORI_WORKER_BINDINGS_PATH: '',
  IORI_REQUIRE_TERRAFORM_BINDINGS: 'false',
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('assets.run_worker_first', () => {
  it('sends static files to Assets and everything else to the Worker in the template', async () => {
    const template = parseJsonc(await readAppFile('workers/iori/wrangler.template.jsonc'));

    expectRouting(template.assets.run_worker_first);
  });

  it('sends static files to Assets and everything else to the Worker in the local config', async () => {
    const local = parseJsonc(await readAppFile('workers/iori/wrangler.local.jsonc'));

    expectRouting(local.assets.run_worker_first);
  });

  it('keeps the same rules in the local config and the template', async () => {
    const template = parseJsonc(await readAppFile('workers/iori/wrangler.template.jsonc'));
    const local = parseJsonc(await readAppFile('workers/iori/wrangler.local.jsonc'));

    expect(local.assets.run_worker_first).toEqual(template.assets.run_worker_first);
  });

  it('keeps the array in the deployment config built from the template', async () => {
    for (const [name, value] of Object.entries(fixtureEnvironment)) vi.stubEnv(name, value);
    const config = await createDeploymentWorkerConfig();
    try {
      const deployed = parseJsonc(await readFile(config.path, 'utf8'));

      expectRouting(deployed.assets.run_worker_first);
    } finally {
      await config.cleanup();
    }
  });
});

describe('public/_headers', () => {
  it('sets an immutable long cache only on hashed chunks', async () => {
    const headers = await readAppFile('public/_headers');
    const lines = headers.split('\n').filter((line) => line.trim().length > 0);

    expect(lines).toEqual([
      '/static/chunks/*',
      '  Cache-Control: public, max-age=31536000, immutable',
    ]);
  });
});
