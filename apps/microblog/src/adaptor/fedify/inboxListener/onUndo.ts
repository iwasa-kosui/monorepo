import { Accept, Follow, Undo, type InboxContext } from "@fedify/fedify";
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

export const onUndo = async (ctx: InboxContext<unknown>, undo: Undo) => {
  const object = await undo.getObject();
  if (!(object instanceof Follow)) return;
  const actorId = undo.actorId;
  if (actorId == null || object.objectId == null) return;
  const parsed = ctx.parseUri(object.objectId);
  if (parsed == null || parsed.type !== "actor") return;

  const useCase = AcceptUnfollowUseCase.create({
    unfollowedStore: PgUnfollowedStore.getInstance(),
    followResolver: PgFollowResolver.getInstance(),
    actorResolverByUri: PgActorResolverByUri.getInstance(),
    actorResolverByUserId: PgActorResolverByUserId.getInstance(),
    remoteActorCreatedStore: PgRemoteActorCreatedStore.getInstance(),
    userResolverByUsername: PgUserResolverByUsername.getInstance(),
  });

  return RA.flow(
    RA.ok(parsed.identifier),
    RA.andThen(Username.parse),
    RA.andThen(async (username) =>
      useCase.run({
        username,
        follower: {
          uri: actorId.href,
        },
      })
    ),
    RA.match({
      ok: () => {
        getLogger().info(
          `Processed Undo Follow from ${actorId.href} for ${object.objectId?.href}`
        );
      },
      err: (err) => {
        getLogger().warn(
          `Failed to process Undo Follow from ${actorId.href} for ${object.objectId?.href} - ${err}`
        );
      },
    })
  );
};
