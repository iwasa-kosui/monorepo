import {
  Accept,
  Create,
  createFederation,
  Follow,
  isActor,
  Note,
  PUBLIC_COLLECTION,
  Undo,
  type Recipient,
} from "@fedify/fedify";
import { Follow as AppFollow } from "./domain/follow/follow.ts";
import { getLogger } from "@logtape/logtape";
import { PostgresKvStore, PostgresMessageQueue } from "@fedify/postgres";
import postgres from "postgres";
import { Env } from "./env.ts";
import { singleton } from "./helper/singleton.ts";
import { RA } from "@iwasa-kosui/result";
import { Username } from "./domain/user/username.ts";
import { PgUserResolverByUsername } from "./adaptor/pg/user/userResolverByUsername.ts";
import { AcceptFollowRequestUseCase } from "./useCase/acceptFollowRequest.ts";
import { PgFollowedStore } from "./adaptor/pg/follow/followAcceptedStore.ts";
import { PgActorResolverByUri } from "./adaptor/pg/actor/actorResolverByUri.ts";
import { PgActorResolverByUserId } from "./adaptor/pg/actor/actorResolverByUserId.ts";
import { PgRemoteActorCreatedStore } from "./adaptor/pg/actor/remoteActorCreatedStore.ts";
import { PgFollowResolver } from "./adaptor/pg/follow/followResolver.ts";
import { AcceptUnfollowUseCase } from "./useCase/acceptUnfollow.ts";
import { PgUnfollowedStore } from "./adaptor/pg/follow/undoFollowingProcessedStore.ts";
import { GetUserProfileUseCase } from "./useCase/getUserProfile.ts";
import { GetPostUseCase } from "./useCase/getPost.ts";
import { PgPostResolver } from "./adaptor/pg/post/postResolver.ts";
import { PostId } from "./domain/post/postId.ts";
import { Temporal } from "@js-temporal/polyfill";
import { PgConfig } from "./adaptor/pg/pgConfig.ts";
import { ActorDispatcher } from "./adaptor/fedify/actorDispatcher.ts";
import { KeyPairsDispatcher } from "./adaptor/fedify/keyPairsDispatcher.ts";
import { OutboxDispatcher } from "./adaptor/fedify/outboxDispatcher.ts";
import { FollowersDispatcher } from "./adaptor/fedify/followersDispatcher.ts";
import { RemoteActor } from "./domain/actor/remoteActor.ts";
import type { Actor } from "./domain/actor/actor.ts";
import { Instant } from "./domain/instant/instant.ts";
import { PgFollowRequestedStore } from "./adaptor/pg/follow/followRequestedStore.ts";
import { Post } from "./domain/post/post.ts";
import { PgPostCreatedStore } from "./adaptor/pg/post/postCreatedStore.ts";

