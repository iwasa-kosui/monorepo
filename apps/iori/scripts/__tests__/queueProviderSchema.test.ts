import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';

import { COMPUTED_ONLY_PATHS } from '../adopt-plan.mjs';
// Run with the JSON produced by backend-free `terraform providers schema -json`.
it.skipIf(!process.env.IORI_PROVIDER_SCHEMA_PATH && !process.env.CI)(
  'pinned provider supports writable Queue pause and staged consumer schema',
  async () => {
    const schema = JSON.parse(await readFile(process.env.IORI_PROVIDER_SCHEMA_PATH!, 'utf8'));
    const resources = schema.provider_schemas['registry.terraform.io/cloudflare/cloudflare'].resource_schemas;
    expect(resources.cloudflare_queue.block.attributes.settings.nested_type.attributes.delivery_paused).toMatchObject({
      type: 'bool',
      optional: true,
    });
    expect(resources.cloudflare_queue_consumer.block.attributes.dead_letter_queue.optional).toBe(true);
    expect(resources.cloudflare_queue_consumer.block.attributes.settings.nested_type.attributes.dead_letter_queue)
      .toBeUndefined();
  },
);
it.skipIf(!process.env.IORI_PROVIDER_SCHEMA_PATH && !process.env.CI)(
  'pinned provider exposes the Worker route attributes that the adoption plan inspects',
  async () => {
    const schema = JSON.parse(await readFile(process.env.IORI_PROVIDER_SCHEMA_PATH!, 'utf8'));
    const route = schema.provider_schemas['registry.terraform.io/cloudflare/cloudflare'].resource_schemas
      .cloudflare_workers_route.block.attributes;
    expect(route.zone_id).toMatchObject({ type: 'string', required: true });
    expect(route.pattern).toMatchObject({ type: 'string', required: true });
    expect(route.script).toMatchObject({ type: 'string', optional: true });
    expect(route.id).toMatchObject({ type: 'string', computed: true });
  },
);
it.skipIf(!process.env.IORI_PROVIDER_SCHEMA_PATH && !process.env.CI)(
  'pinned provider marks every attribute that the refresh plan may change as computed only',
  async () => {
    const schema = JSON.parse(await readFile(process.env.IORI_PROVIDER_SCHEMA_PATH!, 'utf8'));
    const resources = schema.provider_schemas['registry.terraform.io/cloudflare/cloudflare'].resource_schemas;
    for (
      const [address, resource] of [['cloudflare_d1_database.iori', 'cloudflare_d1_database'], [
        'cloudflare_queue.fedify',
        'cloudflare_queue',
      ]]
    ) {
      const paths = COMPUTED_ONLY_PATHS[address]!;
      expect(paths.length).toBeGreaterThan(0);
      for (const path of paths) {
        const attribute = resources[resource].block.attributes[path];
        expect(attribute, `${resource}.${path}`).toMatchObject({ computed: true });
        expect(attribute.optional, `${resource}.${path}`).toBeFalsy();
        expect(attribute.required, `${resource}.${path}`).toBeFalsy();
      }
    }
    expect(COMPUTED_ONLY_PATHS['cloudflare_d1_database.iori']!).not.toEqual(
      expect.arrayContaining(['id']),
    );
    expect(COMPUTED_ONLY_PATHS['cloudflare_d1_database.iori']!).not.toEqual(expect.arrayContaining(['uuid']));
    expect(COMPUTED_ONLY_PATHS['cloudflare_d1_database.iori']!).not.toEqual(expect.arrayContaining(['created_at']));
    expect(COMPUTED_ONLY_PATHS['cloudflare_queue.fedify']!).not.toEqual(expect.arrayContaining(['id']));
    expect(COMPUTED_ONLY_PATHS['cloudflare_queue.fedify']!).not.toEqual(expect.arrayContaining(['queue_id']));
    expect(COMPUTED_ONLY_PATHS['cloudflare_queue.fedify']!).not.toEqual(expect.arrayContaining(['created_on']));
    expect(COMPUTED_ONLY_PATHS['cloudflare_d1_database.iori']!).toEqual(
      expect.arrayContaining(['file_size', 'num_tables']),
    );
    expect(COMPUTED_ONLY_PATHS['cloudflare_queue.fedify']!).toEqual(
      expect.arrayContaining(['consumers', 'consumers_total_count', 'modified_on']),
    );
  },
);
