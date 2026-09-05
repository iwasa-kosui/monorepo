import { type Context, importJwk } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { Instant } from '../../domain/instant/instant.ts';
import type { KeyGeneratedStore, KeyGenerator } from '../../domain/key/generate.ts';
import type { Key, KeysResolverByUserId } from '../../domain/key/key.ts';
import { KeyType } from '../../domain/key/keyType.ts';
import type { UserResolverByUsername } from '../../domain/user/user.ts';
import { Username } from '../../domain/user/username.ts';
import type { InstanceActorKeyPairsResolver } from '../d1/key/instanceActorKeyPairsResolver.ts';
import { INSTANCE_ACTOR_IDENTIFIER } from './sharedKeyDispatcher.ts';

export type KeyPairsDispatcherDeps = Readonly<{
  keyGenerator: KeyGenerator;
  keyGeneratedStore: KeyGeneratedStore;
  keysResolverByUserId: KeysResolverByUserId;
  userResolverByUsername: UserResolverByUsername;
  instanceActorKeyPairsResolver: InstanceActorKeyPairsResolver;
}>;

export const createKeyPairsDispatcher = (
  { keyGenerator, keyGeneratedStore, keysResolverByUserId, userResolverByUsername, instanceActorKeyPairsResolver }:
    KeyPairsDispatcherDeps,
) => {
  const generateIfMissing = async (keys: ReadonlyArray<Key>, type: KeyType, userId: Key['userId']) => {
    const existing = keys.find((key) => key.type === type);
    if (existing !== undefined) {
      return RA.ok({
        privateKey: await importJwk(JSON.parse(existing.privateKey), 'private'),
        publicKey: await importJwk(JSON.parse(existing.publicKey), 'public'),
      });
    }
    return RA.flow(
      keyGenerator.generate({ type, userId, now: Instant.now() }),
      RA.andThrough(keyGeneratedStore.store),
      RA.map(async (event) => ({
        privateKey: await importJwk(JSON.parse(event.aggregateState.privateKey), 'private'),
        publicKey: await importJwk(JSON.parse(event.aggregateState.publicKey), 'public'),
      })),
    );
  };

  const dispatch = async (_ctx: Context<unknown>, identifier: string) => {
    if (identifier === INSTANCE_ACTOR_IDENTIFIER) return instanceActorKeyPairsResolver.resolve();
    return RA.flow(
      RA.ok(identifier),
      RA.andThen(Username.parse),
      RA.andThen((username) => userResolverByUsername.resolve(username)),
      RA.andThen((user) =>
        user === undefined
          ? RA.err(new Error(`User not found: ${identifier}`))
          : RA.flow(keysResolverByUserId.resolve(user.id), RA.map((keys) => ({ keys, userId: user.id })))
      ),
      RA.andThen(({ keys, userId }) => RA.all(KeyType.values.map((type) => generateIfMissing(keys, type, userId)))),
      RA.match({
        ok: (keyPairs) => keyPairs,
        err: (error) => {
          getLogger().warn(`Failed to resolve user for federation keys: ${identifier} - ${error}`);
          return [];
        },
      }),
    );
  };
  return { dispatch };
};
