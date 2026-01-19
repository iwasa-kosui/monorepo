import type { InboxContext, Like } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { PostId } from '../../../domain/post/postId.ts';
import { Env } from '../../../env.ts';
import { AddReceivedEmojiReactUseCase } from '../../../useCase/addReceivedEmojiReact.ts';
import { AddReceivedLikeUseCase } from '../../../useCase/addReceivedLike.ts';
import { PgActorResolverByUri } from '../../pg/actor/actorResolverByUri.ts';
import { PgLogoUriUpdatedStore } from '../../pg/actor/logoUriUpdatedStore.ts';
import { PgRemoteActorCreatedStore } from '../../pg/actor/remoteActorCreatedStore.ts';
import { PgEmojiReactCreatedStore } from '../../pg/emojiReact/emojiReactCreatedStore.ts';
import { PgEmojiReactResolverByActivityUri } from '../../pg/emojiReact/emojiReactResolverByActivityUri.ts';
import { PgLikeV2CreatedStore } from '../../pg/likeV2/likeV2CreatedStore.ts';
import { PgLikeV2ResolverByActivityUri } from '../../pg/likeV2/likeV2ResolverByActivityUri.ts';
import { PgEmojiReactNotificationCreatedStore } from '../../pg/notification/emojiReactNotificationCreatedStore.ts';
import { PgLikeNotificationCreatedStore } from '../../pg/notification/notificationCreatedStore.ts';
import { PgPostResolver } from '../../pg/post/postResolver.ts';
import { PgPushSubscriptionsResolverByUserId } from '../../pg/pushSubscription/pushSubscriptionsResolverByUserId.ts';
import { WebPushSender } from '../../webPush/webPushSender.ts';
import { InboxActorResolver } from '../inboxActorResolver.ts';

/**
 * Extracts emoji from Misskey-style Like activity
 * Misskey sends emoji reactions as Like with content field containing the emoji
 * or _misskey_reaction field for custom emojis
 */
const extractEmojiFromLike = async (activity: Like): Promise<string | null> => {
  const json = await activity.toJsonLd() as Record<string, unknown>;
  // Check _misskey_reaction first (Misskey-specific)
  const misskeyReaction = json._misskey_reaction;
  if (typeof misskeyReaction === 'string' && misskeyReaction.length > 0) {
    return misskeyReaction;
  }
  // Check content field (standard ActivityPub)
  const content = json.content;
  if (typeof content === 'string' && content.length > 0 && content !== '👍') {
    // Only treat as emoji reaction if content is not the default like emoji
    return content;
  }
  return null;
};

export const onLike = async (ctx: InboxContext<unknown>, activity: Like) => {
  const actorResult = await InboxActorResolver.getInstance().resolve(ctx, activity);
  if (!actorResult.ok) {
    getLogger().warn(`Failed to resolve actor: ${actorResult.err.message}`);
    return;
  }
  const { actorIdentity } = actorResult.val;
  if (!activity.id) {
    getLogger().warn('Like activity has no id');
    return;
  }
  const activityUri = activity.id.href;

  const objectId = activity.objectId;
  if (!objectId) {
    getLogger().warn('Like activity has no objectId');
    return;
  }

  const parsed = ctx.parseUri(objectId);
  if (
    !parsed || parsed.type !== 'object' || parsed.class?.typeId?.href !== 'https://www.w3.org/ns/activitystreams#Note'
  ) {
    getLogger().info(`Like activity objectId is not a local Note: ${objectId.href}`);
    return;
  }

  const postIdResult = PostId.parse(parsed.values.id);
  if (!postIdResult.ok) {
    getLogger().warn(`Failed to parse postId from Like activity: ${parsed.values.id}`);
    return;
  }
  const postId = postIdResult.val;

  const env = Env.getInstance();
  const objectUri = `${env.ORIGIN}/users/${parsed.values.identifier}/posts/${postId}`;

  // Check if this is an emoji reaction (Misskey-style)
  const emoji = await extractEmojiFromLike(activity);
  if (emoji) {
    // Process as EmojiReact
    const useCase = AddReceivedEmojiReactUseCase.create({
      emojiReactCreatedStore: PgEmojiReactCreatedStore.getInstance(),
      emojiReactResolverByActivityUri: PgEmojiReactResolverByActivityUri.getInstance(),
      emojiReactNotificationCreatedStore: PgEmojiReactNotificationCreatedStore.getInstance(),
      postResolver: PgPostResolver.getInstance(),
      remoteActorCreatedStore: PgRemoteActorCreatedStore.getInstance(),
      logoUriUpdatedStore: PgLogoUriUpdatedStore.getInstance(),
      actorResolverByUri: PgActorResolverByUri.getInstance(),
      pushSubscriptionsResolver: PgPushSubscriptionsResolverByUserId.getInstance(),
      webPushSender: WebPushSender.getInstance(),
    });

    return RA.flow(
      useCase.run({
        emojiReactActivityUri: activityUri,
        reactedPostId: postId,
        reactorIdentity: actorIdentity,
        objectUri,
        emoji,
      }),
      RA.match({
        ok: ({ actor: reactorActor }) => {
          getLogger().info(
            `Processed emoji reaction (via Like): ${activityUri} by ${reactorActor.uri} with ${emoji}`,
          );
        },
        err: (err) => {
          getLogger().warn(
            `Failed to process emoji reaction (via Like): ${activityUri} - ${JSON.stringify(err)}`,
          );
        },
      }),
    );
  }

  // Process as regular Like
  const useCase = AddReceivedLikeUseCase.create({
    likeV2CreatedStore: PgLikeV2CreatedStore.getInstance(),
    likeV2ResolverByActivityUri: PgLikeV2ResolverByActivityUri.getInstance(),
    likeNotificationCreatedStore: PgLikeNotificationCreatedStore.getInstance(),
    postResolver: PgPostResolver.getInstance(),
    remoteActorCreatedStore: PgRemoteActorCreatedStore.getInstance(),
    logoUriUpdatedStore: PgLogoUriUpdatedStore.getInstance(),
    actorResolverByUri: PgActorResolverByUri.getInstance(),
    pushSubscriptionsResolver: PgPushSubscriptionsResolverByUserId.getInstance(),
    webPushSender: WebPushSender.getInstance(),
  });

  return RA.flow(
    useCase.run({
      likeActivityUri: activityUri,
      likedPostId: postId,
      likerIdentity: actorIdentity,
      objectUri,
    }),
    RA.match({
      ok: ({ actor: likerActor }) => {
        getLogger().info(
          `Processed Like activity: ${activityUri} by ${likerActor.uri}`,
        );
      },
      err: (err) => {
        getLogger().warn(
          `Failed to process Like activity: ${activityUri} - ${JSON.stringify(err)}`,
        );
      },
    }),
  );
};
