import { describe, expect, it } from 'vitest';
import { createTargetIdentity } from '../fresh-target.mjs';

const input = {
  environment: 'staging',
  generation: 'g20260906',
  accountId: 'a'.repeat(32),
};
describe('fresh isolated target', () => {
  it('binds every name and backend key to environment and generation', () => {
    const identity = createTargetIdentity(input);
    expect(identity.workerName).toBe('iori-staging-g20260906');
    expect(identity.backendKey).toBe('iori/staging/g20260906/terraform.tfstate');
    expect(createTargetIdentity({ ...input, environment: 'production' }).names).not.toEqual(identity.names);
    expect(() => createTargetIdentity({ ...input, generation: '' })).toThrow();
  });
});
