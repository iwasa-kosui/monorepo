import { type RequestContext } from '@fedify/fedify';
import { Create } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { getLogger } from '@logtape/logtape';
import z from 'zod/v4';

import type { OgpFetcher } from '../adaptor/ogp/ogpFetcher.ts';
import { extractUrlsFromHtml } from '../adaptor/ogp/urlExtractor.ts';
import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { PostImageCreatedStore } from '../domain/image/image.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { LinkPreview, LinkPreviewCreatedStore } from '../domain/linkPreview/linkPreview.ts';
import { LinkPreviewId } from '../domain/linkPreview/linkPreviewId.ts';
import type { MentionRecipient } from '../domain/post/mention.ts';
import { Post, type PostCreatedStore } from '../domain/post/post.ts';
import { sanitizePostContent } from '../domain/post/sanitizePostContent.ts';
import type { Visibility } from '../domain/post/visibility.ts';
import type { AcceptedRelaysResolver } from '../domain/relay/relay.ts';
import { SessionExpiredError, type SessionResolver } from '../domain/session/session.ts';
import { TimelineItem, type TimelineItemCreatedStore } from '../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../domain/timeline/timelineItemId.ts';
import { User, UserNotFoundError, type UserResolver } from '../domain/user/user.ts';
import { Schema } from '../helper/schema.ts';
import { buildLocalNote } from './helper/localNote.ts';
import { toMentionNoteFields } from './helper/mentionNote.ts';
import { toImageDocument } from './helper/postImageDocument.ts';
import { type PostImagesInput, toPostImages } from './helper/postImages.ts';
import { type Requester, resolveLocalActorWith, resolveRequesterUserWith } from './helper/resolve.ts';
import { sendToMentions } from './helper/sendToMentions.ts';
import type { ScheduleBlueskyCrosspostUseCase } from './scheduleBlueskyCrosspost.ts';
import type { UseCase } from './useCase.ts';

type Input =
  & Requester
  & PostImagesInput
  & Readonly<{
    content: string;
    summary?: string | null;
    sensitive?: boolean;
    visibility?: Visibility;
    crosspostToBluesky?: boolean;
    mentions?: ReadonlyArray<MentionRecipient>;
    ctx: RequestContext<unknown>;
  }>;

const Ok = Schema.create(
  z.object({
    post: Post.zodType,
    user: User.zodType,
  }),
);
type Ok = z.infer<typeof Ok.zodType>;

type Err = SessionExpiredError | UserNotFoundError;

export type CreatePostUseCase = UseCase<Input, Ok, Err>;

type Deps = Readonly<{
  sessionResolver: SessionResolver;
  postCreatedStore: PostCreatedStore;
  userResolver: UserResolver;
  actorResolverByUserId: ActorResolverByUserId;
  postImageCreatedStore: PostImageCreatedStore;
  timelineItemCreatedStore: TimelineItemCreatedStore;
  linkPreviewCreatedStore: LinkPreviewCreatedStore;
  ogpFetcher: OgpFetcher;
  acceptedRelaysResolver: AcceptedRelaysResolver;
  scheduleBlueskyCrosspost?: ScheduleBlueskyCrosspostUseCase;
  origin: string;
}>;

