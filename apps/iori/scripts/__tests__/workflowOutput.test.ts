import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { assertWorkflowOutput } from '../assert-workflow-output.mjs';

describe('assertWorkflowOutput', () => {
  it.each([
    ['a VAPID private key', 'VAPID_PRIVATE_KEY=private-key-material'],
    ['a Cloudflare API token', 'CLOUDFLARE_API_TOKEN=token-material'],
    ['a standalone token-shaped value', 'aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789-_aBcDeFgHiJkLmNoPqRsTuVwX'],
    ['a Cloudflare binding UUID', 'wrangler config database_id = 11111111-1111-4111-8111-111111111111'],
    ['a Cloudflare-context 32-hex binding ID', 'cloudflare zone_id = 0123456789abcdef0123456789abcdef'],
    ['a Terraform output command', 'terraform output -json worker_bindings'],
    ['a multi-line Terraform output payload', '{\n  "worker_bindings": {\n    "sensitive": true\n  }\n}'],
    [
      'a multi-line Terraform state payload',
      '{\n  "terraform_version": "1.14.0",\n  "values": {\n    "root_module": {}\n  }\n}',
    ],
    ['a SQL data export', 'INSERT INTO users (id) VALUES (\'fixture\')'],
    ['an absolute repository path', `${resolve(process.cwd(), '../..')}/apps/iori/wrangler.jsonc`],
  ])('rejects %s', (_name, output) => {
    expect(assertWorkflowOutput(output)).not.toEqual([]);
  });

  it('allows ordinary build summaries and fixture identifiers', () => {
    expect(assertWorkflowOutput([
      'vite v7.3.1 built in 145ms',
      'tests: 42 passed',
      'fixture token: short-fixture-value',
      'fixture migration id: 00000000-0000-4000-8000-000000000001',
    ].join('\n'))).toEqual([]);
  });

  it('allows a private Terraform plan JSON without sensitive outputs', () => {
    expect(
      assertWorkflowOutput(
        '{\n  "format_version": "1.2",\n  "terraform_version": "1.14.0",\n  "planned_values": { "root_module": { "resources": [{ "values": {} }] } },\n  "output_changes": {},\n  "configuration": { "root_module": {} },\n  "resource_changes": []\n}',
      ),
    )
      .toEqual([]);
  });

  it('rejects a state payload that is mixed into apparent plan markers', () => {
    expect(
      assertWorkflowOutput(
        '{\n  "format_version": "1.2",\n  "planned_values": {},\n  "resource_changes": [],\n  "values": { "root_module": {} }\n}',
      ),
    )
      .not.toEqual([]);
  });

  it('rejects worker bindings from a plan passed through the public assertion path', () => {
    expect(
      assertWorkflowOutput(
        '{\n  "format_version": "1.2",\n  "planned_values": {\n    "outputs": {\n      "worker_bindings": {\n        "sensitive": true,\n        "value": {\n          "d1_database_id": "d1",\n          "r2_bucket_name": "bucket",\n          "kv_namespace_id": "kv",\n          "queue_name": "queue",\n          "worker_name": "worker"\n        }\n      }\n    }\n  },\n  "output_changes": {\n    "worker_bindings": {\n      "actions": ["no-op"],\n      "after": {\n        "d1_database_id": "d1",\n        "r2_bucket_name": "bucket",\n        "kv_namespace_id": "kv",\n        "queue_name": "queue",\n        "worker_name": "worker"\n      },\n      "after_sensitive": true,\n      "after_unknown": false\n    }\n  },\n  "resource_changes": []\n}',
      ),
    )
      .not.toEqual([]);
  });

  it('rejects a truncated object that only imitates Terraform plan markers', () => {
    expect(assertWorkflowOutput('{"format_version":"1.2","planned_values":{},"resource_changes":[]}'))
      .not.toEqual([]);
  });
});
