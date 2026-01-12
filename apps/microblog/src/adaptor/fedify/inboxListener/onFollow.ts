import { Accept, type Follow, type InboxContext } from "@fedify/fedify";
import { AcceptFollowRequestUseCase } from "../../../useCase/acceptFollowRequest.ts";
import { PgFollowedStore } from "../../pg/follow/followAcceptedStore.ts";
import { PgFollowResolver } from "../../pg/follow/followResolver.ts";
import { PgActorResolverByUri } from "../../pg/actor/actorResolverByUri.ts";
import { PgActorResolverByUserId } from "../../pg/actor/actorResolverByUserId.ts";
import { PgRemoteActorCreatedStore } from "../../pg/actor/remoteActorCreatedStore.ts";
import { PgUserResolverByUsername } from "../../pg/user/userResolverByUsername.ts";
import { Username } from "../../../domain/user/username.ts";

export const onFollow = async (ctx: InboxContext<unknown>, activity: Follow) => {
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
}
