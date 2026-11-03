import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { htmlToPlainText } from '../../adaptor/text/htmlToPlainText.ts';
import type { ActorId } from '../../domain/actor/actorId.ts';
import type { LocalActor } from '../../domain/actor/localActor.ts';
import type { Instant } from '../../domain/instant/instant.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type {
  TimelineSearchCandidate,
  TimelineSearchCandidatesResolver,
} from '../../domain/timelineSearch/timelineSearchCandidatesResolver.ts';
import { TimelineSearchQuery } from '../../domain/timelineSearch/timelineSearchQuery.ts';
import type { UserId } from '../../domain/user/userId.ts';
import type { TextGenerator } from '../../ports/textGenerator.ts';
import { createStubTextGenerator } from '../../testing/aiStubs.ts';
import { SearchTimelineUseCase } from '../searchTimeline.ts';
import {
  createMockActorResolverByUserId,
  createMockActorsResolverByFollowerId,
  createMockMutedActorIdsResolverByUserId,
} from './helper/mockAdaptors.ts';

const localActor = (userId: UserId): LocalActor => ({
  id: crypto.randomUUID() as ActorId,
  userId,
  uri: `https://example.com/users/${userId}`,
  inboxUrl: 'https://example.com/inbox',
  type: 'local',
  logoUri: undefined,
});

type StoredPost = TimelineSearchCandidate & Readonly<{ actorId: ActorId }>;

const setup = (options: { textGenerator?: TextGenerator } = {}) => {
  const userId = crypto.randomUUID() as UserId;
  const me = localActor(userId);
  const followed = localActor(crypto.randomUUID() as UserId);
  const stranger = localActor(crypto.randomUUID() as UserId);
  const actorResolverByUserId = createMockActorResolverByUserId();
  actorResolverByUserId.setActor(me);
  const actorsResolverByFollowerId = createMockActorsResolverByFollowerId();
  actorsResolverByFollowerId.setActors(me.id, [followed]);
  const mutedActorIdsResolverByUserId = createMockMutedActorIdsResolverByUserId();

  const posts: StoredPost[] = [];
  const addPost = (actor: LocalActor, content: string, createdAt: number): PostId => {
    const postId = crypto.randomUUID() as PostId;
    posts.push({ postId, actorId: actor.id, content, createdAt: createdAt as Instant });
    return postId;
  };
  const resolve = vi.fn(async (
    { actorIds, terms, limit }: Parameters<TimelineSearchCandidatesResolver['resolve']>[0],
  ) =>
    RA.ok(
      posts
        .filter((post) => actorIds.includes(post.actorId))
        .filter((post) => terms.some((term) => post.content.toLowerCase().includes(term.toLowerCase())))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit)
        .map(({ postId, content, createdAt }) => ({ postId, content, createdAt })),
    )
  );
  const timelineSearchCandidatesResolver: TimelineSearchCandidatesResolver = { resolve };

  const useCase = SearchTimelineUseCase.create({
    actorResolverByUserId,
    actorsResolverByFollowerId,
    mutedActorIdsResolverByUserId,
    textGenerator: options.textGenerator,
    timelineSearchCandidatesResolver,
    htmlToPlainText,
  });
  const search = (text: string, limit?: number) =>
    useCase.run({ userId, query: TimelineSearchQuery.orThrow({ text, limit }) });

  return {
    userId,
    me,
    followed,
    stranger,
    addPost,
    resolve,
    search,
    mutedActorIdsResolverByUserId,
    useCase,
    actorResolverByUserId,
    actorsResolverByFollowerId,
  };
};

const expectOk = async <T, E>(result: Promise<{ ok: true; val: T } | { ok: false; err: E }>): Promise<T> => {
  const awaited = await result;
  if (!awaited.ok) throw new Error(`Expected ok but got ${JSON.stringify(awaited.err)}`);
  return awaited.val;
};

const errorGenerator: TextGenerator = {
  summarize: () => RA.err({ type: 'AiError', message: 'unavailable' }),
  generate: () => RA.err({ type: 'AiError', message: 'unavailable' }),
};

