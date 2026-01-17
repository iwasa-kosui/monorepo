import { Follow, type InboxContext, Like, Undo } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { Username } from '../../../domain/user/username.ts';
import { AcceptUnfollowUseCase } from '../../../useCase/acceptUnfollow.ts';
import { RemoveReceivedLikeUseCase } from '../../../useCase/removeReceivedLike.ts';
import { PgActorResolverByUri } from '../../pg/actor/actorResolverByUri.ts';
import { PgActorResolverByUserId } from '../../pg/actor/actorResolverByUserId.ts';
import { PgFollowResolver } from '../../pg/follow/followResolver.ts';
import { PgUnfollowedStore } from '../../pg/follow/undoFollowingProcessedStore.ts';
import { PgLikeV2DeletedStore } from '../../pg/likeV2/likeV2DeletedStore.ts';
import { PgLikeV2ResolverByActivityUri } from '../../pg/likeV2/likeV2ResolverByActivityUri.ts';
import { PgUserResolverByUsername } from '../../pg/user/userResolverByUsername.ts';

const handleUndoFollow = async (ctx: InboxContext<unknown>, undo: Undo, follow: Follow) => {
  const actorId = undo.actorId;
  if (actorId == null || follow.objectId == null) return;
  const parsed = ctx.parseUri(follow.objectId);
  if (parsed == null || parsed.type !== 'actor') return;

  const useCase = AcceptUnfollowUseCase.create({
    unfollowedStore: PgUnfollowedStore.getInstance(),
    followResolver: PgFollowResolver.getInstance(),
    actorResolverByUri: PgActorResolverByUri.getInstance(),
    actorResolverByUserId: PgActorResolverByUserId.getInstance(),
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
          `Processed Undo Follow from ${actorId.href} for ${follow.objectId?.href}`,
        );
      },
      err: (err) => {
        getLogger().warn(
          `Failed to process Undo Follow from ${actorId.href} for ${follow.objectId?.href} - ${err}`,
        );
      },
    }),
  );
};

const handleUndoLike = async (like: Like) => {
  if (!like.id) {
    getLogger().warn('Undo Like activity has no Like id');
    return;
  }
  const likeActivityUri = like.id.href;

  const useCase = RemoveReceivedLikeUseCase.create({
    likeV2DeletedStore: PgLikeV2DeletedStore.getInstance(),
    likeV2ResolverByActivityUri: PgLikeV2ResolverByActivityUri.getInstance(),
  });

  return RA.flow(
    RA.ok({ likeActivityUri }),
    RA.andThen(({ likeActivityUri }) => useCase.run({ likeActivityUri })),
    RA.match({
      ok: () => {
        getLogger().info(`Processed Undo Like: ${likeActivityUri}`);
      },
      err: (err) => {
        getLogger().warn(`Failed to process Undo Like: ${likeActivityUri} - ${JSON.stringify(err)}`);
      },
    }),
  );
};

export const onUndo = async (ctx: InboxContext<unknown>, undo: Undo) => {
  const object = await undo.getObject();

  if (object instanceof Follow) {
    return handleUndoFollow(ctx, undo, object);
  }

  if (object instanceof Like) {
    return handleUndoLike(object);
  }

  getLogger().info(`Unhandled Undo activity type: ${object?.constructor?.name}`);
};
