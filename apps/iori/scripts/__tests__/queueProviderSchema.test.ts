import { readFile } from 'node:fs/promises';
import { expect, it } from 'vitest';
// Run with the JSON produced by backend-free `terraform providers schema -json`.
it.skipIf(!process.env.IORI_PROVIDER_SCHEMA_PATH)(
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
