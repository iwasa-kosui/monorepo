import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import { Instant } from '../instant/instant.ts';
import { UserId } from '../user/userId.ts';
import type { Username } from '../user/username.ts';
import { PostId } from './postId.ts';

const localPostZodType = z.object({
  type: z.literal('local'),
  postId: PostId.zodType,
  actorId: ActorId.zodType,
  content: z.string(),
  createdAt: Instant.zodType,
  userId: UserId.zodType,
  inReplyToUri: z.nullable(z.string()),
});
const remotePostZodType = z.object({
  type: z.literal('remote'),
  postId: PostId.zodType,
  actorId: ActorId.zodType,
  content: z.string(),
  createdAt: Instant.zodType,
  uri: z.string(),
});

export type LocalPost = z.infer<typeof localPostZodType>;
export const LocalPost = Schema.create(localPostZodType);
export type RemotePost = z.infer<typeof remotePostZodType>;
export const RemotePost = Schema.create(remotePostZodType);
export type Post = LocalPost | RemotePost;
export type PostImage = { url: string; altText: string | null };
export type PostWithAuthor = Post & {
  username: Username;
  logoUri: string | undefined;
  liked: boolean;
  images: PostImage[];
};

const zodType = z.union([localPostZodType, remotePostZodType]);
const schema = Schema.create(zodType);
type PostAggregate = Agg.Aggregate<PostId, 'post', Post>;

export type PostEvent<
  TAggregateState extends Agg.InferState<PostAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>,
> = DomainEvent<PostAggregate, TAggregateState, TEventName, TEventPayload>;

export const PostEvent = AggregateEvent.createFactory<PostAggregate>('post');

export type PostCreated = PostEvent<Post, 'post.created', Post>;
export type RemotePostCreated = PostEvent<RemotePost, 'post.remotePostCreated', RemotePost>;
export type PostDeleted = PostEvent<undefined, 'post.deleted', { postId: PostId; deletedAt: Instant }>;

const createPost = (now: Instant) =>
(
  payload: Omit<LocalPost, 'type' | 'createdAt' | 'postId' | 'inReplyToUri'> & { inReplyToUri?: string | null },
): PostCreated => {
  const postId = PostId.generate();
  const post: LocalPost = {
    ...payload,
    postId,
    type: 'local',
    createdAt: now,
    inReplyToUri: payload.inReplyToUri ?? null,
  };
  return PostEvent.create(
    postId,
    post,
    'post.created',
    post,
    now,
  );
};

const createRemotePost =
  (now: Instant) => (payload: Omit<RemotePost, 'type' | 'createdAt' | 'postId'>): RemotePostCreated => {
    const postId = PostId.generate();
    const post: RemotePost = {
      ...payload,
      postId,
      type: 'remote',
      createdAt: now,
    };
    return PostEvent.create(
      postId,
      post,
      'post.remotePostCreated',
      post,
      Instant.now(),
    );
  };

const deletePost = (now: Instant) => (postId: PostId): PostDeleted => {
  return PostEvent.create(
    postId,
    undefined,
    'post.deleted',
    { postId, deletedAt: now },
    now,
  );
};

export const Post = {
  ...schema,
  createPost,
  createRemotePost,
  deletePost,
} as const;

export type PostCreatedStore = Agg.Store<PostCreated | RemotePostCreated>;
export type PostDeletedStore = Agg.Store<PostDeleted>;
export type PostResolver = Agg.Resolver<PostId, Post | undefined>;
export type PostsResolverByActorId = Agg.Resolver<ActorId, Post[]>;
export type PostsResolverByActorIds = Agg.Resolver<
  { actorIds: ActorId[]; currentActorId: ActorId | undefined; createdAt: Instant | undefined },
  (PostWithAuthor)[]
>;
export type PostsResolverByActorIdWithPagination = Agg.Resolver<
  { actorId: ActorId; currentActorId: ActorId | undefined; createdAt: Instant | undefined },
  (PostWithAuthor)[]
>;
export type PostNotFoundError = Readonly<{
  type: 'PostNotFoundError';
  message: string;
  detail: {
    postId: PostId;
  };
}>;

export const PostNotFoundError = {
  create: (postId: PostId): PostNotFoundError => ({
    type: 'PostNotFoundError',
    message: `The post with ID "${postId}" was not found.`,
    detail: { postId },
  }),
} as const;
