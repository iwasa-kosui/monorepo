import fc from 'fast-check';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { LocalActor } from '../../../domain/actor/localActor.ts';
import type { RemoteActor } from '../../../domain/actor/remoteActor.ts';
import type { Instant } from '../../../domain/instant/instant.ts';
import type { HashedPassword, Password } from '../../../domain/password/password.ts';
import type { LocalPost, RemotePost } from '../../../domain/post/post.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import type { Session } from '../../../domain/session/session.ts';
import type { SessionId } from '../../../domain/session/sessionId.ts';
import type { User } from '../../../domain/user/user.ts';
import type { UserId } from '../../../domain/user/userId.ts';
import type { Username } from '../../../domain/user/username.ts';

export const arbUserId = (): fc.Arbitrary<UserId> => fc.uuid().map((uuid) => uuid as UserId);

export const arbUsername = (): fc.Arbitrary<Username> =>
  fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_'), { minLength: 1, maxLength: 255 })
    .map((s) => s as Username);

export const arbAcceptableUsername = (): fc.Arbitrary<Username> => fc.constant('kosui' as Username);

export const arbPassword = (): fc.Arbitrary<Password> =>
  fc.string({ minLength: 16, maxLength: 255 }).map((s) => s as Password);

export const arbUser = (): fc.Arbitrary<User> =>
  fc.record({
    id: arbUserId(),
    username: arbUsername(),
  }) as fc.Arbitrary<User>;

export const arbSessionId = (): fc.Arbitrary<SessionId> => fc.uuid().map((uuid) => uuid as SessionId);

export const arbInstant = (): fc.Arbitrary<number> =>
  fc.integer({ min: 0, max: Date.now() + 1000 * 60 * 60 * 24 * 365 * 10 });

export const arbSession = (opts?: { expired?: boolean }): fc.Arbitrary<Session> => {
  const now = Date.now();
  return fc.record({
    sessionId: arbSessionId(),
    userId: arbUserId(),
    expires: opts?.expired
      ? fc.integer({ min: 0, max: now - 1 }).map((n) => n as Session['expires'])
      : fc.integer({ min: now + 1000, max: now + 1000 * 60 * 60 * 24 * 365 }).map((n) => n as Session['expires']),
  }) as fc.Arbitrary<Session>;
};

export const arbHashedPassword = (): fc.Arbitrary<HashedPassword> =>
  fc.record({
    algorithm: fc.constant('argon2id' as const),
    parallelism: fc.constant(4),
    tagLength: fc.constant(64),
    memory: fc.constant(65536),
    passes: fc.constant(3),
    nonceHex: fc.hexaString({ minLength: 32, maxLength: 32 }),
    tagHex: fc.hexaString({ minLength: 128, maxLength: 128 }),
  });

export const arbContent = (): fc.Arbitrary<string> => fc.string({ minLength: 1, maxLength: 500 });

export const arbImageUrl = (): fc.Arbitrary<string> => fc.webUrl().map((url) => `${url}/image.png`);

export const arbActorId = (): fc.Arbitrary<ActorId> => fc.uuid().map((uuid) => uuid as ActorId);

export const arbPostId = (): fc.Arbitrary<PostId> => fc.uuid().map((uuid) => uuid as PostId);

export const arbLocalActor = (userId?: UserId): fc.Arbitrary<LocalActor> =>
  fc.record({
    id: arbActorId(),
    userId: userId ? fc.constant(userId) : arbUserId(),
    uri: fc.webUrl().map((url) => `${url}/users/test`),
    inboxUrl: fc.webUrl().map((url) => `${url}/inbox`),
    type: fc.constant('local' as const),
    logoUri: fc.option(fc.webUrl(), { nil: undefined }),
  }) as fc.Arbitrary<LocalActor>;

export const arbValidSession = (userId?: UserId): fc.Arbitrary<Session> => {
  const now = Date.now();
  return fc.record({
    sessionId: arbSessionId(),
    userId: userId ? fc.constant(userId) : arbUserId(),
    expires: fc.integer({ min: now + 1000, max: now + 1000 * 60 * 60 * 24 * 365 }).map((n) => n as Session['expires']),
  }) as fc.Arbitrary<Session>;
};

export const arbImageUrls = (): fc.Arbitrary<string[]> => fc.array(arbImageUrl(), { minLength: 0, maxLength: 4 });

export const arbRemoteActor = (): fc.Arbitrary<RemoteActor> =>
  fc.record({
    id: arbActorId(),
    uri: fc.webUrl().map((url) => `${url}/users/remote`),
    inboxUrl: fc.webUrl().map((url) => `${url}/inbox`),
    type: fc.constant('remote' as const),
    username: fc.option(
      fc.stringOf(fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'), { minLength: 1, maxLength: 20 }),
      {
        nil: undefined,
      },
    ),
    url: fc.option(fc.webUrl(), { nil: undefined }),
    logoUri: fc.option(fc.webUrl(), { nil: undefined }),
  }) as fc.Arbitrary<RemoteActor>;

export const arbLocalPost = (actorId?: ActorId, userId?: UserId): fc.Arbitrary<LocalPost> =>
  fc.record({
    type: fc.constant('local' as const),
    postId: arbPostId(),
    actorId: actorId ? fc.constant(actorId) : arbActorId(),
    content: arbContent(),
    createdAt: fc.integer({ min: 0, max: Date.now() }).map((n) => n as Instant),
    userId: userId ? fc.constant(userId) : arbUserId(),
  }) as fc.Arbitrary<LocalPost>;

export const arbRemotePost = (actorId?: ActorId): fc.Arbitrary<RemotePost> =>
  fc.record({
    type: fc.constant('remote' as const),
    postId: arbPostId(),
    actorId: actorId ? fc.constant(actorId) : arbActorId(),
    content: arbContent(),
    createdAt: fc.integer({ min: 0, max: Date.now() }).map((n) => n as Instant),
    uri: fc.webUrl().map((url) => `${url}/posts/${crypto.randomUUID()}`),
  }) as fc.Arbitrary<RemotePost>;
