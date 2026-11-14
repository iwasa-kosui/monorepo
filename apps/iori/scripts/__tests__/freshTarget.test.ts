import { describe, expect, it } from 'vitest';
import { createTargetIdentity } from '../fresh-target.mjs';

const input = {
  environment: 'staging',
  generation: 'g20260906',
  accountId: 'a'.repeat(32),
};
describe('fresh isolated target', () => {
  it('separates the names of environments and rejects an empty generation', () => {
    const identity = createTargetIdentity(input);
    expect(createTargetIdentity({ ...input, environment: 'production' }).names).not.toEqual(identity.names);
    expect(() => createTargetIdentity({ ...input, generation: '' })).toThrow();
  });
});
