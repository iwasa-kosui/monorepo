import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMastodonSeed, SEED_ORIGIN } from '../adaptor/d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1ActorResolverById } from '../adaptor/d1/actor/actorResolverById.ts';
import { createD1ActorResolverByUri } from '../adaptor/d1/actor/actorResolverByUri.ts';
import { createD1ActorResolverByUserId } from '../adaptor/d1/actor/actorResolverByUserId.ts';
import { createD1AiAgentBotPendingTriggersResolver } from '../adaptor/d1/aiAgentBot/aiAgentBotPendingTriggersResolver.ts';
import { createD1BlockResolver } from '../adaptor/d1/block/blockResolver.ts';
import { createD1DirectMessagePostsResolver } from '../adaptor/d1/fediverseConversation/directMessagePostsResolver.ts';
import { createD1PostImageCreatedStore } from '../adaptor/d1/image/postImageCreatedStore.ts';
import { createD1LinkPreviewCreatedStore } from '../adaptor/d1/linkPreview/linkPreviewCreatedStore.ts';
import {
  createD1MentionNotificationCreatedStore,
  createD1MentionNotificationResolverByRecipientAndMentionPostId,
  createD1ReplyNotificationCreatedStore,
} from '../adaptor/d1/notification/inboxNotificationAdapters.ts';
import { createD1LocalPostResolverByUri } from '../adaptor/d1/post/localPostResolverByUri.ts';
import { createD1PostCreatedStore } from '../adaptor/d1/post/postCreatedStore.ts';
import { createD1PostQuotesResolverByPostIds } from '../adaptor/d1/post/postQuotesResolverByPostIds.ts';
import { createD1PostResolver } from '../adaptor/d1/post/postResolver.ts';
import { createD1PostsWithAuthorResolverByPostIds } from '../adaptor/d1/post/postWithAuthorBatch.ts';
import { createD1PushSubscriptionsResolverByUserId } from '../adaptor/d1/pushSubscription/pushSubscriptionsResolverByUserId.ts';
import { createD1AcceptedRelaysResolver } from '../adaptor/d1/relay/acceptedRelaysResolver.ts';
import { createD1TimelineItemCreatedStore } from '../adaptor/d1/timeline/timelineItemCreatedStore.ts';
import { createD1UserResolver } from '../adaptor/d1/user/userResolver.ts';
import { ActorId } from '../domain/actor/actorId.ts';
import type { LocalActor } from '../domain/actor/localActor.ts';
import { groupDirectMessagePosts } from '../domain/fediverseConversation/fediverseConversation.ts';
import { plainTextToHtml } from '../domain/post/plainTextToHtml.ts';
import { UserId } from '../domain/user/userId.ts';
import { Username } from '../domain/user/username.ts';
import { CreatePostUseCase } from '../useCase/createPost.ts';
import { notifyMentions } from '../useCase/helper/notifyMentions.ts';
import { SendReplyUseCase } from '../useCase/sendReply.ts';
import { createDigestDmSender } from './digestDm.ts';
import type { WorkerRuntimePorts } from './ports.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const kosuiUri = `${SEED_ORIGIN}/users/kosui`;
const agentUri = `${SEED_ORIGIN}/users/agent`;

const mentionOf = (username: string) => {
  const acct = `${username}@iori.test`;
  return plainTextToHtml(`@${acct}`, new Map([[acct, `${SEED_ORIGIN}/users/${username}`]]));
};

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { db } = fixture;
  const seed = createMastodonSeed(fixture);
  const kosui = seed.addLocalActor('kosui');
  const agent = seed.addLocalActor('agent');
  const ctx = {
    sendActivity: vi.fn(async () => undefined),
    getActorUri: (username: string) => new URL(`${SEED_ORIGIN}/users/${username}`),
    getInboxUri: (username?: string) =>
      new URL(username === undefined ? `${SEED_ORIGIN}/inbox` : `${SEED_ORIGIN}/users/${username}/inbox`),
    getFollowersUri: (username: string) => new URL(`${SEED_ORIGIN}/users/${username}/followers`),
    getObjectUri: (_type: unknown, values: { identifier: string; id: string }) =>
      new URL(`${SEED_ORIGIN}/users/${values.identifier}/posts/${values.id}`),
  };
  const userResolver = createD1UserResolver(db);
  const actorResolverByUserId = createD1ActorResolverByUserId(db);
  const postCreatedStore = createD1PostCreatedStore(db);
  const postImageCreatedStore = createD1PostImageCreatedStore(db);
  const timelineItemCreatedStore = createD1TimelineItemCreatedStore(db);
  const mentionNotifier = notifyMentions({
    actorResolverByUri: createD1ActorResolverByUri(db),
    mentionNotificationCreatedStore: createD1MentionNotificationCreatedStore(db),
    mentionNotificationResolver: createD1MentionNotificationResolverByRecipientAndMentionPostId(db),
    pushSubscriptionsResolver: createD1PushSubscriptionsResolverByUserId(db),
    webPushSender: { send: () => RA.ok(undefined) },
    blockResolver: createD1BlockResolver(db),
  });
  const sessionResolver = { resolve: () => RA.ok(undefined) } as never;
  const createPostUseCase = CreatePostUseCase.create({
    sessionResolver,
    postCreatedStore,
    userResolver,
    actorResolverByUserId,
    postImageCreatedStore,
    timelineItemCreatedStore,
    linkPreviewCreatedStore: createD1LinkPreviewCreatedStore(db),
    ogpFetcher: {
      fetch: async () => ({ title: null, description: null, imageUrl: null, faviconUrl: null, siteName: null }),
    },
    acceptedRelaysResolver: createD1AcceptedRelaysResolver(db),
    postQuotesResolver: createD1PostQuotesResolverByPostIds(db),
    origin: SEED_ORIGIN,
    mentionNotifier,
  });
  const sendReplyUseCase = SendReplyUseCase.create({
    sessionResolver,
    userResolver,
    actorResolverByUserId,
    postCreatedStore,
    postImageCreatedStore,
    timelineItemCreatedStore,
    localPostResolverByUri: createD1LocalPostResolverByUri(db, SEED_ORIGIN),
    replyNotificationCreatedStore: createD1ReplyNotificationCreatedStore(db),
    pushSubscriptionsResolver: createD1PushSubscriptionsResolverByUserId(db),
    webPushSender: { send: () => RA.ok(undefined) },
    postResolver: createD1PostResolver(db),
    actorResolverById: createD1ActorResolverById(db),
    postQuotesResolver: createD1PostQuotesResolverByPostIds(db),
    origin: SEED_ORIGIN,
    mentionNotifier,
  });
  const resolver = createD1DirectMessagePostsResolver(db);
  const viewerOf = (user: { userId: string; actorId: string; username: string }) => ({
    userId: UserId.orThrow(user.userId),
    actorId: ActorId.orThrow(user.actorId),
    actorUri: `${SEED_ORIGIN}/users/${user.username}`,
  });
  const messagesFor = async (user: { userId: string; actorId: string; username: string }) => {
    const viewer = viewerOf(user);
    const resolved = await resolver.resolve({ viewer, limit: 50 });
    if (!resolved.ok) throw new Error('unreachable');
    return { posts: resolved.val, groups: groupDirectMessagePosts(resolved.val, viewer.actorUri) };
  };
  const input = (userId: string, content: string) => ({
    userId: UserId.orThrow(userId),
    content,
    visibility: 'direct' as const,
    summary: null,
    sensitive: false,
    images: [],
    crosspostToBluesky: false,
    ctx: ctx as never,
  });
  return {
    ...fixture,
    seed,
    kosui,
    agent,
    ctx,
    userResolver,
    createPostUseCase,
    sendReplyUseCase,
    messagesFor,
    input,
  };
};

