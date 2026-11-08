import { readFile } from 'node:fs/promises';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { admissionFixture } from '../../src/testing/admissionFixture.ts';
import { scheduledTasks } from '../../src/scheduled/scheduledTasks.ts';
import { createDeploymentWorkerConfig, stripJsonc } from '../temporary-worker-config.mjs';

const readAppFile = (path: string) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

const readLocalRunWorkerFirst = async () => {
  const source = await readAppFile('workers/iori/wrangler.local.jsonc');
  const match = /"run_worker_first"\s*:\s*(\[[^\]]*\])/.exec(source);
  if (match === null) throw new Error('run_worker_first is missing in wrangler.local.jsonc');
  return JSON.parse(match[1]) as unknown;
};

const readDeployedConfig = async () => {
  for (const [name, value] of Object.entries(fixtureEnvironment)) vi.stubEnv(name, value);
  const config = await createDeploymentWorkerConfig();
  try {
    return JSON.parse(await readFile(config.path, 'utf8')) as {
      assets: { run_worker_first: unknown };
      placement: unknown;
      ai: unknown;
      triggers: unknown;
      r2_buckets: unknown;
      vars: Record<string, string>;
    };
  } finally {
    await config.cleanup();
  }
};

const readDeployedRunWorkerFirst = async () => (await readDeployedConfig()).assets.run_worker_first;

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
  '/static',
  '/sw.js',
];
const assetPaths = [
  '/static/home.js',
  '/static/chunks/x-abc.js',
  '/manifest.json',
  '/favicon.ico',
  '/icon-192.png',
  '/icon-512.png',
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
  R2_EVENT_ARCHIVE_BUCKET_NAME: 'iori-event-archive-fixture',
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
  it('sends static files to Assets and everything else to the Worker in the deployment config built from the template', async () => {
    expectRouting(await readDeployedRunWorkerFirst());
  });

  it('keeps the same rules in the local config and the deployment config', async () => {
    expect(await readLocalRunWorkerFirst()).toEqual(await readDeployedRunWorkerFirst());
  });

  it.each(['workers/iori/wrangler.template.jsonc', 'workers/iori/wrangler.local.jsonc'])(
    'has no block comment terminator in %s that would cut the run_worker_first array when comments are stripped',
    async (path) => {
      expect(await readAppFile(path)).not.toContain('*/');
    },
  );
});

describe('placement', () => {
  it('targets the US East region in the deployment config built from the template', async () => {
    expect((await readDeployedConfig()).placement).toEqual({ region: 'aws:us-east-1' });
  });
});

describe('ai', () => {
  it('declares the AI binding in the deployment config built from the template', async () => {
    expect((await readDeployedConfig()).ai).toEqual({ binding: 'AI' });
  });
});

describe('event archive', () => {
  it('binds the event archive bucket and leaves the archive disabled in the deployment config built from the template', async () => {
    const config = await readDeployedConfig();
    expect(config.r2_buckets).toContainEqual({ binding: 'EVENT_ARCHIVE', bucket_name: 'iori-event-archive-fixture' });
    expect(config.vars.EVENT_ARCHIVE_ENABLED).toBe('false');
  });

  it('binds a local event archive bucket in the local config', async () => {
    expect(await readAppFile('workers/iori/wrangler.local.jsonc')).toContain('"binding": "EVENT_ARCHIVE"');
  });
});

describe('triggers', () => {
  it('declares the cron expressions in the deployment config built from the template', async () => {
    expect((await readDeployedConfig()).triggers).toEqual({
      crons: ['* * * * *', '0 0,3,6,9,12,15,18,21 * * *', '15 20 * * 1', '30 21 * * *', '0 21 * * *', '0 19 * * *'],
    });
  });

  it('registers a task for exactly the cron expressions in the template', async () => {
    const { crons } = (await readDeployedConfig()).triggers as { crons: string[] };
    expect(Object.keys(scheduledTasks).sort()).toEqual([...crons].sort());
  });

  it('does not declare crons in the local config', async () => {
    expect(await readAppFile('workers/iori/wrangler.local.jsonc')).not.toContain('"triggers"');
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

describe('stripJsonc', () => {
  it('keeps // and /* inside strings', () => {
    expect(stripJsonc('{"url": "https://example.com/a"}')).toBe('{"url": "https://example.com/a"}');
    expect(stripJsonc('{"a": "a/*b*/c"}')).toBe('{"a": "a/*b*/c"}');
  });

  it('handles escaped quotes and backslashes in strings', () => {
    expect(stripJsonc('{"a": "a\\"//b"}')).toBe('{"a": "a\\"//b"}');
    expect(stripJsonc('{"a": "\\\\"} // c')).toBe('{"a": "\\\\"} ');
  });

  it('removes line comments and block comments outside strings', () => {
    expect(stripJsonc('{"a": 1, // line\n"b": /* block */ 2}')).toBe('{"a": 1, \n"b":  2}');
  });

  it('keeps the newline after a line comment', () => {
    expect(stripJsonc('{\n// first\n"a": 1\n}')).toBe('{\n\n"a": 1\n}');
  });

  it('removes trailing commas outside strings only', () => {
    expect(JSON.parse(stripJsonc('{"a": [1, 2,], "b": ",}",\n}'))).toEqual({ a: [1, 2], b: ',}' });
    expect(JSON.parse(stripJsonc('[1,/*x*/]'))).toEqual([1]);
    expect(JSON.parse(stripJsonc('{"a":1,// c\n}'))).toEqual({ a: 1 });
    expect(JSON.parse(stripJsonc('[1, {"a":2,},]'))).toEqual([1, { a: 2 }]);
  });

  it('leaves an unclosed block comment so that JSON.parse fails', () => {
    expect(() => JSON.parse(stripJsonc('{"a": 1} /* open'))).toThrow();
  });

  it('does not treat /*/ as a closed block comment', () => {
    expect(() => JSON.parse(stripJsonc('{"a":1/*/}'))).toThrow();
    expect(JSON.parse(stripJsonc('{"a":/**/1}'))).toEqual({ a: 1 });
  });
});