describe('SearchTimelineUseCase', () => {
  it('展開した語でも一致する', async () => {
    const { generator } = createStubTextGenerator(() => '["旅行", "trip"]');
    const { me, followed, addPost, search } = setup({ textGenerator: generator });
    const mine = addPost(me, '週末は旅行です', 1000);
    const theirs = addPost(followed, 'Trip report', 2000);

    const result = await expectOk(search('たび'));

    expect(result.expansion).toBe('expanded');
    expect(result.terms.original).toEqual(['たび']);
    expect(result.terms.expanded).toEqual(['旅行', 'trip']);
    expect(result.postIds).toEqual([theirs, mine]);
  });

  it('自分とフォロー中の actorId だけを候補の resolver に渡す', async () => {
    const { me, followed, stranger, addPost, resolve, search } = setup();
    const mine = addPost(me, '旅行', 1000);
    const theirs = addPost(followed, '旅行', 2000);
    addPost(stranger, '旅行', 3000);

    const result = await expectOk(search('旅行'));

    expect(result.postIds).toEqual([theirs, mine]);
    expect(resolve).toHaveBeenCalledWith({ actorIds: [me.id, followed.id], terms: ['旅行'], limit: 200 });
  });

  it('展開がエラーのときは expansion が failed になり、original だけで検索する', async () => {
    const { me, addPost, resolve, search } = setup({ textGenerator: errorGenerator });
    const hit = addPost(me, '旅行の写真', 1000);

    const result = await expectOk(search('旅行'));

    expect(result.expansion).toBe('failed');
    expect(result.terms).toEqual({ original: ['旅行'], expanded: [] });
    expect(result.postIds).toEqual([hit]);
    expect(resolve.mock.calls[0][0].terms).toEqual(['旅行']);
  });

  it('展開の出力を解釈できないときも failed になる', async () => {
    const { generator } = createStubTextGenerator(() => 'わかりません');
    const { me, addPost, search } = setup({ textGenerator: generator });
    const hit = addPost(me, '旅行', 1000);

    const result = await expectOk(search('旅行'));

    expect(result.expansion).toBe('failed');
    expect(result.postIds).toEqual([hit]);
  });

  it('textGenerator がなければ skipped になる', async () => {
    const { me, addPost, search } = setup();
    const hit = addPost(me, '旅行', 1000);

    const result = await expectOk(search('旅行'));

    expect(result.expansion).toBe('skipped');
    expect(result.terms.expanded).toEqual([]);
    expect(result.postIds).toEqual([hit]);
  });

  it('タグの属性の中だけで一致する投稿は除く', async () => {
    const { me, addPost, search } = setup();
    addPost(me, '<a href="https://example.com/旅行">リンク</a>', 2000);
    const hit = addPost(me, '<p>旅行に行く</p>', 1000);

    const result = await expectOk(search('旅行'));

    expect(result.postIds).toEqual([hit]);
  });

  it('問い合わせの全角と半角、大文字と小文字をそろえて一致を確かめる', async () => {
    const { me, addPost, search } = setup();
    const hit = addPost(me, '<p>Trip memo</p>', 1000);

    const result = await expectOk(search('ＴＲＩＰ'));

    expect(result.terms.original).toEqual(['TRIP']);
    expect(result.postIds).toEqual([hit]);
  });

  it('投稿の全角と半角、大文字と小文字をそろえて一致を確かめる', async () => {
    const { me, addPost, resolve, search } = setup();
    const hit = addPost(me, '<p>ＴＲＩＰ memo</p>', 1000);
    resolve.mockImplementationOnce(async () =>
      RA.ok([{ postId: hit, content: '<p>ＴＲＩＰ memo</p>', createdAt: 1000 as Instant }])
    );

    const result = await expectOk(search('trip'));

    expect(result.postIds).toEqual([hit]);
  });

  it('点数の降順、同点は createdAt の降順に並べる', async () => {
    const { generator } = createStubTextGenerator(() => '["旅行", "trip"]');
    const { me, addPost, search } = setup({ textGenerator: generator });
    const expandedOld = addPost(me, '旅行', 1000);
    const expandedNew = addPost(me, 'trip', 2000);
    const originalOnly = addPost(me, 'たび', 500);
    const originalAndExpanded = addPost(me, 'たび 旅行', 100);
    const twoExpanded = addPost(me, '旅行 trip', 3000);

    const result = await expectOk(search('たび'));

    expect(result.postIds).toEqual([
      originalAndExpanded,
      twoExpanded,
      originalOnly,
      expandedNew,
      expandedOld,
    ]);
  });

  it('original の一致は expanded の一致の 2 倍に数える', async () => {
    const { generator } = createStubTextGenerator(() => '["trip", "旅"]');
    const { me, addPost, search } = setup({ textGenerator: generator });
    const twoExpanded = addPost(me, 'trip 旅', 3000);
    const oneOriginal = addPost(me, 'たび', 1000);
    const oneExpanded = addPost(me, 'trip', 2000);

    const result = await expectOk(search('たび'));

    expect(result.postIds).toEqual([twoExpanded, oneOriginal, oneExpanded]);
  });

  it('query.limit 件までにする', async () => {
    const { me, addPost, search } = setup();
    const posts = [1000, 2000, 3000].map((time) => addPost(me, '旅行', time));

    const result = await expectOk(search('旅行', 2));

    expect(result.postIds).toEqual([posts[2], posts[1]]);
  });

  it('ミュート中の投稿者の投稿は除く', async () => {
    const { userId, me, followed, addPost, resolve, search, mutedActorIdsResolverByUserId } = setup();
    const mine = addPost(me, '旅行', 1000);
    addPost(followed, '旅行', 2000);
    mutedActorIdsResolverByUserId.setMutedActorIds(userId, [followed.id]);

    const result = await expectOk(search('旅行'));

    expect(result.postIds).toEqual([mine]);
    expect(resolve.mock.calls[0][0].actorIds).toEqual([me.id]);
  });

  it('語が 1 つもなければ DB を呼ばずに空の結果を返す', async () => {
    const { me, addPost, resolve, search } = setup();
    addPost(me, '100%', 1000);

    const result = await expectOk(search('100% _'));

    expect(result.postIds).toEqual([]);
    expect(result.terms).toEqual({ original: [], expanded: [] });
    expect(resolve).not.toHaveBeenCalled();
  });

  it('問い合わせを空白で分けて、重複を除き 10 語までにする', async () => {
    const { resolve, search } = setup();
    const words = Array.from({ length: 12 }, (_, i) => `w${i}`);

    const result = await expectOk(search(`${words.join('　')} W0`));

    expect(result.terms.original).toEqual(words.slice(0, 10));
    expect(resolve.mock.calls[0][0].terms).toEqual(words.slice(0, 10));
  });

  it('ローカルのアクターが見つからなければ UserNotFoundError を返す', async () => {
    const { useCase } = setup();

    const result = await useCase.run({
      userId: crypto.randomUUID() as UserId,
      query: TimelineSearchQuery.orThrow({ text: '旅行' }),
    });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.err.type).toBe('UserNotFoundError');
  });
});
