import { describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Follow } from '../../../domain/follow/follow.ts';
import { UserId } from '../../../domain/user/userId.ts';
import type { IoriD1Db } from '../client.ts';
import { createD1FollowResolver } from '../follow/followResolver.ts';
import { createD1KeysResolverByUserId } from '../key/keysResolverByUserId.ts';

describe('D1 ActivityPub adapters', () => {
  it('maps persisted actor keys with their validated key type', async () => {
    const userId = UserId.generate();
    const db = {
      select: () => ({
        from: () => ({
          where: async () => [{
            keyId: '064e5b10-8d10-4b1b-8a70-b22c68d341e0',
            userId,
            type: 'Ed25519',
            privateKey: '{"kty":"OKP"}',
            publicKey: '{"kty":"OKP"}',
          }],
        }),
      }),
    } as unknown as IoriD1Db;

    const result = await createD1KeysResolverByUserId(db).resolve(userId);

    expect(result).toMatchObject({
      ok: true,
      val: [{ userId, type: 'Ed25519' }],
    });
  });

  it('reconstructs a persisted follow from its composite aggregate ID', async () => {
    const followerId = ActorId.generate();
    const followingId = ActorId.generate();
    const db = {
      select: () => ({
        from: () => ({
          where: async () => [{ followerId, followingId }],
        }),
      }),
    } as unknown as IoriD1Db;

    const result = await createD1FollowResolver(db).resolve({ followerId, followingId });

    expect(result).toEqual({ ok: true, val: Follow.orThrow({ followerId, followingId }), err: undefined });
  });
});
