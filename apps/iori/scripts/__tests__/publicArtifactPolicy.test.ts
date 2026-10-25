import { describe, expect, it } from 'vitest';

import { findPublicArtifactViolations } from '../publicArtifactPolicy.mjs';

describe('findPublicArtifactViolations', () => {
  it('rejects tracked production binding IDs and generated files', () => {
    expect(findPublicArtifactViolations({
      files: [
        {
          path: 'apps/iori/workers/iori/wrangler.jsonc',
          text: '{"database_id":"11111111-1111-4111-8111-111111111111"}',
        },
        { path: 'apps/iori/infra/cloudflare/config.s3.tfbackend', text: 'endpoint = "https://state.example"' },
        { path: 'apps/iori/migration-artifacts/d1.sql', text: 'insert into users values (...)' },
      ],
    })).toEqual([
      'apps/iori/workers/iori/wrangler.jsonc must not be tracked',
      'apps/iori/infra/cloudflare/config.s3.tfbackend must not be tracked',
      'apps/iori/migration-artifacts/d1.sql must not be tracked',
    ]);
  });

  it('does not reject an example UUID in local config', () => {
    expect(findPublicArtifactViolations({
      files: [
        {
          path: 'apps/iori/workers/iori/wrangler.local.jsonc',
          text: '{"database_id":"00000000-0000-4000-8000-000000000001"}',
        },
      ],
    })).toEqual([]);
  });

  it('rejects tracked NDJSON migration data and generated import manifests', () => {
    expect(findPublicArtifactViolations({
      files: [
        { path: 'apps/iori/exports/users.ndjson', text: '{"userId":"private"}\n' },
        { path: 'apps/iori/tmp/users.ndjson', text: '{"userId":"private"}\n' },
        { path: 'apps/iori/migration-exports/export-manifest.json', text: '{"complete":true}\n' },
        { path: 'apps/iori/imports/r2-import-manifest.json', text: '{"objects":[]}\n' },
      ],
    })).toEqual([
      'apps/iori/exports/users.ndjson must not be tracked',
      'apps/iori/tmp/users.ndjson must not be tracked',
      'apps/iori/migration-exports/export-manifest.json must not be tracked',
      'apps/iori/imports/r2-import-manifest.json must not be tracked',
    ]);
  });

  it('allows checked-in schema and static manifest fixtures', () => {
    expect(findPublicArtifactViolations({
      files: [
        { path: 'apps/iori/drizzle-d1/0000_boring_xavin.sql', text: 'create table users ();' },
        { path: 'apps/iori/workers/iori/public/manifest.json', text: '{"name":"iori"}\n' },
      ],
    })).toEqual([]);
  });

  it('allows the fixture-only Terraform backend example', () => {
    expect(findPublicArtifactViolations({
      files: [{
        path: 'apps/iori/infra/cloudflare/example.config.s3.tfbackend',
        text: 'bucket = "iori-terraform-state-fixture"',
      }],
    })).toEqual([]);
  });

  it.each([
    ['endpoint', 'endpoint = "https://state.example.invalid"'],
    ['access key', 'access_key = "fixture-access-key"'],
    ['secret key', 'secret_key = "fixture-secret-key"'],
    ['token', 'session_token = "fixture-token"'],
    ['password', 'backend_password = "fixture-password"'],
  ])('rejects a backend %s directive in the fixture example', (_name, directive) => {
    expect(findPublicArtifactViolations({
      files: [{
        path: 'apps/iori/infra/cloudflare/example.config.s3.tfbackend',
        text: `bucket = "iori-terraform-state-fixture"\n${directive}`,
      }],
    })).toEqual([
      'apps/iori/infra/cloudflare/example.config.s3.tfbackend must contain fixture backend values only',
    ]);
  });

  it('rejects a production KV namespace ID only in Cloudflare files', () => {
    expect(findPublicArtifactViolations({
      files: [
        {
          path: 'apps/iori/workers/iori/wrangler.template.jsonc',
          text: '{"id":"0123456789abcdef0123456789abcdef"}',
        },
        {
          path: 'apps/iori/src/domain/actor.ts',
          text: '{"id":"0123456789abcdef0123456789abcdef"}',
        },
      ],
    })).toEqual([
      'apps/iori/workers/iori/wrangler.template.jsonc contains a production Cloudflare binding ID',
    ]);
  });
});
it('allows only the named fresh fixture backend generation and refuses legacy state reuse', () => {
  const path = 'apps/iori/infra/cloudflare/example.config.s3.tfbackend';
  expect(findPublicArtifactViolations({ files: [{ path, text: 'key = "iori/staging/fixture1/terraform.tfstate"' }] }))
    .toEqual([]);
  for (const key of ['apps/iori/cloudflare/staging.tfstate', 'iori/staging/private1/terraform.tfstate']) {
    expect(findPublicArtifactViolations({ files: [{ path, text: `key = "${key}"` }] })).toHaveLength(1);
  }
});