describe('bot が所有者に送る digest の DM', () => {
  it('まとめとトピックの返信が、所有者の DM の一覧に同じ会話として返り、まとめだけが未読になる', async () => {
    const t = setup();
    const runtime = {
      mastodon: { userResolver: t.userResolver },
      posting: { createPostUseCase: t.createPostUseCase },
      core: { sendReplyUseCase: t.sendReplyUseCase },
    } as unknown as WorkerRuntimePorts;
    const bot = {
      user: { id: UserId.orThrow(t.agent.userId), username: Username.orThrow('agent') },
      actor: {
        id: ActorId.orThrow(t.agent.actorId),
        userId: UserId.orThrow(t.agent.userId),
        uri: agentUri,
        inboxUrl: `${agentUri}/inbox`,
        type: 'local',
      } satisfies LocalActor,
    };
    const sender = createDigestDmSender(runtime, bot, {
      request: new Request(SEED_ORIGIN),
      ctx: t.ctx as never,
    });

    const summary = await sender.sendSummary({ ownerUserId: UserId.orThrow(t.kosui.userId), html: '<p>まとめ</p>' });
    if (!summary.ok) throw new Error(summary.err);
    const topic = await sender.sendReply({
      ownerUserId: UserId.orThrow(t.kosui.userId),
      parentPostId: summary.val,
      html: '<p>トピック</p>',
    });
    if (!topic.ok) throw new Error(topic.err);

    const { posts, groups } = await t.messagesFor(t.kosui);
    expect(new Map(posts.map((post) => [post.postId, post.unread]))).toEqual(
      new Map([[topic.val, false], [summary.val, true]]),
    );
    expect(posts.map((post) => post.participantUris.slice().sort())).toEqual([
      [agentUri, kosuiUri],
      [agentUri, kosuiUri],
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({ peerUris: [agentUri], unreadCount: 1 });
  });
});

describe('所有者と bot の DM のやりとり', () => {
  it('所有者が bot に送った DM が bot の未処理のトリガーに載り、bot の返信が同じ会話で所有者に届く', async () => {
    const t = setup();

    const sent = await t.createPostUseCase.run(
      t.input(t.kosui.userId, `<p>${mentionOf('agent')} こんにちは</p>`),
    );
    if (!sent.ok) throw new Error(sent.err.message);
    const dmId = sent.val.post.postId;

    const triggers = await createD1AiAgentBotPendingTriggersResolver(t.db).resolve({
      botUserId: UserId.orThrow(t.agent.userId),
      limit: 10,
    });
    expect(triggers.ok && triggers.val.map((trigger) => trigger.postId)).toEqual([dmId]);
    const readable = await createD1PostsWithAuthorResolverByPostIds(t.db).resolve({
      postIds: [dmId],
      currentActorId: ActorId.orThrow(t.agent.actorId),
      onlyVisibleToViewer: true,
    });
    expect(readable.ok && readable.val.has(dmId)).toBe(true);

    const replied = await t.sendReplyUseCase.run({
      ...t.input(t.agent.userId, `<p>${mentionOf('kosui')} こんにちは</p>`),
      postId: dmId,
      request: new Request(SEED_ORIGIN),
    });
    if (!replied.ok) throw new Error(replied.err.message);

    const owner = await t.messagesFor(t.kosui);
    expect(new Map(owner.posts.map((post) => [post.postId, post.unread]))).toEqual(
      new Map([[replied.val.post.postId, true], [dmId, false]]),
    );
    expect(owner.groups).toHaveLength(1);
    expect(owner.groups[0]).toMatchObject({ peerUris: [agentUri], unreadCount: 1 });
  });
});