const create = () => {
  const env = Env.getInstance();
  const federation = createFederation({
    kv: new PostgresKvStore(postgres(env.DATABASE_URL, PgConfig.getInstance())),
    queue: new PostgresMessageQueue(
      postgres(env.DATABASE_URL, PgConfig.getInstance())
    ),
    origin: env.ORIGIN,
  });
  federation
    .setInboxListeners("/users/{identifier}/inbox", "/inbox")
    .on(Follow, async (ctx, activity) => {
      if (!activity.objectId) {
        return;
      }
      const object = ctx.parseUri(activity.objectId);
      if (!object) {
        return;
      }
      if (object.type !== "actor") {
        return;
      }
      const follower = await activity.getActor();
      if (!follower || !follower.id || !follower.inboxId) {
        return;
      }
      const followerIdentity = {
        uri: follower.id.href,
        inboxUrl: follower.inboxId.href,
        url: follower.url?.href?.toString() ?? undefined,
        username: follower.preferredUsername?.toString() ?? undefined,
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
      });
      await ctx.sendActivity(
        object,
        follower,
        new Accept({
          actor: activity.objectId,
          to: activity.actorId,
          object: activity,
        })
      );
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
      });
    })
    .on(Create, async (ctx, activity) => {
      const object = await activity.getObject();
      if (!(object instanceof Note)) {
        return;
      }
      const actor = await activity.getActor();
      if (!actor || !actor.id || !actor.inboxId) {
        return;
      }
      if (!object.id) {
        return;
      }
      const objectIdentity = {
        uri: object.id.href,
      } as const;
      const actorIdentity = {
        uri: actor.id.href,
        inboxUrl: actor.inboxId.href,
        url: actor.url?.href?.toString() ?? undefined,
        username: actor.preferredUsername?.toString() ?? undefined,
      } as const;

      return RA.flow(
        RA.ok(actorIdentity.uri),
        RA.andThen(PgActorResolverByUri.getInstance().resolve),
        RA.andBind('actor', (actor): RA<Actor, unknown> => {
          if (!actor) {
            return RA.flow(
              RA.ok(actorIdentity),
              RA.map(RemoteActor.createRemoteActor),
              RA.andThrough(PgRemoteActorCreatedStore.getInstance().store),
              RA.map((event) => event.aggregateState),
            )
          }
          return RA.ok(actor);
        }),
        RA.andThen(({ actor }) => {
          const createPost = Post.createRemotePost(Instant.now())({
            content: String(object.content),
            uri: objectIdentity.uri,
            actorId: actor.id,
          });
          return PgPostCreatedStore.getInstance().store(createPost);
        }),
        RA.match({
          ok: () => {
            getLogger().info(
              `Processed Create activity: ${objectIdentity.uri} by ${actorIdentity.uri}`
            );
          },
          err: (err) => {
            getLogger().warn(
              `Failed to process Create activity: ${objectIdentity.uri} by ${actorIdentity.uri} - ${err}`
            );
          },
        })
      )
    })

  federation.setObjectDispatcher(
    Note,
    "/users/{identifier}/posts/{id}",
    (ctx, values) => {
      const useCase = GetPostUseCase.create({
        postResolver: PgPostResolver.getInstance(),
      });
      return RA.flow(
        RA.ok({
          postId: PostId.orThrow(values.id),
        }),
        RA.andThen(async (input) => useCase.run(input)),
        RA.match({
          ok: (post) => {
            return new Note({
              id: ctx.getObjectUri(Note, values),
              attribution: ctx.getActorUri(values.identifier),
              to: PUBLIC_COLLECTION,
              cc: ctx.getFollowersUri(values.identifier),
              content: post.content,
              mediaType: "text/html",
              published: Temporal.Instant.fromEpochMilliseconds(post.createdAt),
              url: ctx.getObjectUri(Note, values),
            });
          },
          err: (err) => {
            getLogger().warn(
              `Failed to resolve post for federation: ${values.identifier} - ${values.id} - ${err}`
            );
            return null;
          },
        })
      );
    }
  );

  const followersDispatcher = FollowersDispatcher.getInstance();
  const outboxDispatcher = OutboxDispatcher.getInstance();
  const actorDispatcher = ActorDispatcher.getInstance();
  const keyPairsDispatcher = KeyPairsDispatcher.getInstance();

  federation
    .setFollowersDispatcher(
      "/users/{identifier}/followers",
      followersDispatcher.dispatch
    )
    .setCounter((ctx, identifier) => {
      const useCase = GetUserProfileUseCase.getInstance();

      return RA.flow(
        RA.ok(Username.orThrow(identifier)),
        RA.andThen(async (username) => useCase.run({ username })),
        RA.match({
          ok: ({ followers }) => {
            getLogger().info(
              `Resolved followers for federation: ${identifier} - ${followers.length} followers`
            );
            return followers.length;
          },
          err: (err) => {
            getLogger().warn(
              `Failed to resolve followers for federation: ${identifier} - ${err}`
            );
            return 0;
          },
        })
      );
    });

  federation.setOutboxDispatcher(
    "/users/{identifier}/outbox",
    outboxDispatcher.dispatch
  );
  federation
    .setActorDispatcher("/users/{identifier}", actorDispatcher.dispatch)
    .setKeyPairsDispatcher(keyPairsDispatcher.dispatch);

  return federation;
};

const getInstance = singleton(create);

export const Federation = {
  getInstance,
} as const;
