import type { Context, RequestContext } from '@fedify/fedify';
import { Note } from '@fedify/fedify';
import type { RA } from '@iwasa-kosui/result';
import { RA as RAImpl } from '@iwasa-kosui/result';
import { vi } from 'vitest';

import type { WebPushSender } from '../../../adaptor/webPush/webPushSender.ts';
import type {
  Actor,
  ActorResolverByUri,
  ActorResolverByUserId,
  ActorsResolverByFollowerId,
  ActorsResolverByFollowingId,
  LocalActor,
} from '../../../domain/actor/actor.ts';
import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { LocalActorCreatedStore } from '../../../domain/actor/createLocalActor.ts';
import type { RemoteActorCreated, RemoteActorCreatedStore } from '../../../domain/actor/remoteActor.ts';
import type { LogoUriUpdated, LogoUriUpdatedStore } from '../../../domain/actor/updateLogoUri.ts';
import type {
  Follow,
  FollowAccepted,
  FollowAcceptedStore,
  FollowAggregateId,
  FollowRequested,
  FollowRequestedStore,
  FollowResolver,
  UndoFollowingProcessed,
  UndoFollowingProcessedStore,
} from '../../../domain/follow/follow.ts';
import type { PostImage, PostImageCreatedStore, PostImagesResolverByPostId } from '../../../domain/image/image.ts';
import type { Like, LikeCreated, LikeCreatedStore, LikeResolver } from '../../../domain/like/like.ts';
import type {
  FollowNotificationCreated,
  FollowNotificationCreatedStore,
} from '../../../domain/notification/notification.ts';
import type { HashedPassword } from '../../../domain/password/password.ts';
import type {
  UserPassword,
  UserPasswordResolver,
  UserPasswordSetStore,
} from '../../../domain/password/userPassword.ts';
import type {
  Post,
  PostCreated,
  PostCreatedStore,
  PostDeleted,
  PostDeletedStore,
  PostResolver,
  PostsResolverByActorIds,
  PostsResolverByActorIdWithPagination,
  PostWithAuthor,
} from '../../../domain/post/post.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import type { PushSubscriptionsResolverByUserId } from '../../../domain/pushSubscription/pushSubscription.ts';
import type { Session, SessionResolver, SessionStartedStore } from '../../../domain/session/session.ts';
import type { SessionId } from '../../../domain/session/sessionId.ts';
import type {
  TimelineItem,
  TimelineItemCreated,
  TimelineItemCreatedStore,
  TimelineItemDeleted,
  TimelineItemDeletedStore,
  TimelineItemResolverByPostId,
  TimelineItemsResolverByActorIds,
  TimelineItemWithPost,
} from '../../../domain/timeline/timelineItem.ts';
import type { UserCreatedStore } from '../../../domain/user/createUser.ts';
import type { User, UserResolver, UserResolverByUsername } from '../../../domain/user/user.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { Username } from '../../../domain/user/username.ts';

type InMemoryStore<T> = {
  items: T[];
  store: (item: T) => RA<void, never>;
  clear: () => void;
};

const createInMemoryStore = <T>(): InMemoryStore<T> => {
  const items: T[] = [];
  return {
    items,
    store: (item: T) => {
      items.push(item);
      return RAImpl.ok(undefined) as RA<void, never>;
    },
    clear: () => {
      items.length = 0;
    },
  };
};

export const createMockUserResolverByUsername = (
  users: Map<Username, User> = new Map(),
): UserResolverByUsername & { setUser: (user: User) => void } => ({
  resolve: vi.fn((username: Username) => RAImpl.ok(users.get(username))),
  setUser: (user: User) => users.set(user.username, user),
});

export const createMockUserResolver = (
  users: Map<UserId, User> = new Map(),
): UserResolver & { setUser: (user: User) => void } => ({
  resolve: vi.fn((userId: UserId) => RAImpl.ok(users.get(userId))),
  setUser: (user: User) => users.set(user.id, user),
});

export const createMockUserCreatedStore = (): UserCreatedStore & InMemoryStore<unknown> => {
  const inMemoryStore = createInMemoryStore<unknown>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as UserCreatedStore['store'] & InMemoryStore<unknown>['store'],
  };
};