const create = ({
  sessionResolver,
  postCreatedStore,
  userResolver,
  actorResolverByUserId,
  postImageCreatedStore,
  timelineItemCreatedStore,
  linkPreviewCreatedStore,
  ogpFetcher,
  acceptedRelaysResolver,
  scheduleBlueskyCrosspost,
  origin,
}: Deps): CreatePostUseCase => {
  const now = Instant.now();
  const resolveRequesterUser = resolveRequesterUserWith(sessionResolver, userResolver, now);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('user', (requester) => resolveRequesterUser(requester)),
      RA.andBind('actor', ({ user }) => resolveLocalActor(user.id)),
      RA.andBind('postEvent', ({ actor, user, ctx, content, summary, sensitive, visibility }) => {
        const postEvent = Post.createPost(now)({
          actorId: actor.id,
          content,
          userId: actor.userId,
          summary,
          sensitive,
          visibility,
          participantActorUris: [
            ctx.getActorUri(user.username).href,
            ...toMentionNoteFields(sanitizePostContent(content)).ccs.map((uri) => uri.href),
          ],
        });
        return RA.ok(postEvent);
      }),
      RA.andThrough(({ postEvent }) => postCreatedStore.store(postEvent)),
      RA.bind('post', ({ postEvent }) => postEvent.aggregateState),
      RA.andThrough(({ post, actor }) => {
        const timelineItemEvent = TimelineItem.createTimelineItem({
          timelineItemId: TimelineItemId.generate(),
          type: 'post',
          actorId: actor.id,
          postId: post.postId,
          repostId: null,
          createdAt: now,
        }, now);
        return timelineItemCreatedStore.store(timelineItemEvent);
      }),
      RA.andBind('images', async (input) => {
        const images = toPostImages(input.post.postId, input, now);
        if (images.length > 0) {
          await postImageCreatedStore.store(images);
        }
        return RA.ok(images);
      }),
      RA.andThrough(async ({ post, content }) => {
        // URLを抽出してOGP情報を取得
        const excludeHost = new URL(origin).host;
        const urls = extractUrlsFromHtml(content, excludeHost);

        if (urls.length === 0) {
          return RA.ok(undefined);
        }

        // 並列でOGP情報を取得
        const ogpResults = await Promise.allSettled(
          urls.map((url) => ogpFetcher.fetch(url)),
        );

        // 成功したOGP情報をLinkPreviewに変換
        const linkPreviews: LinkPreview[] = [];
        for (let i = 0; i < ogpResults.length; i++) {
          const result = ogpResults[i];
          if (result.status === 'fulfilled') {
            const ogp = result.value;
            // 少なくともタイトルか説明がある場合のみ保存
            if (ogp.title ?? ogp.description) {
              linkPreviews.push({
                linkPreviewId: LinkPreviewId.generate(),
                postId: post.postId,
                url: urls[i],
                title: ogp.title,
                description: ogp.description,
                imageUrl: ogp.imageUrl,
                faviconUrl: ogp.faviconUrl,
                siteName: ogp.siteName,
                createdAt: now,
              });
            }
          }
        }

        if (linkPreviews.length > 0) {
          await linkPreviewCreatedStore.store(linkPreviews);
        }

        return RA.ok(undefined);
      }),
      RA.andThrough(async ({ post, user, ctx, images, mentions }) => {
        const note = buildLocalNote({ ctx, identifier: user.username, post, images, origin });
        const createActivity = new Create({
          id: new URL('#activity', note.id ?? undefined),
          object: note,
          actors: note.attributionIds,
          tos: note.toIds,
          ccs: note.ccIds,
          attachments: images.map((image) => toImageDocument(image, origin)),
        });
        if (post.visibility !== 'direct') {
          await ctx.sendActivity({ identifier: user.username }, 'followers', createActivity);
        }
        await sendToMentions({
          ctx,
          identifier: user.username,
          activity: createActivity,
          mentions: mentions ?? [],
          visibility: post.visibility,
        });
        return RA.ok(undefined);
      }),
      // Send to accepted relays
      RA.andThrough(async ({ post, user, ctx, images }) => {
        if (post.visibility !== 'public') {
          return RA.ok(undefined);
        }
        const relaysResult = await acceptedRelaysResolver.resolve();
        if (!relaysResult.ok || relaysResult.val.length === 0) {
          return RA.ok(undefined);
        }

        const relays = relaysResult.val;
        const note = buildLocalNote({ ctx, identifier: user.username, post, images, origin });

        const createActivity = new Create({
          id: new URL('#activity', note.id ?? undefined),
          object: note,
          actors: note.attributionIds,
          tos: note.toIds,
          ccs: note.ccIds,
          attachments: images.map((image) => toImageDocument(image, origin)),
        });

        // Send to each relay's inbox
        for (const relay of relays) {
          try {
            await ctx.sendActivity(
              { identifier: user.username },
              {
                id: new URL(relay.actorUri),
                inboxId: new URL(relay.inboxUrl),
              },
              createActivity,
            );
            getLogger().info(`Sent post to relay: ${relay.actorUri}`);
          } catch (err) {
            getLogger().warn(`Failed to send post to relay ${relay.actorUri}: ${err}`);
          }
        }

        return RA.ok(undefined);
      }),
      RA.andThrough(async ({ post, crosspostToBluesky }) => {
        if (crosspostToBluesky !== false) {
          await scheduleBlueskyCrosspost?.run({ postId: post.postId });
        }
        return RA.ok(undefined);
      }),
      RA.map(({ post, user }) => ({ post, user })),
    );

  return { run };
};

export const createCreatePostUseCase = (deps: Deps): CreatePostUseCase => create(deps);

export const CreatePostUseCase = {
  create,
} as const;
