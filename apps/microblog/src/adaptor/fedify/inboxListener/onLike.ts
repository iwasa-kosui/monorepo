import type { InboxContext, Like } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { PostId } from '../../../domain/post/postId.ts';
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

type EmojiInfo = Readonly<{
  emoji: string;
  emojiImageUrl: string | null;
}>;

type EmojiTag = Readonly<{
  type: string;
  name?: string;
  icon?: {
    type?: string;
    url?: string;
  };
}>;

/**
 * Normalizes tags to an array (handles both single object and array cases)
 */
const normalizeTags = (tags: unknown): EmojiTag[] => {
  if (Array.isArray(tags)) {
    return tags as EmojiTag[];
  }
  if (tags && typeof tags === 'object') {
    return [tags as EmojiTag];
  }
  return [];
};

/**
 * Extracts emoji image URL from tag array
 * Misskey sends custom emoji info in the tag array with type "Emoji"
 */
const extractEmojiImageUrl = (tags: unknown, emojiName: string): string | null => {
  const normalizedTags = normalizeTags(tags);

  if (normalizedTags.length === 0) {
    getLogger().debug(`extractEmojiImageUrl: no tags found, original: ${JSON.stringify(tags)}`);
    return null;
  }

  for (const tag of normalizedTags) {
    getLogger().debug(`extractEmojiImageUrl: checking tag: ${JSON.stringify(tag)}, emojiName: ${emojiName}`);
    // Check for Emoji type tag with matching name
    if (tag.type === 'Emoji' && tag.name === emojiName && tag.icon?.url) {
      getLogger().debug(`extractEmojiImageUrl: found match, url: ${tag.icon.url}`);
      return tag.icon.url;
    }
  }
  getLogger().debug(`extractEmojiImageUrl: no match found for emojiName: ${emojiName}`);
  return null;
};

/**
 * Extracts emoji image URL from Fedify's tag objects
 * This uses Fedify's getTags() method which returns Emoji | Hashtag | Mention objects
 */
const extractEmojiImageUrlFromFedifyTags = async (
  activity: Like,
  emojiName: string,
): Promise<string | null> => {
  try {
    // Try to use Fedify's getTags() method which should return parsed tag objects
    const tags = activity.getTags();
    for await (const tag of tags) {
      const tagJson = await tag.toJsonLd() as Record<string, unknown>;
      getLogger().debug(`extractEmojiImageUrlFromFedifyTags: tag JSON: ${JSON.stringify(tagJson)}`);

      // Check if this is an Emoji tag with matching name
      if (tagJson.type === 'Emoji' || tagJson.type === 'toot:Emoji') {
        const tagName = tagJson.name as string | undefined;
        if (tagName === emojiName) {
          // Try to get the icon URL
          const icon = tagJson.icon as Record<string, unknown> | undefined;
          if (icon?.url && typeof icon.url === 'string') {
            getLogger().debug(`extractEmojiImageUrlFromFedifyTags: found icon URL: ${icon.url}`);
            return icon.url;
          }
        }
      }
    }
  } catch (err) {
    getLogger().debug(`extractEmojiImageUrlFromFedifyTags: error: ${err}`);
  }
  return null;
};

/**
 * Extracts emoji from Misskey-style Like activity
 * Misskey sends emoji reactions as Like with content field containing the emoji
 * or _misskey_reaction field for custom emojis
 * Custom emoji images are in the tag array
 */
const extractEmojiFromLike = async (activity: Like): Promise<EmojiInfo | null> => {
  const json = await activity.toJsonLd() as Record<string, unknown>;
  let emoji: string | null = null;

  getLogger().debug(`extractEmojiFromLike: json keys: ${Object.keys(json).join(', ')}`);
  getLogger().debug(`extractEmojiFromLike: _misskey_reaction: ${JSON.stringify(json._misskey_reaction)}`);
  getLogger().debug(`extractEmojiFromLike: content: ${JSON.stringify(json.content)}`);
  getLogger().debug(`extractEmojiFromLike: tag: ${JSON.stringify(json.tag)}`);

  // Check _misskey_reaction first (Misskey-specific)
  const misskeyReaction = json._misskey_reaction;
  if (typeof misskeyReaction === 'string' && misskeyReaction.length > 0) {
    emoji = misskeyReaction;
  }

  // Check content field (standard ActivityPub)
  if (!emoji) {
    const content = json.content;
    if (typeof content === 'string' && content.length > 0 && content !== '👍') {
      // Only treat as emoji reaction if content is not the default like emoji
      emoji = content;
    }
  }

  if (!emoji) return null;

  getLogger().debug(`extractEmojiFromLike: extracted emoji: ${emoji}`);

  // First try using Fedify's getTags() method
  let emojiImageUrl = await extractEmojiImageUrlFromFedifyTags(activity, emoji);

  // Fallback to json.tag from toJsonLd()
  if (!emojiImageUrl) {
    emojiImageUrl = extractEmojiImageUrl(json.tag, emoji);
  }

  getLogger().debug(`extractEmojiFromLike: emojiImageUrl: ${emojiImageUrl}`);

  return { emoji, emojiImageUrl };
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

  // Check if this is an emoji reaction (Misskey-style)
  const emojiInfo = await extractEmojiFromLike(activity);
  if (emojiInfo) {
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
        emoji: emojiInfo.emoji,
        emojiImageUrl: emojiInfo.emojiImageUrl,
      }),
      RA.match({
        ok: ({ actor: reactorActor }) => {
          getLogger().info(
            `Processed emoji reaction (via Like): ${activityUri} by ${reactorActor.uri} with ${emojiInfo.emoji}`,
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