export const createMockLocalActorCreatedStore = (): LocalActorCreatedStore & InMemoryStore<unknown> => {
  const inMemoryStore = createInMemoryStore<unknown>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as LocalActorCreatedStore['store'] & InMemoryStore<unknown>['store'],
  };
};

export const createMockUserPasswordSetStore = (): UserPasswordSetStore & InMemoryStore<unknown> => {
  const inMemoryStore = createInMemoryStore<unknown>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as UserPasswordSetStore['store'] & InMemoryStore<unknown>['store'],
  };
};

export const createMockUserPasswordResolver = (
  passwords: Map<UserId, UserPassword> = new Map(),
): UserPasswordResolver & { setPassword: (userId: UserId, hashedPassword: HashedPassword) => void } => ({
  resolve: vi.fn((userId: UserId) => RAImpl.ok(passwords.get(userId))),
  setPassword: (userId: UserId, hashedPassword: HashedPassword) => passwords.set(userId, { userId, hashedPassword }),
});

export const createMockSessionStartedStore = (): SessionStartedStore & InMemoryStore<unknown> => {
  const inMemoryStore = createInMemoryStore<unknown>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as SessionStartedStore['store'] & InMemoryStore<unknown>['store'],
  };
};

export const createMockSessionResolver = (
  sessions: Map<SessionId, Session> = new Map(),
): SessionResolver & { setSession: (session: Session) => void } => ({
  resolve: vi.fn((sessionId: SessionId) => RAImpl.ok(sessions.get(sessionId))),
  setSession: (session: Session) => sessions.set(session.sessionId, session),
});

export const createMockPostCreatedStore = (): PostCreatedStore & InMemoryStore<PostCreated> => {
  const inMemoryStore = createInMemoryStore<PostCreated>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as PostCreatedStore['store'] & InMemoryStore<PostCreated>['store'],
  };
};

export const createMockPostImageCreatedStore = (): PostImageCreatedStore & InMemoryStore<PostImage[]> => {
  const inMemoryStore = createInMemoryStore<PostImage[]>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as
      & PostImageCreatedStore['store']
      & InMemoryStore<PostImage[]>['store'],
  };
};

export const createMockActorResolverByUserId = (
  actors: Map<UserId, LocalActor> = new Map(),
): ActorResolverByUserId & { setActor: (actor: LocalActor) => void } => ({
  resolve: vi.fn((userId: UserId) => RAImpl.ok(actors.get(userId))),
  setActor: (actor: LocalActor) => {
    actors.set(actor.userId, actor);
  },
});

export const createMockFedifyContext = (): Context<unknown> => {
  const mockNote = new Note({
    id: new URL('https://example.com/notes/1'),
    attribution: new URL('https://example.com/users/test'),
    to: new URL('https://www.w3.org/ns/activitystreams#Public'),
  });
  const mockContext = {
    getActorUri: vi.fn((username: string) => new URL(`https://example.com/users/${username}`)),
    getInboxUri: vi.fn((username: string) => new URL(`https://example.com/users/${username}/inbox`)),
    getActorKeyPairs: vi.fn().mockResolvedValue([]),
    getObject: vi.fn().mockResolvedValue(mockNote),
    getObjectUri: vi.fn((_type: unknown, args: { identifier: string; id: string }) =>
      new URL(`https://example.com/users/${args.identifier}/posts/${args.id}`)
    ),
    sendActivity: vi.fn().mockResolvedValue(undefined),
    data: {},
  } as unknown as Context<unknown>;
  return mockContext;
};

export const createMockRequestContext = (): RequestContext<unknown> => {
  const mockContext = {
    ...createMockFedifyContext(),
    request: new Request('https://example.com'),
    url: new URL('https://example.com'),
  } as unknown as RequestContext<unknown>;
  return mockContext;
};

const followKey = (followerId: ActorId, followingId: ActorId) => `${followerId}:${followingId}`;

