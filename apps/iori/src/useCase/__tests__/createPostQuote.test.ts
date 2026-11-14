import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { MentionRecipient } from '../../domain/post/mention.ts';
import type { PostQuote, PostQuotesResolverByPostIds } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { Visibility } from '../../domain/post/visibility.ts';
import type { Session } from '../../domain/session/session.ts';
import type { User } from '../../domain/user/user.ts';
import type { Username } from '../../domain/user/username.ts';
import { CreatePostUseCase } from '../createPost.ts';
import {
  createMockAcceptedRelaysResolver,
  createMockActorResolverByUserId,
  createMockLinkPreviewCreatedStore,
  createMockOgpFetcher,
  createMockPostCreatedStore,
  createMockPostImageCreatedStore,
  createMockRequestContext,
  createMockSessionResolver,
  createMockTimelineItemCreatedStore,
  createMockUserResolver,
} from './helper/mockAdaptors.ts';

const quoteUri = 'https://remote.example/users/alice/statuses/1';
const aliceQuote: PostQuote = {
  uri: quoteUri,
  author: {
    id: 'https://remote.example/users/alice',
    inboxUrl: 'https://remote.example/users/alice/inbox',
    username: 'alice',
  },
};

const setup = (quote: PostQuote | undefined = aliceQuote) => {
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
  const sessionResolver = createMockSessionResolver();
  sessionResolver.setSession(session);
  const userResolver = createMockUserResolver();
  userResolver.setUser(user);
  const actorResolverByUserId = createMockActorResolverByUserId();
  actorResolverByUserId.setActor(actor);
  const postCreatedStore = createMockPostCreatedStore();
  const postQuotesResolver: PostQuotesResolverByPostIds = {
    resolve: vi.fn((postIds: ReadonlyArray<PostId>) =>
      RA.ok(new Map<PostId, PostQuote>(quote === undefined ? [] : postIds.map((postId) => [postId, quote])))
    ),
  };
  const useCase = CreatePostUseCase.create({
    sessionResolver,
    userResolver,
    actorResolverByUserId,
    postCreatedStore,
    postImageCreatedStore: createMockPostImageCreatedStore(),
    timelineItemCreatedStore: createMockTimelineItemCreatedStore(),
    linkPreviewCreatedStore: createMockLinkPreviewCreatedStore(),
    ogpFetcher: createMockOgpFetcher(),
    acceptedRelaysResolver: createMockAcceptedRelaysResolver(),
    postQuotesResolver,
    origin: 'https://example.com',
  });
  const run = (
    input: {
      content: string;
      quoteUri?: string;
      visibility?: Visibility;
      mentions?: ReadonlyArray<MentionRecipient>;
    },
  ) => {
    const ctx = createMockRequestContext();
    return useCase.run({ sessionId: session.sessionId, imageUrls: [], ctx, ...input }).then((result) => ({
      result,
      ctx,
    }));
  };
  return { run, postCreatedStore };
};

describe('CreatePostUseCase の引用', () => {
  it('本文に引用先へのリンクが無ければ、末尾に RE: の段落を足して保存する', async () => {
    const { run, postCreatedStore } = setup();

    const { result } = await run({ content: '<p>hi</p>', quoteUri });

    const expected = `<p>hi</p><p>RE: <a href="${quoteUri}">${quoteUri}</a></p>`;
    expect(result.ok && result.val.post.content).toBe(expected);
    expect(postCreatedStore.items[0]?.aggregateState.content).toBe(expected);
  });

  it('引用先が無ければ本文を変えず、payload の quoteUri を null にして、引用先の作者に配送しない', async () => {
    const { run, postCreatedStore } = setup();

    const { result, ctx } = await run({ content: '<p>hi</p>' });

    expect(result.ok && result.val.post.content).toBe('<p>hi</p>');
    expect(postCreatedStore.items[0]?.eventPayload.quoteUri).toBeNull();
    expect(ctx.sendActivity).toHaveBeenCalledTimes(1);
  });

  it('引用先がリモートの投稿なら、followers への配送に加えて作者の inbox に配送する', async () => {
    const { run } = setup();

    const { ctx } = await run({ content: '<p>hi</p>', quoteUri });

    const calls = vi.mocked(ctx.sendActivity).mock.calls;
    expect(calls.map((call) => call[1])).toEqual([
      'followers',
      [{
        id: new URL('https://remote.example/users/alice'),
        inboxId: new URL('https://remote.example/users/alice/inbox'),
        endpoints: null,
      }],
    ]);
  });

  it('引用先がローカルの投稿なら、作者への追加の配送をしない', async () => {
    const { run } = setup({ uri: 'https://example.com/users/other/posts/1', author: null });

    const { ctx } = await run({ content: '<p>hi</p>', quoteUri: 'https://example.com/users/other/posts/1' });

    expect(vi.mocked(ctx.sendActivity).mock.calls.map((call) => call[1])).toEqual(['followers']);
  });

  it('メンション先と引用先の作者が同じなら、その作者には 1 回だけ配送する', async () => {
    const { run } = setup();
    const mentions = [{ id: aliceQuote.author!.id, inboxUrl: aliceQuote.author!.inboxUrl }];

    const { ctx } = await run({ content: '<p>hi</p>', quoteUri, mentions });

    const recipients = vi.mocked(ctx.sendActivity).mock.calls.map((call) => call[1]);
    expect(recipients).toHaveLength(2);
    expect(recipients[1]).toHaveLength(1);
  });

  it('direct の投稿では、引用先の作者を宛先にも参加者にも入れず、メンション先にだけ共有 inbox を使わず配送する', async () => {
    const { run, postCreatedStore } = setup();
    const carolId = 'https://other.example/users/carol';
    const mentionLink =
      `<span class="h-card"><a href="${carolId}" class="u-url mention">@<span>carol@other.example</span></a></span>`;

    const { result, ctx } = await run({
      content: `<p>${mentionLink}</p>`,
      quoteUri,
      visibility: 'direct',
      mentions: [{ id: carolId, inboxUrl: `${carolId}/inbox` }],
    });

    expect(result.ok).toBe(true);
    const calls = vi.mocked(ctx.sendActivity).mock.calls;
    expect(calls).toHaveLength(1);
    expect(calls[0]?.[1]).toEqual([{ id: new URL(carolId), inboxId: new URL(`${carolId}/inbox`), endpoints: null }]);
    expect(calls[0]?.[3]).toEqual({ preferSharedInbox: false });
    expect(postCreatedStore.items[0]?.eventPayload.quoteUri).toBe(quoteUri);
    expect(postCreatedStore.items[0]?.eventPayload).toMatchObject({
      participantActorUris: ['https://example.com/users/kosui', carolId],
    });
  });
});
