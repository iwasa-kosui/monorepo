import { type Context, exportJwk, generateCryptoKeyPair, importJwk } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';
import { eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

import { Instant } from '../../domain/instant/instant.ts';
import type { Key } from '../../domain/key/key.ts';
import { KeyType } from '../../domain/key/keyType.ts';
import type { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
import { GetUserProfileUseCase } from '../../useCase/getUserProfile.ts';
import { DB } from '../pg/db.ts';
import { PgKeyGeneratedStore } from '../pg/key/keyGeneratedStore.ts';
import { PgKeysResolverByUserId } from '../pg/key/keysResolverByUserId.ts';
import { instanceActorKeysTable } from '../pg/schema.ts';
import { FedifyKeyGenerator } from './keyGenerator.ts';
import { INSTANCE_ACTOR_IDENTIFIER } from './sharedKeyDispatcher.ts';

const getInstance = () => {
  const keyGenerator = FedifyKeyGenerator.getInstance();
  const keyGeneratedStore = PgKeyGeneratedStore.getInstance();
  const keysResolverByUserId = PgKeysResolverByUserId.getInstance();

  const generateIfMissing = async (
    existingKeys: ReadonlyArray<Key>,
    type: KeyType,
    userId: UserId,
  ): RA<CryptoKeyPair, never> => {
    const found = existingKeys.find((key) => key.type === type);
    if (found) {
      return RA.ok({
        privateKey: await importJwk(
          JSON.parse(found.privateKey),
          'private',
        ),
        publicKey: await importJwk(JSON.parse(found.publicKey), 'public'),
      });
    }

    return RA.flow(
      keyGenerator.generate({
        type,
        userId,
        now: Instant.now(),
      }),
      RA.andThrough(keyGeneratedStore.store),
      RA.map(async (x) => ({
        privateKey: await importJwk(
          JSON.parse(x.aggregateState.privateKey),
          'private',
        ),
        publicKey: await importJwk(
          JSON.parse(x.aggregateState.publicKey),
          'public',
        ),
      })),
    );
  };

  /**
   * Get or generate key pairs for the instance actor.
   * Instance actor keys are stored in a separate table from user keys.
   */
  const getInstanceActorKeyPairs = async (): Promise<CryptoKeyPair[]> => {
    const db = DB.getInstance();
    const keyPairs: CryptoKeyPair[] = [];

    for (const type of KeyType.values) {
      const existing = await db.select()
        .from(instanceActorKeysTable)
        .where(eq(instanceActorKeysTable.type, type))
        .limit(1)
        .execute();

      if (existing.length > 0) {
        const row = existing[0];
        keyPairs.push({
          privateKey: await importJwk(JSON.parse(row.privateKey), 'private'),
          publicKey: await importJwk(JSON.parse(row.publicKey), 'public'),
        });
      } else {
        // Generate new key pair
        const algorithm = type === 'RSASSA-PKCS1-v1_5' ? 'RSASSA-PKCS1-v1_5' : 'Ed25519';
        const keyPair = await generateCryptoKeyPair(algorithm);
        const privateKeyJwk = await exportJwk(keyPair.privateKey);
        const publicKeyJwk = await exportJwk(keyPair.publicKey);

        await db.insert(instanceActorKeysTable).values({
          keyId: randomUUID(),
          type,
          privateKey: JSON.stringify(privateKeyJwk),
          publicKey: JSON.stringify(publicKeyJwk),
        }).execute();

        keyPairs.push(keyPair);
      }
    }

    return keyPairs;
  };

  const useCase = GetUserProfileUseCase.getInstance();

  const dispatch = async (ctx: Context<unknown>, identifier: string) => {
    // Handle instance actor
    if (identifier === INSTANCE_ACTOR_IDENTIFIER) {
      const keyPairs = await getInstanceActorKeyPairs();
      getLogger().info(
        `Resolved keys for instance actor: ${keyPairs.length} keys`,
      );
      return keyPairs;
    }

    // Handle regular user actors
    return RA.flow(
      RA.ok(identifier),
      RA.andThen(Username.parse),
      RA.andThen(async (username) => useCase.run({ username })),
      RA.andThen(({ user }) =>
        RA.flow(
          RA.ok(user.id),
          RA.andThen(keysResolverByUserId.resolve),
          RA.andThen((keys) =>
            RA.all(
              KeyType.values.map((type) => generateIfMissing(keys, type, user.id)),
            )
          ),
          RA.map((keyPairs): CryptoKeyPair[] => keyPairs),
        )
      ),
      RA.match({
        ok: (keyPairs) => {
          getLogger().info(
            `Resolved keys for federation: ${identifier} - ${keyPairs.length} keys`,
          );
          return keyPairs;
        },
        err: (err) => {
          getLogger().warn(
            `Failed to resolve user for federation keys: ${identifier} - ${err}`,
          );
          return [];
        },
      }),
    );
  };

  return {
    dispatch,
  };
};

export const KeyPairsDispatcher = {
  getInstance,
} as const;