export const createMockFollowResolver = (
  follows: Map<string, Follow> = new Map(),
): FollowResolver & {
  setFollow: (follow: Follow) => void;
  removeFollow: (followerId: ActorId, followingId: ActorId) => void;
} => ({
  resolve: vi.fn((aggregateId: FollowAggregateId) =>
    RAImpl.ok(follows.get(followKey(aggregateId.followerId, aggregateId.followingId)))
  ),
  setFollow: (follow: Follow) => follows.set(followKey(follow.followerId, follow.followingId), follow),
  removeFollow: (followerId: ActorId, followingId: ActorId) => follows.delete(followKey(followerId, followingId)),
});

export const createMockUnfollowedStore = (): UndoFollowingProcessedStore & InMemoryStore<UndoFollowingProcessed> => {
  const inMemoryStore = createInMemoryStore<UndoFollowingProcessed>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as
      & UndoFollowingProcessedStore['store']
      & InMemoryStore<UndoFollowingProcessed>['store'],
  };
};

export const createMockPostResolver = (
  posts: Map<PostId, Post> = new Map(),
): PostResolver & { setPost: (post: Post) => void } => ({
  resolve: vi.fn((postId: PostId) => RAImpl.ok(posts.get(postId))),
  setPost: (post: Post) => posts.set(post.postId, post),
});

export const createMockPostDeletedStore = (): PostDeletedStore & InMemoryStore<PostDeleted> => {
  const inMemoryStore = createInMemoryStore<PostDeleted>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as PostDeletedStore['store'] & InMemoryStore<PostDeleted>['store'],
  };
};

export const createMockPostImagesResolver = (
  images: Map<PostId, PostImage[]> = new Map(),
): PostImagesResolverByPostId & { setImages: (postId: PostId, imgs: PostImage[]) => void } => ({
  resolve: vi.fn((postId: PostId) => RAImpl.ok(images.get(postId) ?? [])),
  setImages: (postId: PostId, imgs: PostImage[]) => images.set(postId, imgs),
});

export const createMockActorResolverByUri = (
  actors: Map<string, Actor> = new Map(),
): ActorResolverByUri & { setActor: (actor: Actor) => void } => ({
  resolve: vi.fn((uri: string) => RAImpl.ok(actors.get(uri))),
  setActor: (actor: Actor) => actors.set(actor.uri, actor),
});

export const createMockActorResolverById = (
  actors: Map<ActorId, Actor> = new Map(),
): { resolve: (id: ActorId) => RA<Actor | undefined, never>; setActor: (actor: Actor) => void } => ({
  resolve: vi.fn((id: ActorId) => RAImpl.ok(actors.get(id))),
  setActor: (actor: Actor) => actors.set(actor.id, actor),
});

export const createMockActorsResolverByFollowerId = (
  actors: Map<ActorId, Actor[]> = new Map(),
): ActorsResolverByFollowerId & { setActors: (followerId: ActorId, following: Actor[]) => void } => ({
  resolve: vi.fn((followerId: ActorId) => RAImpl.ok(actors.get(followerId) ?? [])),
  setActors: (followerId: ActorId, following: Actor[]) => actors.set(followerId, following),
});

export const createMockActorsResolverByFollowingId = (
  actors: Map<ActorId, Actor[]> = new Map(),
): ActorsResolverByFollowingId & { setActors: (followingId: ActorId, followers: Actor[]) => void } => ({
  resolve: vi.fn((followingId: ActorId) => RAImpl.ok(actors.get(followingId) ?? [])),
  setActors: (followingId: ActorId, followers: Actor[]) => actors.set(followingId, followers),
});

export const createMockPostsResolverByActorIds = (
  posts: PostWithAuthor[] = [],
): PostsResolverByActorIds & { setPosts: (p: PostWithAuthor[]) => void } => ({
  resolve: vi.fn(() => RAImpl.ok(posts)),
  setPosts: (p: PostWithAuthor[]) => {
    posts.length = 0;
    posts.push(...p);
  },
});

export const createMockPostsResolverByActorIdWithPagination = (
  posts: PostWithAuthor[] = [],
): PostsResolverByActorIdWithPagination & { setPosts: (p: PostWithAuthor[]) => void } => ({
  resolve: vi.fn(() => RAImpl.ok(posts)),
  setPosts: (p: PostWithAuthor[]) => {
    posts.length = 0;
    posts.push(...p);
  },
});

