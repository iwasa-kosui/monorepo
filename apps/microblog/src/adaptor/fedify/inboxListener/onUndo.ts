import { Activity, Announce, Follow, type InboxContext, Like, Undo } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { Username } from '../../../domain/user/username.ts';
import { AcceptUnfollowUseCase } from '../../../useCase/acceptUnfollow.ts';
import { RemoveReceivedEmojiReactUseCase } from '../../../useCase/removeReceivedEmojiReact.ts';
import { RemoveReceivedLikeUseCase } from '../../../useCase/removeReceivedLike.ts';
import { RemoveReceivedRepostUseCase } from '../../../useCase/removeReceivedRepost.ts';
import { PgActorResolverByUri } from '../../pg/actor/actorResolverByUri.ts';
import { PgActorResolverByUserId } from '../../pg/actor/actorResolverByUserId.ts';
import { PgEmojiReactDeletedStore } from '../../pg/emojiReact/emojiReactDeletedStore.ts';
import { PgEmojiReactResolverByActivityUri } from '../../pg/emojiReact/emojiReactResolverByActivityUri.ts';
import { PgFollowResolver } from '../../pg/follow/followResolver.ts';
import { PgUnfollowedStore } from '../../pg/follow/undoFollowingProcessedStore.ts';
import { PgRemoteLikeDeletedStore } from '../../pg/like/remoteLikeDeletedStore.ts';
import { PgRemoteLikeResolverByActivityUri } from '../../pg/like/remoteLikeResolverByActivityUri.ts';
import { PgEmojiReactNotificationDeletedStore } from '../../pg/notification/emojiReactNotificationDeletedStore.ts';
import { PgEmojiReactNotificationResolverByActorIdAndPostIdAndEmoji } from '../../pg/notification/emojiReactNotificationResolverByActorIdAndPostIdAndEmoji.ts';
import { PgLikeNotificationDeletedStore } from '../../pg/notification/likeNotificationDeletedStore.ts';
import { PgLikeNotificationResolverByActorIdAndPostId } from '../../pg/notification/likeNotificationResolverByActorIdAndPostId.ts';
import { PgRepostDeletedStore } from '../../pg/repost/repostDeletedStore.ts';
import { PgRepostResolverByActivityUri } from '../../pg/repost/repostResolverByActivityUri.ts';
import { PgTimelineItemDeletedStore } from '../../pg/timeline/timelineItemDeletedStore.ts';
import { PgTimelineItemResolverByPostId } from '../../pg/timeline/timelineItemResolverByPostId.ts';
import { PgUserResolverByUsername } from '../../pg/user/userResolverByUsername.ts';
import { INSTANCE_ACTOR_IDENTIFIER } from '../sharedKeyDispatcher.ts';

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
    remoteLikeDeletedStore: PgRemoteLikeDeletedStore.getInstance(),
    remoteLikeResolverByActivityUri: PgRemoteLikeResolverByActivityUri.getInstance(),
    likeNotificationResolverByActorIdAndPostId: PgLikeNotificationResolverByActorIdAndPostId.getInstance(),
    likeNotificationDeletedStore: PgLikeNotificationDeletedStore.getInstance(),
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

const handleUndoAnnounce = async (announce: Announce) => {
  if (!announce.id) {
    getLogger().warn('Undo Announce activity has no Announce id');
    return;
  }
  const announceActivityUri = announce.id.href;

  const useCase = RemoveReceivedRepostUseCase.create({
    repostDeletedStore: PgRepostDeletedStore.getInstance(),
    repostResolverByActivityUri: PgRepostResolverByActivityUri.getInstance(),
    timelineItemDeletedStore: PgTimelineItemDeletedStore.getInstance(),
    timelineItemResolverByPostId: PgTimelineItemResolverByPostId.getInstance(),
  });

  return RA.flow(
    RA.ok({ announceActivityUri }),
    RA.andThen(({ announceActivityUri }) => useCase.run({ announceActivityUri })),
    RA.match({
      ok: () => {
        getLogger().info(`Processed Undo Announce: ${announceActivityUri}`);
      },
      err: (err) => {
        getLogger().warn(`Failed to process Undo Announce: ${announceActivityUri} - ${JSON.stringify(err)}`);
      },
    }),
  );
};

type JsonLdEmojiReact = {
  type: string;
  id?: string;
};

const isEmojiReactJsonLd = (json: unknown): json is JsonLdEmojiReact => {
  if (typeof json !== 'object' || json === null) return false;
  const obj = json as Record<string, unknown>;
  return obj.type === 'EmojiReact' || obj.type === 'litepub:EmojiReact';
};

const handleUndoEmojiReact = async (object: Activity) => {
  const json = await object.toJsonLd();
  if (!isEmojiReactJsonLd(json)) {
    return false;
  }

  const emojiReactActivityUri = json.id;
  if (!emojiReactActivityUri) {
    getLogger().warn('Undo EmojiReact activity has no EmojiReact id');
    return true;
  }

  const useCase = RemoveReceivedEmojiReactUseCase.create({
    emojiReactDeletedStore: PgEmojiReactDeletedStore.getInstance(),
    emojiReactResolverByActivityUri: PgEmojiReactResolverByActivityUri.getInstance(),
    emojiReactNotificationResolverByActorIdAndPostIdAndEmoji: PgEmojiReactNotificationResolverByActorIdAndPostIdAndEmoji
      .getInstance(),
    emojiReactNotificationDeletedStore: PgEmojiReactNotificationDeletedStore.getInstance(),
  });

  await RA.flow(
    RA.ok({ emojiReactActivityUri }),
    RA.andThen(({ emojiReactActivityUri }) => useCase.run({ emojiReactActivityUri })),
    RA.match({
      ok: () => {
        getLogger().info(`Processed Undo EmojiReact: ${emojiReactActivityUri}`);
      },
      err: (err) => {
        getLogger().warn(`Failed to process Undo EmojiReact: ${emojiReactActivityUri} - ${JSON.stringify(err)}`);
      },
    }),
  );

  return true;
};

export const onUndo = async (ctx: InboxContext<unknown>, undo: Undo) => {
  // 個人inboxの場合はrecipientからidentifierを取得、共有inboxの場合はインスタンスアクターを使用
  // インスタンスアクターを使用することで、Authorized Fetchモードのサーバーにも対応
  const documentLoader = await ctx.getDocumentLoader({
    identifier: ctx.recipient ?? INSTANCE_ACTOR_IDENTIFIER,
  });
  const object = await undo.getObject({ documentLoader });

  if (object instanceof Follow) {
    return handleUndoFollow(ctx, undo, object);
  }

  if (object instanceof Like) {
    return handleUndoLike(object);
  }

  if (object instanceof Announce) {
    return handleUndoAnnounce(object);
  }

  // Try to handle EmojiReact (custom activity type not natively supported by Fedify)
  if (object instanceof Activity) {
    const handled = await handleUndoEmojiReact(object);
    if (handled) {
      return;
    }
  }

  getLogger().info(`Unhandled Undo activity type: ${object?.constructor?.name}`);
};
