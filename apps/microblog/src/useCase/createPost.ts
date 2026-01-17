import { Create, Document, Note, type RequestContext } from '@fedify/fedify';
import { RA } from '@iwasa-kosui/result';
import z from 'zod/v4';

import type { ActorResolverByUserId } from '../domain/actor/actor.ts';
import type { PostImage, PostImageCreatedStore } from '../domain/image/image.ts';
import { ImageId } from '../domain/image/imageId.ts';
import { getMimeTypeFromUrl } from '../domain/image/mimeType.ts';
import { Instant } from '../domain/instant/instant.ts';
import { Post, type PostCreatedStore } from '../domain/post/post.ts';
import { SessionExpiredError, type SessionResolver } from '../domain/session/session.ts';
import { SessionId } from '../domain/session/sessionId.ts';
import { TimelineItem, type TimelineItemCreatedStore } from '../domain/timeline/timelineItem.ts';
import { TimelineItemId } from '../domain/timeline/timelineItemId.ts';
import { User, UserNotFoundError, type UserResolver } from '../domain/user/user.ts';
import { Env } from '../env.ts';
import { Schema } from '../helper/schema.ts';
import { resolveLocalActorWith, resolveSessionWith, resolveUserWith } from './helper/resolve.ts';
import type { UseCase } from './useCase.ts';

type Input = Readonly<{
  sessionId: SessionId;
  content: string;
  imageUrls: string[];
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
}>;

const create = ({
  sessionResolver,
  postCreatedStore,
  userResolver,
  actorResolverByUserId,
  postImageCreatedStore,
  timelineItemCreatedStore,
}: Deps): CreatePostUseCase => {
  const now = Instant.now();
  const resolveSession = resolveSessionWith(sessionResolver, now);
  const resolveUser = resolveUserWith(userResolver);
  const resolveLocalActor = resolveLocalActorWith(actorResolverByUserId);

  const run = async (input: Input) =>
    RA.flow(
      RA.ok(input),
      RA.andBind('session', ({ sessionId }) => resolveSession(sessionId)),
      RA.andBind('user', ({ session }) => resolveUser(session.userId)),
      RA.andBind('actor', ({ user }) => resolveLocalActor(user.id)),
      RA.andBind('postEvent', ({ actor, content }) => {
        const postEvent = Post.createPost(now)({
          actorId: actor.id,
          content,
          userId: actor.userId,
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
      RA.andBind('images', async ({ post, imageUrls }) => {
        if (imageUrls.length > 0) {
          const images: PostImage[] = imageUrls.map((url) => ({
            imageId: ImageId.generate(),
            postId: post.postId,
            url,
            altText: null,
            createdAt: now,
          }));
          await postImageCreatedStore.store(images);
          return RA.ok(images);
        }
        return RA.ok([]);
      }),
      RA.andThrough(async ({ post, user, ctx, images }) => {
        const noteArgs = { identifier: user.username, id: post.postId };
        const note = await ctx.getObject(Note, noteArgs);
        await ctx.sendActivity(
          { identifier: user.username },
          'followers',
          new Create({
            id: new URL('#activity', note?.id ?? undefined),
            object: note,
            actors: note?.attributionIds,
            tos: note?.toIds,
            ccs: note?.ccIds,
            attachments: images.map(
              (image) =>
                new Document({
                  url: new URL(`${Env.getInstance().ORIGIN}${image.url}`),
                  mediaType: getMimeTypeFromUrl(image.url),
                }),
            ),
          }),
        );
        return RA.ok(undefined);
      }),
      RA.map(({ post, user }) => ({ post, user })),
    );

  return { run };
};

export const CreatePostUseCase = {
  create,
} as const;
