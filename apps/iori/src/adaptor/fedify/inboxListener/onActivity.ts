import { Activity, type InboxContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';

import { PostId } from '../../../domain/post/postId.ts';
import type { AddReceivedEmojiReactUseCase } from '../../../useCase/addReceivedEmojiReact.ts';
import type { InboxActorResolver } from '../inboxActorResolver.ts';

export type OnActivityDeps = Readonly<{
  inboxActorResolver: InboxActorResolver;
  addReceivedEmojiReactUseCase: AddReceivedEmojiReactUseCase;
}>;

type EmojiTag = Readonly<{
  type: string;
  name?: string;
  icon?: {
    type?: string;
    url?: string;
  };
}>;

type JsonLdEmojiReact = {
  type: 'EmojiReact';
  id?: string;
  actor?: string;
  object?: string;
  content?: string;
  tag?: unknown;
};

const isEmojiReactJsonLd = (json: unknown): json is JsonLdEmojiReact => {
  if (typeof json !== 'object' || json === null) return false;
  const obj = json as Record<string, unknown>;
  return obj.type === 'EmojiReact' || obj.type === 'litepub:EmojiReact';
};

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
 */
const extractEmojiImageUrl = (tags: unknown, emojiName: string): string | null => {
  const normalizedTags = normalizeTags(tags);

  if (normalizedTags.length === 0) {
    getLogger().debug(`extractEmojiImageUrl (EmojiReact): no tags found, original: ${JSON.stringify(tags)}`);
    return null;
  }

  for (const tag of normalizedTags) {
    getLogger().debug(
      `extractEmojiImageUrl (EmojiReact): checking tag: ${JSON.stringify(tag)}, emojiName: ${emojiName}`,
    );
    if (tag.type === 'Emoji' && tag.name === emojiName && tag.icon?.url) {
      getLogger().debug(`extractEmojiImageUrl (EmojiReact): found match, url: ${tag.icon.url}`);
      return tag.icon.url;
    }
  }
  getLogger().debug(`extractEmojiImageUrl (EmojiReact): no match found for emojiName: ${emojiName}`);
  return null;
};

const handleEmojiReact = async (
  deps: OnActivityDeps,
  ctx: InboxContext<unknown>,
  activity: Activity,
  json: JsonLdEmojiReact,
) => {
  const actorResult = await deps.inboxActorResolver.resolve(ctx, activity);
  if (!actorResult.ok) {
    getLogger().warn(`Failed to resolve actor for EmojiReact: ${actorResult.err.message}`);
    return;
  }
  const { actorIdentity: reactorIdentity } = actorResult.val;

  const emojiReactActivityUri = json.id;
  if (!emojiReactActivityUri) {
    getLogger().warn('EmojiReact activity has no id');
    return;
  }

  const objectUri = json.object;
  if (!objectUri) {
    getLogger().warn('EmojiReact activity has no object');
    return;
  }

  const emoji = json.content;
  if (!emoji) {
    getLogger().warn('EmojiReact activity has no content (emoji)');
    return;
  }

  // Extract emoji image URL from tags for custom emojis
  const emojiImageUrl = extractEmojiImageUrl(json.tag, emoji);

  // Parse the object URI to extract post ID
  const objectId = activity.objectId;
  if (!objectId) {
    getLogger().warn('EmojiReact activity has no objectId');
    return;
  }

  const parsed = ctx.parseUri(objectId);
  if (
    !parsed || parsed.type !== 'object' || parsed.class?.typeId?.href !== 'https://www.w3.org/ns/activitystreams#Note'
  ) {
    getLogger().info(`EmojiReact activity objectId is not a local Note: ${objectId.href}`);
    return;
  }

  const postIdResult = PostId.parse(parsed.values.id);
  if (!postIdResult.ok) {
    getLogger().warn(`Failed to parse postId from EmojiReact activity: ${parsed.values.id}`);
    return;
  }
  const reactedPostId = postIdResult.val;

  return RA.flow(
    deps.addReceivedEmojiReactUseCase.run({
      emojiReactActivityUri,
      reactedPostId,
      reactorIdentity,
      emoji,
      emojiImageUrl,
    }),
    RA.match({
      ok: ({ actor: reactorActor }) => {
        getLogger().info(
          `Processed EmojiReact activity: ${emojiReactActivityUri} by ${reactorActor.uri}`,
        );
      },
      err: (err) => {
        getLogger().warn(
          `Failed to process EmojiReact activity: ${emojiReactActivityUri} - ${JSON.stringify(err)}`,
        );
      },
    }),
  );
};

export const createOnActivity = (deps: OnActivityDeps) => async (ctx: InboxContext<unknown>, activity: Activity) => {
  const json = await activity.toJsonLd();

  // Handle EmojiReact activities
  if (isEmojiReactJsonLd(json)) {
    return handleEmojiReact(deps, ctx, activity, json);
  }

  // Other activity types are handled by specific handlers
  getLogger().debug(`Unhandled activity type in onActivity: ${(json as Record<string, unknown>).type}`);
};
