import type { Context, RequestContext } from '@fedify/fedify';
import { Note } from '@fedify/fedify';
import type { RA } from '@iwasa-kosui/result';
import { RA as RAImpl } from '@iwasa-kosui/result';
import { vi } from 'vitest';

import type { LocalPostResolverByUri } from '../../../adaptor/pg/post/localPostResolverByUri.ts';
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
  EmojiReact,
  EmojiReactDeleted,
  EmojiReactDeletedStore,
  EmojiReactsResolverByPostId,
} from '../../../domain/emojiReact/emojiReact.ts';
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
import type {
  Like,
  LikeCreated,
  LikeCreatedStore,
  LikeDeleted,
  LikeDeletedStore,
  LikeResolver,
  LikesResolverByPostId,
} from '../../../domain/like/like.ts';
import type { Mute, MutedActorIdsResolverByUserId, MuteResolver } from '../../../domain/mute/mute.ts';
import type {
  EmojiReactNotification,
  EmojiReactNotificationDeleted,
  EmojiReactNotificationDeletedStore,
  EmojiReactNotificationsResolverByPostId,
  FollowNotificationCreated,
  FollowNotificationCreatedStore,
  LikeNotification,
  LikeNotificationDeleted,
  LikeNotificationDeletedStore,
  LikeNotificationsResolverByPostId,
  ReplyNotification,
  ReplyNotificationCreated,
  ReplyNotificationCreatedStore,
  ReplyNotificationDeleted,
  ReplyNotificationDeletedStore,
  ReplyNotificationsResolverByOriginalPostId,
  ReplyNotificationsResolverByReplyPostId,
} from '../../../domain/notification/notification.ts';
import type { HashedPassword } from '../../../domain/password/password.ts';
import type {
  UserPassword,
  UserPasswordResolver,
  UserPasswordSetStore,
} from '../../../domain/password/userPassword.ts';
import type {
  LocalPost,
  Post,
  PostCreated,
  PostCreatedStore,
  PostDeleted,
  PostDeletedStore,
  PostQuery,
  PostResolver,
  PostsResolverByActorIds,
  PostsResolverByActorIdWithPagination,
} from '../../../domain/post/post.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import type { PushSubscriptionsResolverByUserId } from '../../../domain/pushSubscription/pushSubscription.ts';
import type {
  Repost,
  RepostDeleted,
  RepostDeletedStore,
  RepostsResolverByPostId,
} from '../../../domain/repost/repost.ts';
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
  posts: PostQuery[] = [],
): PostsResolverByActorIds & { setPosts: (p: PostQuery[]) => void } => ({
  resolve: vi.fn(() => RAImpl.ok(posts)),
  setPosts: (p: PostQuery[]) => {
    posts.length = 0;
    posts.push(...p);
  },
});

export const createMockPostsResolverByActorIdWithPagination = (
  posts: PostQuery[] = [],
): PostsResolverByActorIdWithPagination & { setPosts: (p: PostQuery[]) => void } => ({
  resolve: vi.fn(() => RAImpl.ok(posts)),
  setPosts: (p: PostQuery[]) => {
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
  const key = (actorId: ActorId, postId: PostId) => `${actorId}:${postId}`;
  return {
    resolve: vi.fn(({ actorId, postId }: { actorId: ActorId; postId: PostId }) =>
      RAImpl.ok(likes.get(key(actorId, postId)))
    ),
    setLike: (like: Like) => likes.set(key(like.actorId, like.postId), like),
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

export const createMockLikeNotificationDeletedStore = ():
  & LikeNotificationDeletedStore
  & InMemoryStore<LikeNotificationDeleted> =>
{
  const inMemoryStore = createInMemoryStore<LikeNotificationDeleted>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as
      & LikeNotificationDeletedStore['store']
      & InMemoryStore<LikeNotificationDeleted>['store'],
  };
};

export const createMockLikeNotificationsResolverByPostId = (
  notifications: Map<PostId, LikeNotification[]> = new Map(),
): LikeNotificationsResolverByPostId & { setNotifications: (postId: PostId, n: LikeNotification[]) => void } => ({
  resolve: vi.fn(({ postId }: { postId: PostId }) => RAImpl.ok(notifications.get(postId) ?? [])),
  setNotifications: (postId: PostId, n: LikeNotification[]) => notifications.set(postId, n),
});

export const createMockRepostDeletedStore = (): RepostDeletedStore & InMemoryStore<RepostDeleted> => {
  const inMemoryStore = createInMemoryStore<RepostDeleted>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as
      & RepostDeletedStore['store']
      & InMemoryStore<RepostDeleted>['store'],
  };
};

export const createMockRepostsResolverByPostId = (
  reposts: Map<PostId, Repost[]> = new Map(),
): RepostsResolverByPostId & { setReposts: (postId: PostId, r: Repost[]) => void } => ({
  resolve: vi.fn(({ postId }: { postId: PostId }) => RAImpl.ok(reposts.get(postId) ?? [])),
  setReposts: (postId: PostId, r: Repost[]) => reposts.set(postId, r),
});

export const createMockLocalPostResolverByUri = (
  posts: Map<string, LocalPost> = new Map(),
): LocalPostResolverByUri & { setPost: (uri: string, post: LocalPost) => void } => ({
  resolve: vi.fn(({ uri }: { uri: string }) => RAImpl.ok(posts.get(uri))),
  setPost: (uri: string, post: LocalPost) => posts.set(uri, post),
});

export const createMockReplyNotificationCreatedStore = ():
  & ReplyNotificationCreatedStore
  & InMemoryStore<ReplyNotificationCreated> =>
{
  const inMemoryStore = createInMemoryStore<ReplyNotificationCreated>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as
      & ReplyNotificationCreatedStore['store']
      & InMemoryStore<ReplyNotificationCreated>['store'],
  };
};

export const createMockReplyNotificationDeletedStore = ():
  & ReplyNotificationDeletedStore
  & InMemoryStore<ReplyNotificationDeleted> =>
{
  const inMemoryStore = createInMemoryStore<ReplyNotificationDeleted>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as
      & ReplyNotificationDeletedStore['store']
      & InMemoryStore<ReplyNotificationDeleted>['store'],
  };
};