export const createMockRemoteActorCreatedStore = (): RemoteActorCreatedStore & InMemoryStore<RemoteActorCreated> => {
  const inMemoryStore = createInMemoryStore<RemoteActorCreated>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as
      & RemoteActorCreatedStore['store']
      & InMemoryStore<RemoteActorCreated>['store'],
  };
};

export const createMockLogoUriUpdatedStore = (): LogoUriUpdatedStore & InMemoryStore<LogoUriUpdated> => {
  const inMemoryStore = createInMemoryStore<LogoUriUpdated>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as
      & LogoUriUpdatedStore['store']
      & InMemoryStore<LogoUriUpdated>['store'],
  };
};

export const createMockFollowAcceptedStore = (): FollowAcceptedStore & InMemoryStore<FollowAccepted> => {
  const inMemoryStore = createInMemoryStore<FollowAccepted>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as
      & FollowAcceptedStore['store']
      & InMemoryStore<FollowAccepted>['store'],
  };
};

export const createMockFollowRequestedStore = (): FollowRequestedStore & InMemoryStore<FollowRequested> => {
  const inMemoryStore = createInMemoryStore<FollowRequested>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as
      & FollowRequestedStore['store']
      & InMemoryStore<FollowRequested>['store'],
  };
};

export const createMockLikeCreatedStore = (): LikeCreatedStore & InMemoryStore<LikeCreated> => {
  const inMemoryStore = createInMemoryStore<LikeCreated>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as
      & LikeCreatedStore['store']
      & InMemoryStore<LikeCreated>['store'],
  };
};

export const createMockLikeResolver = (
  likes: Map<string, Like> = new Map(),
): LikeResolver & { setLike: (like: Like) => void } => {
  const key = (actorId: ActorId, objectUri: string) => `${actorId}:${objectUri}`;
  return {
    resolve: vi.fn(({ actorId, objectUri }: { actorId: ActorId; objectUri: string }) =>
      RAImpl.ok(likes.get(key(actorId, objectUri)))
    ),
    setLike: (like: Like) => likes.set(key(like.actorId, like.objectUri), like),
  };
};

export const createMockFollowNotificationCreatedStore = ():
  & FollowNotificationCreatedStore
  & InMemoryStore<FollowNotificationCreated> =>
{
  const inMemoryStore = createInMemoryStore<FollowNotificationCreated>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as
      & FollowNotificationCreatedStore['store']
      & InMemoryStore<FollowNotificationCreated>['store'],
  };
};

export const createMockPushSubscriptionsResolverByUserId = (): PushSubscriptionsResolverByUserId => ({
  resolve: vi.fn(() => RAImpl.ok([])),
});

export const createMockWebPushSender = (): WebPushSender => ({
  send: vi.fn(() => RAImpl.ok(undefined)),
});

export const createMockTimelineItemCreatedStore = (): TimelineItemCreatedStore & InMemoryStore<TimelineItemCreated> => {
  const inMemoryStore = createInMemoryStore<TimelineItemCreated>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as
      & TimelineItemCreatedStore['store']
      & InMemoryStore<TimelineItemCreated>['store'],
  };
};

export const createMockTimelineItemDeletedStore = (): TimelineItemDeletedStore & InMemoryStore<TimelineItemDeleted> => {
  const inMemoryStore = createInMemoryStore<TimelineItemDeleted>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as
      & TimelineItemDeletedStore['store']
      & InMemoryStore<TimelineItemDeleted>['store'],
  };
};

export const createMockTimelineItemResolverByPostId = (
  items: Map<PostId, TimelineItem> = new Map(),
): TimelineItemResolverByPostId & { setItem: (item: TimelineItem) => void } => ({
  resolve: vi.fn(({ postId }: { postId: PostId }) => RAImpl.ok(items.get(postId))),
  setItem: (item: TimelineItem) => items.set(item.postId, item),
});

export const createMockTimelineItemsResolverByActorIds = (
  items: TimelineItemWithPost[] = [],
): TimelineItemsResolverByActorIds & { setItems: (i: TimelineItemWithPost[]) => void } => ({
  resolve: vi.fn(() => RAImpl.ok(items)),
  setItems: (i: TimelineItemWithPost[]) => {
    items.length = 0;
    items.push(...i);
  },
});
