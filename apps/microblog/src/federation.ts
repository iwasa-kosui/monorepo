import {
  Accept,
  createFederation,
  Endpoints,
  exportJwk,
  Follow,
  generateCryptoKeyPair,
  importJwk,
  Note,
  Person,
  Undo,
  type Recipient,
} from "@fedify/fedify";
import { getLogger } from "@logtape/logtape";
import { PostgresKvStore, PostgresMessageQueue } from "@fedify/postgres";
import postgres from "postgres";
import { Env } from "./env.ts";
import { singleton } from "./helper/singleton.ts";
import { RA } from "@iwasa-kosui/result";
import { Username } from "./domain/user/username.ts";
import { PgUserResolverByUsername } from "./adaptor/pg/user/userResolverByUsername.ts";
import { DB } from "./adaptor/pg/db.ts";
import { keysTable } from "./adaptor/pg/schema.ts";
import { eq } from "drizzle-orm";
import { Key, KeyId, KeyType } from "./domain/key/index.ts";
import { PgKeysResolverByUserId } from "./adaptor/pg/key/keysResolverByUserId.ts";
import { FedifyKeyGenerator } from "./adaptor/fedify/keyGenerator.ts";
import { Instant } from "./domain/instant/instant.ts";
import type { UserId } from "./domain/user/userId.ts";
import { PgKeyGeneratedStore } from "./adaptor/pg/key/keyGeneratedStore.ts";
import { AcceptFollowRequestUseCase } from "./useCase/acceptFollowRequest.ts";
import { PgFollowedStore } from "./adaptor/pg/follow/followedStore.ts";
import { PgActorResolverByUri } from "./adaptor/pg/actor/actorResolverByUri.ts";
import { PgActorResolverByUserId } from "./adaptor/pg/actor/actorResolverByUserId.ts";
import { PgRemoteActorCreatedStore } from "./adaptor/pg/actor/remoteActorCreatedStore.ts";
import { PgFollowResolver } from "./adaptor/pg/follow/followResolver.ts";
import { AcceptUnfollowUseCase } from "./useCase/acceptUnfollow.ts";
import { PgUnfollowedStore } from "./adaptor/pg/follow/unfollowedStore.ts";
import { GetUserProfileUseCase } from "./useCase/getUserProfile.ts";
import { PgActorResolverByFollowerId } from "./adaptor/pg/actor/followsResolverByFollowerId.ts";
import { PgActorResolverByFollowingId } from "./adaptor/pg/actor/followsResolverByFollowingId.ts";

