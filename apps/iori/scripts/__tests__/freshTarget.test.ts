import { describe, expect, it } from 'vitest';
import { assertFreshTargetState, createTargetIdentity, validateFreshTargetPlan } from '../fresh-target.mjs';

const input = {
  environment: 'staging',
  generation: 'g20260906',
  accountId: 'a'.repeat(32),
  backendBucket: 'terraform-state',
};
describe('fresh isolated target', () => {
  it('binds every name and backend key to environment and generation', () => {
    const identity = createTargetIdentity(input);
    expect(identity.workerName).toBe('iori-staging-g20260906');
    expect(identity.backendKey).toBe('iori/staging/g20260906/terraform.tfstate');
    expect(createTargetIdentity({ ...input, environment: 'production' }).names).not.toEqual(identity.names);
    expect(() => createTargetIdentity({ ...input, generation: '' })).toThrow();
    expect(() => createTargetIdentity({ ...input, backendBucket: identity.names.uploads })).toThrow();
  });
  it('rejects existing state, wrong backend and missing state evidence', () => {
    const identity = createTargetIdentity(input);
    expect(() => assertFreshTargetState(identity, { backendKey: identity.backendKey, resources: [] })).not.toThrow();
    for (
      const state of [{}, { backendKey: 'old', resources: [] }, { backendKey: identity.backendKey, resources: [{}] }]
    ) {
      expect(() => assertFreshTargetState(identity, state)).toThrow();
    }
  });
  it('rejects imports, replacements, unrelated creates and route enabling', () => {
    const identity = createTargetIdentity(input);
    const change = {
      address: 'cloudflare_d1_database.iori',
      change: { actions: ['create'], before: null, after: { name: identity.names.d1, account_id: identity.accountId } },
    };
    expect(validateFreshTargetPlan({ resource_changes: [change] }, identity, 'resources')).toEqual([]);
    for (
      const bad of [
        { ...change, change: { ...change.change, importing: { id: 'old' } } },
        { ...change, change: { ...change.change, actions: ['delete', 'create'] } },
        { ...change, address: 'cloudflare_d1_database.other' },
        { ...change, address: 'cloudflare_workers_route.iori[0]' },
        { ...change, change: { ...change.change, after: { ...change.change.after, name: 'iori' } } },
      ]
    ) expect(validateFreshTargetPlan({ resource_changes: [bad] }, identity, 'resources').length).toBeGreaterThan(0);
  });
});