export const createMockReplyNotificationsResolverByReplyPostId = (
  notifications: Map<PostId, ReplyNotification[]> = new Map(),
): ReplyNotificationsResolverByReplyPostId & {
  setNotifications: (postId: PostId, n: ReplyNotification[]) => void;
} => ({
  resolve: vi.fn(({ replyPostId }: { replyPostId: PostId }) => RAImpl.ok(notifications.get(replyPostId) ?? [])),
  setNotifications: (postId: PostId, n: ReplyNotification[]) => notifications.set(postId, n),
});

export const createMockReplyNotificationsResolverByOriginalPostId = (
  notifications: Map<PostId, ReplyNotification[]> = new Map(),
): ReplyNotificationsResolverByOriginalPostId & {
  setNotifications: (postId: PostId, n: ReplyNotification[]) => void;
} => ({
  resolve: vi.fn(({ originalPostId }: { originalPostId: PostId }) =>
    RAImpl.ok(notifications.get(originalPostId) ?? [])
  ),
  setNotifications: (postId: PostId, n: ReplyNotification[]) => notifications.set(postId, n),
});

export const createMockEmojiReactNotificationDeletedStore = ():
  & EmojiReactNotificationDeletedStore
  & InMemoryStore<EmojiReactNotificationDeleted> =>
{
  const inMemoryStore = createInMemoryStore<EmojiReactNotificationDeleted>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as
      & EmojiReactNotificationDeletedStore['store']
      & InMemoryStore<EmojiReactNotificationDeleted>['store'],
  };
};

export const createMockEmojiReactNotificationsResolverByPostId = (
  notifications: Map<PostId, EmojiReactNotification[]> = new Map(),
): EmojiReactNotificationsResolverByPostId & {
  setNotifications: (postId: PostId, n: EmojiReactNotification[]) => void;
} => ({
  resolve: vi.fn(({ postId }: { postId: PostId }) => RAImpl.ok(notifications.get(postId) ?? [])),
  setNotifications: (postId: PostId, n: EmojiReactNotification[]) => notifications.set(postId, n),
});

export const createMockMutedActorIdsResolverByUserId = (
  mutedActorIds: Map<UserId, ActorId[]> = new Map(),
): MutedActorIdsResolverByUserId & { setMutedActorIds: (userId: UserId, actorIds: ActorId[]) => void } => ({
  resolve: vi.fn((userId: UserId) => RAImpl.ok(mutedActorIds.get(userId) ?? [])),
  setMutedActorIds: (userId: UserId, actorIds: ActorId[]) => mutedActorIds.set(userId, actorIds),
});

const muteKey = (userId: UserId, mutedActorId: ActorId) => `${userId}:${mutedActorId}`;

export const createMockMuteResolver = (
  mutes: Map<string, Mute> = new Map(),
): MuteResolver & { setMute: (mute: Mute) => void; removeMute: (userId: UserId, mutedActorId: ActorId) => void } => ({
  resolve: vi.fn(({ userId, mutedActorId }: { userId: UserId; mutedActorId: ActorId }) =>
    RAImpl.ok(mutes.get(muteKey(userId, mutedActorId)))
  ),
  setMute: (mute: Mute) => mutes.set(muteKey(mute.userId, mute.mutedActorId), mute),
  removeMute: (userId: UserId, mutedActorId: ActorId) => mutes.delete(muteKey(userId, mutedActorId)),
});

export const createMockLikeDeletedStore = (): LikeDeletedStore & InMemoryStore<LikeDeleted> => {
  const inMemoryStore = createInMemoryStore<LikeDeleted>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as
      & LikeDeletedStore['store']
      & InMemoryStore<LikeDeleted>['store'],
  };
};

export const createMockLikesResolverByPostId = (
  likes: Map<PostId, Like[]> = new Map(),
): LikesResolverByPostId & { setLikes: (postId: PostId, l: Like[]) => void } => ({
  resolve: vi.fn(({ postId }: { postId: PostId }) => RAImpl.ok(likes.get(postId) ?? [])),
  setLikes: (postId: PostId, l: Like[]) => likes.set(postId, l),
});

export const createMockEmojiReactDeletedStore = (): EmojiReactDeletedStore & InMemoryStore<EmojiReactDeleted> => {
  const inMemoryStore = createInMemoryStore<EmojiReactDeleted>();
  return {
    ...inMemoryStore,
    store: vi.fn(inMemoryStore.store) as unknown as
      & EmojiReactDeletedStore['store']
      & InMemoryStore<EmojiReactDeleted>['store'],
  };
};

export const createMockEmojiReactsResolverByPostId = (
  emojiReacts: Map<PostId, EmojiReact[]> = new Map(),
): EmojiReactsResolverByPostId & { setEmojiReacts: (postId: PostId, e: EmojiReact[]) => void } => ({
  resolve: vi.fn(({ postId }: { postId: PostId }) => RAImpl.ok(emojiReacts.get(postId) ?? [])),
  setEmojiReacts: (postId: PostId, e: EmojiReact[]) => emojiReacts.set(postId, e),
});
