import z from "zod";
import { PostId } from "./postId.ts";
import { ActorId } from "../actor/actorId.ts";
import { Instant } from "../instant/instant.ts";
import { Schema } from "../../helper/schema.ts";
import type { Agg } from "../aggregate/index.ts";
import { AggregateEvent, type DomainEvent } from "../aggregate/event.ts";
import type { Context } from "@fedify/fedify";
import { UserId } from "../user/userId.ts";

const localPostZodType = z.object({
  type: z.literal('local'),
  postId: PostId.zodType,
  actorId: ActorId.zodType,
  content: z.string(),
  createdAt: Instant.zodType,
  userId: UserId.zodType,
})
const remotePostZodType = z.object({
  type: z.literal('remote'),
  postId: PostId.zodType,
  actorId: ActorId.zodType,
  content: z.string(),
  createdAt: Instant.zodType,
  uri: z.string(),
})

export type LocalPost = z.infer<typeof localPostZodType>;
export const LocalPost = Schema.create(localPostZodType);
export type RemotePost = z.infer<typeof remotePostZodType>;
export const RemotePost = Schema.create(remotePostZodType);
export type Post = LocalPost | RemotePost;

const zodType = z.union([localPostZodType, remotePostZodType]);
const schema = Schema.create(zodType);
type PostAggregate = Agg.Aggregate<PostId, 'post', Post>;

export type PostEvent<TAggregateState extends Agg.InferState<PostAggregate> | undefined,
  TEventName extends string,
  TEventPayload extends Record<string, unknown>
> = DomainEvent<PostAggregate, TAggregateState, TEventName, TEventPayload>;

export const PostEvent = AggregateEvent.createFactory<PostAggregate>('post');

export type PostCreated = PostEvent<Post, 'post.created', Post>;

const createPost = (now: Instant) => (payload: Omit<LocalPost, "type" | 'createdAt' | 'postId'>): PostCreated => {
  const postId = PostId.generate();
  const post: LocalPost = {
    ...payload,
    postId,
    type: 'local',
    createdAt: now,
  };
  return PostEvent.create(
    postId,
    post,
    'post.created',
    post,
    now,
  );
}

export const Post = {
  ...schema,
  createPost,
} as const;

export type PostCreatedStore = Agg.Store<PostCreated>;
export type PostResolver = Agg.Resolver<PostId, Post | undefined>;
export type PostsResolverByActorId = Agg.Resolver<ActorId, Post[]>;
export type PostNotFoundError = Readonly<{
  type: 'PostNotFoundError';
  message: string;
  detail: {
    postId: PostId;
  }
}>;

export const PostNotFoundError = {
  create: (postId: PostId): PostNotFoundError => ({
    type: 'PostNotFoundError',
    message: `The post with ID "${postId}" was not found.`,
    detail: { postId },
  }),
} as const;
