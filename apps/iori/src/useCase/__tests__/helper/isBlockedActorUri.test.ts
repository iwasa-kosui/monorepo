import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BlockedActorUriResolverByUsername } from '../../../domain/block/block.ts';
import type { Username } from '../../../domain/user/username.ts';
import { isBlockedActorUri } from '../../helper/isBlockedActorUri.ts';

const USERNAME = 'kosui' as Username;
const ACTOR_URI = 'https://remote.example/users/alice';

const resolverOf = (resolve: (input: never) => Promise<unknown>) =>
  ({ resolve }) as unknown as BlockedActorUriResolverByUsername;

describe('isBlockedActorUri', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ブロックしていれば true を返す', async () => {
    const resolver = resolverOf(async () => RA.ok(true));

    expect(await isBlockedActorUri(resolver, USERNAME, ACTOR_URI)).toBe(true);
  });

  it('ブロックしていなければ false を返す', async () => {
    const resolver = resolverOf(async () => RA.ok(false));

    expect(await isBlockedActorUri(resolver, USERNAME, ACTOR_URI)).toBe(false);
  });

  it('判定が ok でなければ true を返す', async () => {
    const resolver = resolverOf(async () => RA.err({ type: 'failed' }));

    expect(await isBlockedActorUri(resolver, USERNAME, ACTOR_URI)).toBe(true);
  });

  it('判定が reject したら true を返し、actorUri もユーザー名も出さずに warn を 1 行出す', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const resolver = resolverOf(async () => {
      throw new Error(`D1_ERROR ${'x'.repeat(500)}`);
    });

    expect(await isBlockedActorUri(resolver, USERNAME, ACTOR_URI)).toBe(true);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]![0]);
    expect(line).toContain('blocked actor check failed; treating as blocked');
    expect(line).toContain('Error');
    expect(line).not.toContain(ACTOR_URI);
    expect(line).not.toContain(USERNAME);
    expect(line).not.toContain('x'.repeat(201));
  });
});
