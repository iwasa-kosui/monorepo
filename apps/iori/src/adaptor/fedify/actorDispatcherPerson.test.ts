import type { RequestContext } from '@fedify/fedify';
import { Person } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { ActorId } from '../../domain/actor/actorId.ts';
import type { LocalActor } from '../../domain/actor/localActor.ts';
import { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
import { createActorDispatcher } from './actorDispatcherFactory.ts';

const ORIGIN = 'https://iori.example';
const userId = UserId.generate();
const user = { id: userId, username: Username.orThrow('kosui') };
const baseActor: LocalActor = {
  id: ActorId.generate(),
  userId,
  type: 'local',
  uri: `${ORIGIN}/users/kosui`,
  inboxUrl: `${ORIGIN}/users/kosui/inbox`,
};

const userUri = (identifier: string, suffix = '') => new URL(`${ORIGIN}/users/${identifier}${suffix}`);
const ctx = {
  getActorUri: (identifier: string) => userUri(identifier),
  getInboxUri: (identifier?: string) =>
    identifier === undefined ? new URL(`${ORIGIN}/inbox`) : userUri(identifier, '/inbox'),
  getOutboxUri: (identifier: string) => userUri(identifier, '/outbox'),
  getFollowersUri: (identifier: string) => userUri(identifier, '/followers'),
  getActorKeyPairs: async () => [],
} as unknown as RequestContext<unknown>;

const dispatch = (actor: LocalActor) =>
  createActorDispatcher({
    userResolverByUsername: { resolve: async () => RA.ok(user) },
    actorResolverByUserId: { resolve: async () => RA.ok(actor) },
  }).dispatch(ctx, 'kosui');

describe('Person の配信', () => {
  it('表示名を name に、自己紹介を HTML にして summary に出す', async () => {
    const person = await dispatch({ ...baseActor, displayName: '岩佐', bio: '行1\nhttps://example.com' });

    expect(person).toBeInstanceOf(Person);
    expect((person as Person).name?.toString()).toBe('岩佐');
    expect((person as Person).summary?.toString()).toBe(
      '<p>行1<br><a href="https://example.com">https://example.com</a></p>',
    );
  });

  it('未設定なら name も summary も付けない', async () => {
    const person = await dispatch(baseActor) as Person;

    expect(person.name).toBeNull();
    expect(person.summary).toBeNull();
  });
});
