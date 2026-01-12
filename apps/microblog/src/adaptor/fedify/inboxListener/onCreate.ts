import {
  Accept,
  Create,
  Follow,
  Note,
  Undo,
  type InboxContext,
} from "@fedify/fedify";
import { AcceptFollowRequestUseCase } from "../../../useCase/acceptFollowRequest.ts";
import { PgFollowedStore } from "../../pg/follow/followAcceptedStore.ts";
import { PgFollowResolver } from "../../pg/follow/followResolver.ts";
import { PgActorResolverByUri } from "../../pg/actor/actorResolverByUri.ts";
import { PgActorResolverByUserId } from "../../pg/actor/actorResolverByUserId.ts";
import { PgRemoteActorCreatedStore } from "../../pg/actor/remoteActorCreatedStore.ts";
import { PgUserResolverByUsername } from "../../pg/user/userResolverByUsername.ts";
import { Username } from "../../../domain/user/username.ts";
import { AcceptUnfollowUseCase } from "../../../useCase/acceptUnfollow.ts";
import { PgUnfollowedStore } from "../../pg/follow/undoFollowingProcessedStore.ts";
import { RA } from "@iwasa-kosui/result";
import { getLogger } from "@logtape/logtape";
import { RemoteActor } from "../../../domain/actor/remoteActor.ts";
import type { Actor } from "../../../domain/actor/actor.ts";
import { Post } from "../../../domain/post/post.ts";
import { Instant } from "../../../domain/instant/instant.ts";
import { PgPostCreatedStore } from "../../pg/post/postCreatedStore.ts";

export const onCreate = async (ctx: InboxContext<unknown>, activity: Create) => {
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
    RA.andBind("actor", (actor): RA<Actor, unknown> => {
      if (!actor) {
        return RA.flow(
          RA.ok(actorIdentity),
          RA.map(RemoteActor.createRemoteActor),
          RA.andThrough(PgRemoteActorCreatedStore.getInstance().store),
          RA.map((event) => event.aggregateState)
        );
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
  );
};
