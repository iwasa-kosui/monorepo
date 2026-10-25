import { execFile } from 'node:child_process';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { assertWorkflowOutput } from '../assert-workflow-output.mjs';

const execFileAsync = promisify(execFile);

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

  it('allows a private plan file with a production binding ID and no output-change type', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'iori-private-plan-'));
    const path = join(directory, 'plan.json');
    const script = new URL('../assert-workflow-output.mjs', import.meta.url).pathname;
    await writeFile(
      path,
      '{\n  "format_version": "1.2",\n  "terraform_version": "1.14.0",\n  "planned_values": {\n    "root_module": { "resources": [{ "values": { "account_id": "0123456789abcdef0123456789abcdef" } }] },\n    "outputs": {\n      "worker_bindings": {\n        "sensitive": true,\n        "value": {\n          "d1_database_id": "0123456789abcdef0123456789abcdef",\n          "r2_bucket_name": "iori-uploads",\n          "kv_namespace_id": "0123456789abcdef0123456789abcdef",\n          "queue_name": "iori-fedify",\n          "worker_name": "iori"\n        }\n      }\n    }\n  },\n  "output_changes": {\n    "worker_bindings": {\n      "actions": ["no-op"],\n      "after": {\n        "d1_database_id": "0123456789abcdef0123456789abcdef",\n        "r2_bucket_name": "iori-uploads",\n        "kv_namespace_id": "0123456789abcdef0123456789abcdef",\n        "queue_name": "iori-fedify",\n        "worker_name": "iori"\n      },\n      "after_sensitive": true,\n      "after_unknown": false\n    }\n  },\n  "configuration": {\n    "root_module": {\n      "outputs": {\n        "worker_bindings": {\n          "sensitive": true,\n          "expression": { "references": ["cloudflare_d1_database.iori.id"] }\n        }\n      }\n    }\n  },\n  "resource_changes": []\n}',
      { mode: 0o600 },
    );
    await chmod(path, 0o600);

    try {
      const { stderr, stdout } = await execFileAsync(process.execPath, [script, '--private-terraform-plan', path]);
      expect(stdout).toBe('');
      expect(stderr).toBe('');
    } finally {
      await rm(directory, { force: true, recursive: true });
    }
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

  it('rejects a private-plan exception when configuration omits worker bindings', () => {
    const bindings = {
      d1_database_id: 'd1',
      r2_bucket_name: 'bucket',
      kv_namespace_id: 'kv',
      queue_name: 'queue',
      worker_name: 'worker',
    };
    expect(assertWorkflowOutput(
      JSON.stringify({
        format_version: '1.2',
        terraform_version: '1.14.0',
        planned_values: { root_module: {}, outputs: { worker_bindings: { sensitive: true, value: bindings } } },
        output_changes: {
          worker_bindings: {
            actions: ['no-op'],
            after: bindings,
            after_sensitive: true,
            after_unknown: false,
          },
        },
        configuration: { root_module: {} },
        resource_changes: [],
      }),
      { allowTerraformPlan: true },
    )).not.toEqual([]);
  });

  it('rejects a private-plan exception with non-standard configuration binding output', () => {
    const bindings = {
      d1_database_id: 'd1',
      r2_bucket_name: 'bucket',
      kv_namespace_id: 'kv',
      queue_name: 'queue',
      worker_name: 'worker',
    };
    expect(assertWorkflowOutput(
      JSON.stringify({
        format_version: '1.2',
        terraform_version: '1.14.0',
        planned_values: { root_module: {}, outputs: { worker_bindings: { sensitive: true, value: bindings } } },
        output_changes: {
          worker_bindings: {
            actions: ['no-op'],
            after: bindings,
            after_sensitive: true,
            after_unknown: false,
          },
        },
        configuration: {
          root_module: {
            outputs: {
              worker_bindings: {
                sensitive: true,
                expression: { references: ['cloudflare_d1_database.iori.id'] },
                unexpected: 'payload',
              },
            },
          },
        },
        resource_changes: [],
      }),
      { allowTerraformPlan: true },
    )).not.toEqual([]);
  });

  it('rejects a nested sensitive payload in an otherwise valid private-plan binding output', () => {
    const bindings = {
      d1_database_id: 'd1',
      r2_bucket_name: 'bucket',
      kv_namespace_id: 'kv',
      queue_name: 'queue',
      worker_name: 'worker',
    };
    expect(assertWorkflowOutput(
      JSON.stringify({
        format_version: '1.2',
        terraform_version: '1.14.0',
        planned_values: {
          root_module: {},
          outputs: {
            worker_bindings: {
              sensitive: true,
              value: bindings,
              unexpected_nested_payload: { sensitive: true, value: 'must-not-pass' },
            },
          },
        },
        output_changes: {
          worker_bindings: {
            actions: ['no-op'],
            after: bindings,
            after_sensitive: true,
            after_unknown: false,
          },
        },
        configuration: {
          root_module: {
            outputs: {
              worker_bindings: {
                sensitive: true,
                expression: { references: ['cloudflare_d1_database.iori.id'] },
              },
            },
          },
        },
        resource_changes: [],
      }),
      { allowTerraformPlan: true },
    )).not.toEqual([]);
  });
});
