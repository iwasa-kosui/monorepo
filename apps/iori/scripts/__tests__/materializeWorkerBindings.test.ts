import { describe, expect, it } from 'vitest';
import { materializeWorkerBindings } from '../materialize-worker-bindings.mjs';

const bindings = {
  d1_database_id: '00000000-0000-4000-8000-000000000001',
  r2_bucket_name: 'iori-uploads-fixture',
  kv_namespace_id: '00000000000000000000000000000002',
  queue_name: 'iori-fedify-fixture',
  worker_name: 'iori-fixture',
};

describe('materializeWorkerBindings', () => {
  it('accepts complete Terraform private output for the expected Worker', () => {
    expect(materializeWorkerBindings({ bindings, expectedWorkerName: 'iori-fixture' })).toEqual(bindings);
  });

  it('rejects a Worker-name mismatch without including private binding values', () => {
    expect(() => materializeWorkerBindings({ bindings, expectedWorkerName: 'other-worker' }))
      .toThrow('Terraform Worker binding output does not match the protected Worker name.');
  });

  it('rejects incomplete Terraform output without including private binding values', () => {
    expect(() =>
      materializeWorkerBindings({
        bindings: { ...bindings, queue_name: '' },
        expectedWorkerName: 'iori-fixture',
      })
    ).toThrow('Terraform Worker binding output is incomplete.');
  });
});
