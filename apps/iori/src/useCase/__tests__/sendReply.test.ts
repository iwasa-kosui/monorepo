import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { LocalPost } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { Session } from '../../domain/session/session.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { SendReplyUseCase } from '../sendReply.ts';
import {
  createMockActorResolverByUserId,
  createMockLocalPostResolverByUri,
  createMockPostCreatedStore,
  createMockPostImageCreatedStore,
  createMockPostResolver,
  createMockPushSubscriptionsResolverByUserId,
  createMockReplyNotificationCreatedStore,
  createMockRequestContext,
  createMockSessionResolver,
  createMockTimelineItemCreatedStore,
  createMockUserResolver,
  createMockWebPushSender,
} from './helper/mockAdaptors.ts';

const createContext = () =>
  Object.assign(createMockRequestContext(), {
    getFollowersUri: vi.fn((username: string) => new URL(`https://example.com/users/${username}/followers`)),
  });

describe('SendReplyUseCase の Bluesky への投稿の予約', () => {
  const setup = () => {
    const user: User = { id: crypto.randomUUID() as User['id'], username: 'kosui' as Username };
    const session: Session = {
      sessionId: crypto.randomUUID() as Session['sessionId'],
      userId: user.id,
      expires: (Date.now() + 1000 * 60 * 60 * 24) as Session['expires'],
    };
    const actor: LocalActor = {
      id: crypto.randomUUID() as LocalActor['id'],
      userId: user.id,
      uri: 'https://example.com/users/kosui',
      inboxUrl: 'https://example.com/inbox',
      type: 'local',
      logoUri: undefined,
    };
    const parent: LocalPost = {
      type: 'local',
      summary: null,
      sensitive: false,
      postId: crypto.randomUUID() as PostId,
      actorId: actor.id,
      content: 'parent',
      createdAt: Date.now() as LocalPost['createdAt'],
      userId: user.id,
      inReplyToUri: null,
    };
    const sessionResolver = createMockSessionResolver();
    sessionResolver.setSession(session);
    const userResolver = createMockUserResolver();
    userResolver.setUser(user);
    const actorResolverByUserId = createMockActorResolverByUserId();
    actorResolverByUserId.setActor(actor);
    const postResolver = createMockPostResolver();
    postResolver.setPost(parent);
    const deps = {
      sessionResolver,
      userResolver,
      actorResolverByUserId,
      postCreatedStore: createMockPostCreatedStore(),
      postImageCreatedStore: createMockPostImageCreatedStore(),
      timelineItemCreatedStore: createMockTimelineItemCreatedStore(),
      localPostResolverByUri: createMockLocalPostResolverByUri(),
      replyNotificationCreatedStore: createMockReplyNotificationCreatedStore(),
      pushSubscriptionsResolver: createMockPushSubscriptionsResolverByUserId(),
      webPushSender: createMockWebPushSender(),
      postResolver,
      origin: 'https://example.com',
    };
    return { deps, session, parent };
  };

  it('返信の保存と配送のあとに、作った返信の ID で予約する', async () => {
    const { deps, session, parent } = setup();
    const scheduleBlueskyCrosspost = { run: vi.fn(async () => RA.ok('pending' as const)) };
    const ctx = createContext();

    const result = await SendReplyUseCase.create({ ...deps, scheduleBlueskyCrosspost }).run({
      sessionId: session.sessionId,
      postId: parent.postId,
      content: 'reply',
      imageUrls: [],
      request: new Request('https://example.com'),
      ctx,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(scheduleBlueskyCrosspost.run).toHaveBeenCalledExactlyOnceWith({ postId: result.val.post.postId });
    expect(vi.mocked(ctx.sendActivity).mock.invocationCallOrder[0]).toBeLessThan(
      scheduleBlueskyCrosspost.run.mock.invocationCallOrder[0]!,
    );
  });

  it('Bluesky に送らない指定のときは予約せず、Fediverse には配送する', async () => {
    const { deps, session, parent } = setup();
    const scheduleBlueskyCrosspost = { run: vi.fn(async () => RA.ok('pending' as const)) };
    const ctx = createContext();

    const result = await SendReplyUseCase.create({ ...deps, scheduleBlueskyCrosspost }).run({
      sessionId: session.sessionId,
      postId: parent.postId,
      content: 'reply',
      imageUrls: [],
      crosspostToBluesky: false,
      request: new Request('https://example.com'),
      ctx,
    });

    expect(result.ok).toBe(true);
    expect(scheduleBlueskyCrosspost.run).not.toHaveBeenCalled();
    expect(ctx.sendActivity).toHaveBeenCalled();
  });

  it('予約の use case が無くても返信できる', async () => {
    const { deps, session, parent } = setup();

    const result = await SendReplyUseCase.create(deps).run({
      sessionId: session.sessionId,
      postId: parent.postId,
      content: 'reply',
      imageUrls: [],
      request: new Request('https://example.com'),
      ctx: createContext(),
    });

    expect(result.ok).toBe(true);
  });
});
