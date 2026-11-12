import z from 'zod/v4';

import { Schema } from '../../helper/schema.ts';
import { ActorId } from '../actor/actorId.ts';
import type { RemoteActorProfile } from '../actor/remoteActor.ts';
import { AggregateEvent, type DomainEvent } from '../aggregate/event.ts';
import type { Agg } from '../aggregate/index.ts';
import type { ImageId } from '../image/imageId.ts';
import { Instant } from '../instant/instant.ts';
import type { LinkPreview } from '../linkPreview/linkPreview.ts';
import type { PageRequest } from '../page/page.ts';
import { UserId } from '../user/userId.ts';
import type { Username } from '../user/username.ts';
import { PostId } from './postId.ts';
import { Visibility } from './visibility.ts';

const localPostZodType = z.object({
  type: z.literal('local'),
  postId: PostId.zodType,
  actorId: ActorId.zodType,
  content: z.string(),
  createdAt: Instant.zodType,
  userId: UserId.zodType,
  inReplyToUri: z.nullable(z.string()),
  summary: z.nullable(z.string()),
  sensitive: z.boolean(),
});
const remotePostZodType = z.object({
  type: z.literal('remote'),
  postId: PostId.zodType,
  actorId: ActorId.zodType,
  content: z.string(),
  createdAt: Instant.zodType,
  uri: z.string(),
  inReplyToUri: z.nullable(z.string()),
  visibility: z.nullable(Visibility.zodType),
  summary: z.nullable(z.string()),
  sensitive: z.boolean(),
});

export type LocalPost = z.infer<typeof localPostZodType>;
export const LocalPost = Schema.create(localPostZodType);
export type RemotePost = z.infer<typeof remotePostZodType>;
export const RemotePost = Schema.create(remotePostZodType);
export type Post = LocalPost | RemotePost;
export type PostImage = { imageId: ImageId; url: string; altText: string | null };
export type PostReaction = { emoji: string; count: number; emojiImageUrl: string | null };
export type PostWithAuthor = Post & {
  username: Username;
  logoUri: string | undefined;
  liked: boolean;
  reposted: boolean;
  images: PostImage[];
  likeCount: number;
  repostCount: number;
  reactions: PostReaction[];
  linkPreviews: LinkPreview[];
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
export type RemotePostCreated = PostEvent<
  RemotePost,
  'post.remotePostCreated',
  RemotePost & { recipientActorUris: ReadonlyArray<string> }
>;
export type PostDeleted = PostEvent<undefined, 'post.deleted', { postId: PostId; deletedAt: Instant }>;

const createPost = (now: Instant) =>
(
  payload:
    & Omit<LocalPost, 'type' | 'createdAt' | 'postId' | 'inReplyToUri' | 'summary' | 'sensitive'>
    & { inReplyToUri?: string | null; summary?: string | null; sensitive?: boolean },
): PostCreated => {
  const postId = PostId.generate();
  const post: LocalPost = {
    ...payload,
    postId,
    type: 'local',
    createdAt: now,
    inReplyToUri: payload.inReplyToUri ?? null,
    summary: payload.summary ?? null,
    sensitive: payload.sensitive ?? false,
  };
  return PostEvent.create(
    postId,
    post,
    'post.created',
    post,
    now,
  );
};

const createRemotePost = (now: Instant) =>
(
  payload:
    & Omit<RemotePost, 'type' | 'createdAt' | 'postId' | 'inReplyToUri' | 'summary' | 'sensitive'>
    & {
      inReplyToUri?: string | null;
      summary?: string | null;
      sensitive?: boolean;
      recipientActorUris?: ReadonlyArray<string>;
    },
): RemotePostCreated => {
  const { recipientActorUris = [], ...postPayload } = payload;
  const postId = PostId.generate();
  const post: RemotePost = {
    ...postPayload,
    postId,
    type: 'remote',
    createdAt: now,
    inReplyToUri: postPayload.inReplyToUri ?? null,
    summary: postPayload.summary ?? null,
    sensitive: postPayload.sensitive ?? false,
  };
  return PostEvent.create(
    postId,
    post,
    'post.remotePostCreated',
    { ...post, recipientActorUris },
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

const isVisibleToAnonymous = (post: Post): boolean =>
  post.type === 'local' || Visibility.isVisibleToAnonymous(post.visibility);

export const Post = {
  ...schema,
  createPost,
  createRemotePost,
  deletePost,
  isVisibleToAnonymous,
} as const;

export type PostCreatedStore = Agg.Store<PostCreated | RemotePostCreated>;
export type PostDeletedStore = Agg.Store<PostDeleted>;
export type PostResolver = Agg.Resolver<PostId, Post | undefined>;
export type PostResolverByUri = Agg.Resolver<{ uri: string }, RemotePost | undefined>;
export type LocalPostResolverByUri = Agg.Resolver<{ uri: string }, LocalPost | undefined>;
export type RemotePostUrisResolverByUris = Agg.Resolver<{ uris: readonly string[] }, readonly string[]>;
export type LocalPostUrisResolverByUris = Agg.Resolver<{ uris: readonly string[] }, readonly string[]>;
export type RemotePostAttachment = Readonly<{ url: string; altText: string | null }>;
export type RemotePostIdentity = Readonly<{
  uri: string;
  content: string;
  authorIdentity: Readonly<{
    uri: string;
    inboxUrl: string;
    url?: string;
    username?: string;
    logoUri?: string;
    profile?: RemoteActorProfile;
  }>;
  inReplyToUri?: string | null;
  summary?: string | null;
  sensitive?: boolean;
  visibility: Visibility | null;
  recipientActorUris?: ReadonlyArray<string>;
  attachments?: readonly RemotePostAttachment[];
}>;
export type RemotePostUpserter = Agg.Resolver<RemotePostIdentity, RemotePost>;
export type ThreadResolver = Agg.Resolver<
  { postId: PostId; currentActorId?: ActorId; onlyVisibleToViewer?: boolean },
  { currentPost: PostWithAuthor | null; ancestors: PostWithAuthor[]; descendants: PostWithAuthor[] }
>;
export type PostsWithAuthorResolverByPostIds = Agg.Resolver<
  { postIds: ReadonlyArray<PostId>; currentActorId: ActorId | undefined; onlyVisibleToViewer?: boolean },
  ReadonlyMap<PostId, PostWithAuthor>
>;
export type LocalPostsResolverByPage = Agg.Resolver<
  { currentActorId: ActorId | undefined; mutedActorIds: ReadonlyArray<ActorId>; page: PageRequest },
  PostWithAuthor[]
>;
export type PostsResolverByActorId = Agg.Resolver<ActorId, Post[]>;
export type PostsResolverByActorIds = Agg.Resolver<
  { actorIds: ActorId[]; currentActorId: ActorId | undefined; createdAt: Instant | undefined },
  (PostWithAuthor)[]
>;
export type PostsResolverByActorIdWithPagination = Agg.Resolver<
  { actorId: ActorId; currentActorId: ActorId | undefined; createdAt: Instant | undefined },
  (PostWithAuthor)[]
>;
export type LikedPostsResolverByActorId = Agg.Resolver<
  { actorId: ActorId; currentActorId: ActorId | undefined; createdAt: Instant | undefined },
  PostWithAuthor[]
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
