import { RA, Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { ActorId } from '../domain/actor/actorId.ts';
import type { LocalActor } from '../domain/actor/localActor.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { LocalAccountRetired } from '../domain/user/retireLocalAccount.ts';
import type { User } from '../domain/user/user.ts';
import { UserId } from '../domain/user/userId.ts';
import { Username } from '../domain/user/username.ts';
import { RetireLocalAccountsUseCase } from './retireLocalAccounts.ts';

const user = (username: string): User => ({ id: UserId.generate(), username: Username.orThrow(username) });

const setup = (users: readonly User[], announce: () => Result<void, string> = () => Result.ok(undefined)) => {
  const existing = new Map(users.map((entry) => [entry.username as string, entry]));
  const actors = new Map(users.map((entry) => [entry.id as string, { id: ActorId.generate() } as LocalActor]));
  const announced: string[] = [];
  const retired: LocalAccountRetired[] = [];
  const useCase = RetireLocalAccountsUseCase.create({
    userResolverByUsername: { resolve: async (username) => RA.ok(existing.get(username)) },
    actorResolverByUserId: { resolve: async (userId) => RA.ok(actors.get(userId)) },
    localAccountRetiredStore: {
      store: async (...events) => {
        retired.push(...events);
        for (const event of events) existing.delete(event.eventPayload.username);
        return RA.ok(undefined);
      },
    },
    deletionAnnouncer: {
      announce: async ({ username }) => {
        announced.push(username);
        return announce();
      },
    },
    now: () => Instant.orThrow(1_000),
  });
  return { useCase, announced, retired };
};

describe('RetireLocalAccountsUseCase', () => {
  it('残っているアカウントだけを、Delete を配送してから消す。2 回目は何もしない', async () => {
    const { useCase, announced, retired } = setup([user('iori_bot')]);

    const first = await useCase.run({ usernames: ['iori_bot', 'iori'] });
    const second = await useCase.run({ usernames: ['iori_bot', 'iori'] });

    expect(first.val).toEqual({ retired: ['iori_bot'], failed: [] });
    expect(second.val).toEqual({ retired: [], failed: [] });
    expect(announced).toEqual(['iori_bot']);
    expect(retired.map((event) => event.eventPayload.username)).toEqual(['iori_bot']);
  });

  it('Delete を配送できなければ、消さずに次の実行でやり直す', async () => {
    const { useCase, retired } = setup([user('iori_bot')], () => Result.err('queue unavailable'));

    const result = await useCase.run({ usernames: ['iori_bot'] });

    expect(result.val).toEqual({ retired: [], failed: ['iori_bot'] });
    expect(retired).toEqual([]);
  });
});
