import { RA } from "@iwasa-kosui/result";
import type { UserId } from "../../domain/user/userId.ts";
import { PgKeyGeneratedStore } from "../pg/key/keyGeneratedStore.ts";
import { PgKeysResolverByUserId } from "../pg/key/keysResolverByUserId.ts";
import { FedifyKeyGenerator } from "./keyGenerator.ts";
import { importJwk, type Context } from "@fedify/fedify";
import type { Key } from "../../domain/key/key.ts";
import { KeyType } from "../../domain/key/keyType.ts";
import { Instant } from "../../domain/instant/instant.ts";
import { Username } from "../../domain/user/username.ts";
import { GetUserProfileUseCase } from "../../useCase/getUserProfile.ts";
import { getLogger } from "@logtape/logtape";

const getInstance = () => {
  const keyGenerator = FedifyKeyGenerator.getInstance();
  const keyGeneratedStore = PgKeyGeneratedStore.getInstance();
  const keysResolverByUserId = PgKeysResolverByUserId.getInstance();

  const generateIfMissing = async (
    existingKeys: ReadonlyArray<Key>,
    type: KeyType,
    userId: UserId
  ): RA<CryptoKeyPair, never> => {
    const found = existingKeys.find((key) => key.type === type);
    if (found) {
      return RA.ok({
        privateKey: await importJwk(
          JSON.parse(found.privateKey),
          "private"
        ),
        publicKey: await importJwk(JSON.parse(found.publicKey), "public"),
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
          "private"
        ),
        publicKey: await importJwk(
          JSON.parse(x.aggregateState.publicKey),
          "public"
        ),
      }))
    );
  };
  const useCase = GetUserProfileUseCase.getInstance();

  const dispatch = (ctx: Context<unknown>, identifier: string) =>
    RA.flow(
      RA.ok(identifier),
      RA.andThen(Username.parse),
      RA.andThen(async (username) => useCase.run({ username })),
      RA.andThen(({ user }) =>
        RA.flow(
          RA.ok(user.id),
          RA.andThen(keysResolverByUserId.resolve),
          RA.andThen((keys) =>
            RA.all(
              KeyType.values.map((type) =>
                generateIfMissing(keys, type, user.id)
              )
            )
          ),
          RA.map((keyPairs): CryptoKeyPair[] => keyPairs)
        )
      ),
      RA.match({
        ok: (keyPairs) => {
          getLogger().info(
            `Resolved keys for federation: ${identifier} - ${keyPairs.length} keys`
          );
          return keyPairs;
        },
        err: (err) => {
          getLogger().warn(
            `Failed to resolve user for federation keys: ${identifier} - ${err}`
          );
          return [];
        },
      })
    );

  return {
    dispatch,
  };
}

export const KeyPairsDispatcher = {
  getInstance,
} as const;