const create = () => {
  const env = Env.getInstance();
  const federation = createFederation({
    kv: new PostgresKvStore(postgres(env.DATABASE_URL)),
    queue: new PostgresMessageQueue(postgres(env.DATABASE_URL)),
  });
  const useCase = GetUserProfileUseCase.create({
    userResolverByUsername: PgUserResolverByUsername.getInstance(),
    actorResolverByUserId: PgActorResolverByUserId.getInstance(),
    actorsResolverByFollowerId: PgActorResolverByFollowerId.getInstance(),
    actorsResolverByFollowingId: PgActorResolverByFollowingId.getInstance(),
  });
  federation.setObjectDispatcher(
    Note,
    "/users/{identifier}/posts/{id}",
    (ctx, values) => {
      return null;
    },
  );
  federation.setInboxListeners("/users/{identifier}/inbox", "/inbox")
    .on(Follow, async (ctx, activity) => {
      if (!activity.objectId) {
        return
      }
      const object = ctx.parseUri(activity.objectId);
      if (!object) {
        return
      }
      if (object.type !== 'actor') {
        return
      }
      const follower = await activity.getActor();
      if (!follower || !follower.id || !follower.inboxId) {
        return
      }
      const followerIdentity = {
        uri: follower.id.href,
        inboxUrl: follower.inboxId.href,
      } as const;
      await AcceptFollowRequestUseCase.create({
        followedStore: PgFollowedStore.getInstance(),
        followResolver: PgFollowResolver.getInstance(),
        actorResolverByUri: PgActorResolverByUri.getInstance(),
        actorResolverByUserId: PgActorResolverByUserId.getInstance(),
        remoteActorCreatedStore: PgRemoteActorCreatedStore.getInstance(),
        userResolverByUsername: PgUserResolverByUsername.getInstance(),
      }).run({
        username: Username.parseOrThrow(object.identifier),
        follower: followerIdentity,
      })
      await ctx.sendActivity(object, follower, new Accept({
        actor: activity.objectId,
        to: activity.actorId,
        object: activity,
      }))
    })
    .on(Undo, async (ctx, undo) => {
      const object = await undo.getObject();
      if (!(object instanceof Follow)) return;
      if (undo.actorId == null || object.objectId == null) return;
      const parsed = ctx.parseUri(object.objectId);
      if (parsed == null || parsed.type !== "actor") return;
      await AcceptUnfollowUseCase.create({
        unfollowedStore: PgUnfollowedStore.getInstance(),
        followResolver: PgFollowResolver.getInstance(),
        actorResolverByUri: PgActorResolverByUri.getInstance(),
        actorResolverByUserId: PgActorResolverByUserId.getInstance(),
        remoteActorCreatedStore: PgRemoteActorCreatedStore.getInstance(),
        userResolverByUsername: PgUserResolverByUsername.getInstance(),
      }).run({
        username: Username.parseOrThrow(parsed.identifier),
        follower: {
          uri: undo.actorId.href,
        },
      })
    })

  federation
    .setFollowersDispatcher(
      "/users/{identifier}/followers",
      async (ctx, identifier) => {
        const useCase = GetUserProfileUseCase.create({
          userResolverByUsername: PgUserResolverByUsername.getInstance(),
          actorResolverByUserId: PgActorResolverByUserId.getInstance(),
          actorsResolverByFollowerId: PgActorResolverByFollowerId.getInstance(),
          actorsResolverByFollowingId: PgActorResolverByFollowingId.getInstance(),
        })

        return RA.flow(
          RA.ok(Username.orThrow(identifier)),
          RA.andThen(async (username) => useCase.run({ username })),
          RA.match({
            ok: ({ followers }) => {
              getLogger().info(
                `Resolved followers for federation: ${identifier} - ${followers.length} followers`
              );
              return {
                items: followers.map((actor): Recipient => ({
                  id: new URL(actor.uri),
                  inboxId: new URL(actor.inboxUrl),
                })),
              };
            },
            err: (err) => {
              getLogger().warn(
                `Failed to resolve followers for federation: ${identifier} - ${err}`
              );
              return {
                items: [],
              };
            },
          })
        );
      }).setCounter((ctx, identifier) => {
        const useCase = GetUserProfileUseCase.create({
          userResolverByUsername: PgUserResolverByUsername.getInstance(),
          actorResolverByUserId: PgActorResolverByUserId.getInstance(),
          actorsResolverByFollowerId: PgActorResolverByFollowerId.getInstance(),
          actorsResolverByFollowingId: PgActorResolverByFollowingId.getInstance(),
        })

        return RA.flow(
          RA.ok(Username.orThrow(identifier)),
          RA.andThen(async (username) => useCase.run({ username })),
          RA.match({
            ok: ({ followers }) => {
              getLogger().info(
                `Resolved followers for federation: ${identifier} - ${followers.length} followers`
              );
              return followers.length
            },
            err: (err) => {
              getLogger().warn(
                `Failed to resolve followers for federation: ${identifier} - ${err}`
              );
              return 0
            },
          })
        );
      })
  federation
    .setActorDispatcher("/users/{identifier}", async (ctx, identifier) => {
      return RA.flow(
        RA.ok(identifier),
        RA.andThen(Username.parse),
        RA.andThen(async (username) => useCase.run({ username })),
        RA.match({
          ok: async ({ user }) => {
            const keys = await ctx.getActorKeyPairs(user.username);
            return new Person({
              id: ctx.getActorUri(user.username),
              preferredUsername: user.username,
              inbox: ctx.getInboxUri(identifier),
              endpoints: new Endpoints({
                sharedInbox: ctx.getInboxUri(),
              }),
              url: ctx.getActorUri(identifier),
              publicKey: keys.at(0)?.cryptographicKey,
              assertionMethods: keys.map((k) => k.multikey),
              followers: ctx.getFollowersUri(identifier),
            });
          },
          err: (err) => {
            getLogger().warn(
              `Failed to resolve user for federation: ${identifier} - ${err}`
            );
            return null;
          },
        })
      );
    })
    .setKeyPairsDispatcher(async (ctx, identifier) => {
      const keyGenerator = FedifyKeyGenerator.getInstance()
      const keyGeneratedStore = PgKeyGeneratedStore.getInstance()
      const keysResolverByUserId = PgKeysResolverByUserId.getInstance()

      const generateIfMissing = async (existingKeys: ReadonlyArray<Key>, type: KeyType, userId: UserId): RA<CryptoKeyPair, never> => {
        const found = existingKeys.find((key) => key.type === type);
        if (found) {
          return RA.ok({
            privateKey: await importJwk(
              JSON.parse(found.privateKey),
              "private"
            ),
            publicKey: await importJwk(
              JSON.parse(found.publicKey),
              "public"
            ),
          });
        }

        return RA.flow(
          keyGenerator.generate({
            type,
            userId,
            now: Instant.now()
          }),
          RA.andThrough(keyGeneratedStore.store),
          RA.map(async x => ({
            privateKey: await importJwk(
              JSON.parse(x.aggregateState.privateKey),
              "private"
            ),
            publicKey: await importJwk(
              JSON.parse(x.aggregateState.publicKey),
              "public"
            ),
          }))
        )
      }

      return RA.flow(
        RA.ok(identifier),
        RA.andThen(Username.parse),
        RA.andThen(async (username) => useCase.run({ username })),
        RA.andThen(({ user }) =>
          RA.flow(
            RA.ok(user.id),
            RA.andThen(keysResolverByUserId.resolve),
            RA.andThen((keys) =>
              RA.all(KeyType.values.map((type) =>
                generateIfMissing(keys, type, user.id)
              ))
            ),
            RA.map((keyPairs): CryptoKeyPair[] => keyPairs),
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
    });

  return federation;
};

const getInstance = singleton(create);

export const Federation = {
  getInstance,
} as const;
