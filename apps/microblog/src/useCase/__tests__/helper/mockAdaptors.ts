import type { Context, RequestContext } from '@fedify/fedify';
import { Note } from '@fedify/fedify';
import type { RA } from '@iwasa-kosui/result';
import { RA as RAImpl } from '@iwasa-kosui/result';
import { vi } from 'vitest';

import type { ActorResolverByUserId, LocalActor } from '../../../domain/actor/actor.ts';
import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { LocalActorCreatedStore } from '../../../domain/actor/createLocalActor.ts';
import type {
  Follow,
  FollowAggregateId,
  FollowResolver,
  UndoFollowingProcessed,
  UndoFollowingProcessedStore,
} from '../../../domain/follow/follow.ts';
import type { PostImage, PostImageCreatedStore } from '../../../domain/image/image.ts';
import type { HashedPassword } from '../../../domain/password/password.ts';
import type {
  UserPassword,
  UserPasswordResolver,
  UserPasswordSetStore,
} from '../../../domain/password/userPassword.ts';
import type { PostCreated, PostCreatedStore } from '../../../domain/post/post.ts';
import type { Session, SessionResolver, SessionStartedStore } from '../../../domain/session/session.ts';
import type { SessionId } from '../../../domain/session/sessionId.ts';
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
