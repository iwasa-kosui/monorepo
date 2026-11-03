import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { htmlToPlainText } from '../../adaptor/text/htmlToPlainText.ts';
import type { ActorId } from '../../domain/actor/actorId.ts';
import type { LocalActor } from '../../domain/actor/localActor.ts';
import { SummaryTarget } from '../../domain/aiSummary/summaryTarget.ts';
import type { AiSummaryUsageRecorder } from '../../domain/aiSummary/usageLimit.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { PostsWithAuthorResolverByPostIds, PostWithAuthor } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { Visibility } from '../../domain/post/visibility.ts';
import type { HomePostsResolverByPeriod } from '../../domain/timeline/homePostsResolverByPeriod.ts';
import { UserNotFoundError } from '../../domain/user/user.ts';
import type { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
import type { GenerateRequest, SummarizeRequest, TextGenerator } from '../../ports/textGenerator.ts';
import { createStubTextGenerator } from '../../testing/aiStubs.ts';
import type { SearchTimelineUseCase } from '../searchTimeline.ts';
import { SummarizeTimelineUseCase, SUMMARY_MODEL } from '../summarizeTimeline.ts';
import {
  createMockActorResolverByUserId,
  createMockActorsResolverByFollowerId,
  createMockMutedActorIdsResolverByUserId,
} from './helper/mockAdaptors.ts';

afterEach(() => {
  vi.useRealTimers();
});

const localActor = (userId: UserId): LocalActor => ({
  id: crypto.randomUUID() as ActorId,
  userId,
  uri: `https://example.com/users/${userId}`,
  inboxUrl: 'https://example.com/inbox',
  type: 'local',
  logoUri: undefined,
});

const NOW = Date.UTC(2026, 10, 4, 3, 0, 0);

type PostOptions = Readonly<{
  username?: string;
  createdAt?: number;
  visibility?: Visibility | null;
  local?: boolean;
}>;

const makePost = (content: string, options: PostOptions = {}): PostWithAuthor => {
  const common = {
    postId: crypto.randomUUID() as PostId,
    actorId: crypto.randomUUID() as ActorId,
    content,
    createdAt: Instant.orThrow(options.createdAt ?? NOW - 60_000),
    inReplyToUri: null,
    username: Username.parseOrThrow(options.username ?? 'alice'),
    logoUri: undefined,
    liked: false,
    reposted: false,
    images: [],
    likeCount: 0,
    repostCount: 0,
    reactions: [],
    linkPreviews: [],
  };
  return options.local === true
    ? { ...common, type: 'local', userId: crypto.randomUUID() as UserId }
    : {
      ...common,
      type: 'remote',
      uri: `https://remote.example/notes/${common.postId}`,
      visibility: options.visibility === undefined ? 'public' : options.visibility,
    };
};

const memoryUsage = (initial = 0) => {
  const counts = new Map<string, number>();
  const key = (userId: string, day: string) => `${userId}:${day}`;
  const recorder: AiSummaryUsageRecorder = {
    reserve: vi.fn(({ userId, day, limit }) => {
      const current = counts.get(key(userId, day)) ?? initial;
      if (current >= limit) return RA.ok({ allowed: false, count: limit });
      counts.set(key(userId, day), current + 1);
      return RA.ok({ allowed: true, count: current + 1 });
    }),
    read: vi.fn(({ userId, day }) => RA.ok(counts.get(key(userId, day)) ?? initial)),
  };
  return { recorder, counts };
};

const setup = (options: { textGenerator?: TextGenerator | null; initialCount?: number; timeoutMs?: number } = {}) => {
  const userId = crypto.randomUUID() as UserId;
  const me = localActor(userId);
  const followed = localActor(crypto.randomUUID() as UserId);
  const muted = localActor(crypto.randomUUID() as UserId);
  const actorResolverByUserId = createMockActorResolverByUserId();
  actorResolverByUserId.setActor(me);
  const actorsResolverByFollowerId = createMockActorsResolverByFollowerId();
  actorsResolverByFollowerId.setActors(me.id, [followed, muted]);
  const mutedActorIdsResolverByUserId = createMockMutedActorIdsResolverByUserId();
  mutedActorIdsResolverByUserId.setMutedActorIds(userId, [muted.id]);

  const stored = new Map<PostId, PostWithAuthor>();
  const store = (...posts: PostWithAuthor[]) => {
    for (const post of posts) stored.set(post.postId, post);
    return posts.map((post) => post.postId);
  };

  const searchRun = vi.fn<SearchTimelineUseCase['run']>();
  const searchTimeline: SearchTimelineUseCase = { run: searchRun };
  const setSearchResult = (postIds: ReadonlyArray<PostId>) =>
    searchRun.mockImplementation(() =>
      RA.ok({
        viewerActorId: me.id,
        postIds,
        terms: { original: [], expanded: [] },
        droppedOriginal: [],
        expansion: 'skipped' as const,
      })
    );

  const periodResolve = vi.fn<HomePostsResolverByPeriod['resolve']>(() => RA.ok([]));
  const postsResolve = vi.fn<PostsWithAuthorResolverByPostIds['resolve']>(({ postIds }) =>
    RA.ok(new Map(postIds.flatMap((postId) => stored.has(postId) ? [[postId, stored.get(postId)!] as const] : [])))
  );
  const usage = memoryUsage(options.initialCount);
  const stub = createStubTextGenerator(() => '- 話題 [1]');
  const textGenerator = options.textGenerator === null ? undefined : options.textGenerator ?? stub.generator;

  const useCase = SummarizeTimelineUseCase.create({
    actorResolverByUserId,
    actorsResolverByFollowerId,
    mutedActorIdsResolverByUserId,
    searchTimeline,
    homePostsResolverByPeriod: { resolve: periodResolve },
    postsWithAuthorResolverByPostIds: { resolve: postsResolve },
    aiSummaryUsageRecorder: usage.recorder,
    textGenerator,
    summaryTimeoutMs: options.timeoutMs,
    htmlToPlainText,
  });

  const target = (input: unknown) => {
    const parsed = SummaryTarget.parse(input, Instant.orThrow(NOW));
    if (!parsed.ok) throw new Error(`invalid target: ${JSON.stringify(parsed.err)}`);
    return parsed.val;
  };
  const summarize = (input: unknown) => useCase.run({ userId, target: target(input) });
  return {
    userId,
    me,
    followed,
    muted,
    store,
    setSearchResult,
    searchRun,
    periodResolve,
    postsResolve,
    usage,
    summarize,
    calls: stub.calls,
  };
};

const expectOk = async <T, E>(result: Promise<{ ok: true; val: T } | { ok: false; err: E }>): Promise<T> => {
  const awaited = await result;
  if (!awaited.ok) throw new Error(`Expected ok but got ${JSON.stringify(awaited.err)}`);
  return awaited.val;
};

const expectErr = async <T, E>(result: Promise<{ ok: true; val: T } | { ok: false; err: E }>): Promise<E> => {
  const awaited = await result;
  if (awaited.ok) throw new Error(`Expected err but got ${JSON.stringify(awaited.val)}`);
  return awaited.err;
};

const documentsOf = (call: SummarizeRequest | GenerateRequest): readonly string[] =>
  'documents' in call ? call.documents : [];

const periodOf = (since: number, until: number) => ({
  since: new Date(since).toISOString(),
  until: new Date(until).toISOString(),
});

const neverResolvingGenerator: TextGenerator = {
  summarize: () => new Promise(() => {}),
  generate: () => new Promise(() => {}),
};

const errorGenerator: TextGenerator = {
  summarize: () => RA.err({ type: 'AiError', message: 'unavailable' }),
  generate: () => RA.err({ type: 'AiError', message: 'unavailable' }),
};

describe('SummarizeTimelineUseCase', () => {
  it('検索結果を点数順の番号つきで AI に渡し、要約と残り回数を返す', async () => {
    const t = setup();
    const [first, second] = t.store(
      makePost('<p>京都の寺</p>', { username: 'alice', createdAt: Date.UTC(2026, 10, 3, 15, 0) }),
      makePost('<p>旅行の計画</p>', { username: 'bob', createdAt: Date.UTC(2026, 10, 3, 16, 30) }),
    );
    t.setSearchResult([first!, second!]);

    const result = await expectOk(t.summarize({ q: '京都' }));

    expect(t.calls).toHaveLength(1);
    expect(t.calls[0]).toMatchObject({
      model: '@cf/meta/llama-4-scout-17b-16e-instruct',
      maxOutputTokens: 1024,
      documents: [
        '[1] @alice 2026-11-04 00:00（JST）\n京都の寺',
        '[2] @bob 2026-11-04 01:30（JST）\n旅行の計画',
      ],
    });
    expect(result).toMatchObject({
      summary: '- 話題 [1]',
      sourcePostIds: [first],
      usedPostCount: 2,
      excludedNonPublicCount: 0,
      truncated: false,
      model: SUMMARY_MODEL,
      remainingToday: 19,
    });
    expect(t.searchRun).toHaveBeenCalledWith({
      userId: t.userId,
      query: { text: '京都', limit: 40 },
    });
  });

  it('出力に書かれた番号のうち、渡した番号だけを source にする', async () => {
    const { generator } = createStubTextGenerator(() => '- A [2]\n- B [3][2]\n- C [9]\n- D [0]');
    const t = setup({ textGenerator: generator });
    const ids = t.store(makePost('a'), makePost('b'), makePost('c'));
    t.setSearchResult(ids);

    const result = await expectOk(t.summarize({ q: 'x' }));

    expect(result.sourcePostIds).toEqual([ids[1], ids[2]]);
  });

  it('citations は本文の番号の昇順で、渡していない番号を含めない', async () => {
    const { generator } = createStubTextGenerator(() => '- A [3]\n- B [1][3]\n- C [9]\n- D [0]');
    const t = setup({ textGenerator: generator });
    const ids = t.store(makePost('a'), makePost('b'), makePost('c'));
    t.setSearchResult(ids);

    const result = await expectOk(t.summarize({ q: 'x' }));

    expect(result.citations).toEqual([{ n: 1, postId: ids[0] }, { n: 3, postId: ids[2] }]);
    expect(result.sourcePostIds).toEqual([ids[0], ids[2]]);
  });

  it('since と until の範囲外の投稿を検索結果から除く', async () => {
    const t = setup();
    const [before, atSince, inside, atUntil] = t.store(
      makePost('before', { createdAt: 999 }),
      makePost('at since', { createdAt: 1_000 }),
      makePost('inside', { createdAt: 1_500 }),
      makePost('at until', { createdAt: 2_000 }),
    );
    t.setSearchResult([before!, atSince!, inside!, atUntil!]);

    const result = await expectOk(
      t.summarize({ q: 'x', since: new Date(1_000).toISOString(), until: new Date(2_000).toISOString() }),
    );

    expect(result.usedPostCount).toBe(2);
    expect(t.calls[0]).toMatchObject({
      documents: [expect.stringContaining('at since'), expect.stringContaining('inside')],
    });
  });

  it('公開と未収載とローカルの投稿だけを送り、除いた件数を返す', async () => {
    const t = setup();
    const ids = t.store(
      makePost('public', { visibility: 'public' }),
      makePost('unlisted', { visibility: 'unlisted' }),
      makePost('local', { local: true }),
      makePost('private', { visibility: 'private' }),
      makePost('direct', { visibility: 'direct' }),
      makePost('unknown', { visibility: null }),
    );
    t.setSearchResult(ids);

    const result = await expectOk(t.summarize({ q: 'x' }));

    expect(result.excludedNonPublicCount).toBe(3);
    expect(result.usedPostCount).toBe(3);
    const documents = documentsOf(t.calls[0]!).join('\n');
    expect(documents).toContain('public');
    expect(documents).toContain('local');
    expect(documents).not.toContain('private');
    expect(documents).not.toContain('direct');
    expect(documents).not.toContain('unknown');
  });

  it('投稿が 0 件なら summary を null にして、AI を呼ばず回数を消費しない', async () => {
    const t = setup({ initialCount: 5 });
    t.setSearchResult([]);

    const result = await expectOk(t.summarize({ q: 'x' }));

    expect(result).toMatchObject({
      summary: null,
      sourcePostIds: [],
      usedPostCount: 0,
      excludedNonPublicCount: 0,
      truncated: false,
      model: SUMMARY_MODEL,
      remainingToday: 15,
    });
    expect(t.calls).toEqual([]);
    expect(t.usage.recorder.reserve).not.toHaveBeenCalled();
  });

  it('すべて非公開でも summary を null にして、除いた件数を返し、回数を消費しない', async () => {
    const t = setup();
    t.setSearchResult(
      t.store(makePost('private', { visibility: 'private' }), makePost('direct', { visibility: 'direct' })),
    );

    const result = await expectOk(t.summarize({ q: 'x' }));

    expect(result).toMatchObject({ summary: null, excludedNonPublicCount: 2, usedPostCount: 0, remainingToday: 20 });
    expect(t.calls).toEqual([]);
    expect(t.usage.recorder.reserve).not.toHaveBeenCalled();
  });

  it('AI を呼ぶ前に回数を 1 つ予約する', async () => {
    const seen: number[][] = [];
    let counts: Map<string, number> = new Map();
    const { generator } = createStubTextGenerator(() => {
      seen.push([...counts.values()]);
      return '- 話題 [1]';
    });
    const t = setup({ textGenerator: generator });
    counts = t.usage.counts;
    t.setSearchResult(t.store(makePost('a')));

    await expectOk(t.summarize({ q: 'x' }));

    expect(seen).toEqual([[1]]);
  });

  it('AI が失敗しても回数は戻さない', async () => {
    const t = setup({ textGenerator: errorGenerator });
    t.setSearchResult(t.store(makePost('a')));

    const error = await expectErr(t.summarize({ q: 'x' }));

    expect(error).toEqual({ type: 'AiError', message: 'unavailable' });
    expect([...t.usage.counts.values()]).toEqual([1]);
  });

  it('AI が期限を過ぎても回数は戻さない', async () => {
    const t = setup({ textGenerator: neverResolvingGenerator, timeoutMs: 10 });
    t.setSearchResult(t.store(makePost('a')));

    const error = await expectErr(t.summarize({ q: 'x' }));

    expect(error).toMatchObject({ type: 'SummaryTimeoutError' });
    expect([...t.usage.counts.values()]).toEqual([1]);
  });

  it('1日の上限に達していると、AI を呼ばずに次の日本時間 0 時までの秒数を返す', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 10, 4, 3, 0, 0));
    const t = setup({ initialCount: 20 });
    t.setSearchResult(t.store(makePost('a')));

    const error = await expectErr(t.summarize({ q: 'x' }));

    expect(error).toMatchObject({ type: 'SummaryLimitExceededError', retryAfterSeconds: 12 * 60 * 60 });
    expect(t.calls).toEqual([]);
  });

  it('上限超過の秒数は、回数の日付を求めた時刻から計算する', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 10, 4, 14, 59, 59));
    const t = setup();
    t.setSearchResult(t.store(makePost('a')));
    vi.mocked(t.usage.recorder.reserve).mockImplementationOnce(() => {
      vi.setSystemTime(Date.UTC(2026, 10, 4, 15, 0, 0));
      return RA.ok({ allowed: false, count: 20 });
    });

    const error = await expectErr(t.summarize({ q: 'x' }));

    expect(error).toMatchObject({ type: 'SummaryLimitExceededError', retryAfterSeconds: 1 });
  });

  it('日本時間の日付ごとに回数を数える', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 10, 4, 14, 59, 59));
    const t = setup();
    t.setSearchResult(t.store(makePost('a')));
    await expectOk(t.summarize({ q: 'x' }));
    vi.setSystemTime(Date.UTC(2026, 10, 4, 15, 0, 0));

    await expectOk(t.summarize({ q: 'x' }));

    expect([...t.usage.counts.entries()]).toEqual([
      [`${t.userId}:2026-11-04`, 1],
      [`${t.userId}:2026-11-05`, 1],
    ]);
  });

  it('textGenerator がないと、回数を消費せずエラーにする', async () => {
    const t = setup({ textGenerator: null });
    t.setSearchResult(t.store(makePost('a')));

    const error = await expectErr(t.summarize({ q: 'x' }));

    expect(error).toMatchObject({ type: 'SummaryAiUnavailableError' });
    expect(t.usage.recorder.reserve).not.toHaveBeenCalled();
  });

  it('検索が UserNotFoundError を返したらそのまま返す', async () => {
    const t = setup();
    t.searchRun.mockImplementation(() => RA.err(UserNotFoundError.create({ userId: t.userId })));

    const error = await expectErr(t.summarize({ q: 'x' }));

    expect(error).toMatchObject({ type: 'UserNotFoundError' });
  });

  it('検索の要約は上限を超えたら点数の低い投稿（後ろ）から外す', async () => {
    const t = setup();
    const ids = t.store(
      makePost('あ'.repeat(12_000)),
      makePost('い'.repeat(7_000)),
      makePost('う'.repeat(1_000)),
      makePost('え'),
    );
    t.setSearchResult(ids);

    const result = await expectOk(t.summarize({ q: 'x' }));

    expect(result.truncated).toBe(true);
    expect(result.usedPostCount).toBe(3);
    expect(documentsOf(t.calls[0]!)).toHaveLength(3);
  });

  it('期間の要約は上限を超えたら古い投稿から外す', async () => {
    const { generator } = createStubTextGenerator(() => '- 話題 [1][2]');
    const t = setup({ textGenerator: generator });
    const [newest, middle, oldest] = t.store(
      makePost('新'.repeat(12_000), { createdAt: NOW - 1_000 }),
      makePost('中'.repeat(7_000), { createdAt: NOW - 2_000 }),
      makePost('古'.repeat(7_000), { createdAt: NOW - 3_000 }),
    );
    t.periodResolve.mockImplementation(() => RA.ok([newest!, middle!, oldest!]));

    const result = await expectOk(t.summarize(periodOf(NOW - 86_400_000, NOW)));

    expect(result.truncated).toBe(true);
    expect(result.usedPostCount).toBe(2);
    expect(result.sourcePostIds).toEqual([newest, middle]);
  });

  it('期間の要約は本人とフォロー中からミュートを除いた actorId で resolver を呼ぶ', async () => {
    const t = setup();
    const since = Date.UTC(2026, 10, 3);
    const until = Date.UTC(2026, 10, 4);
    t.periodResolve.mockImplementation(() => RA.ok(t.store(makePost('<p>期間の投稿</p>'))));

    const result = await expectOk(t.summarize(periodOf(since, until)));

    expect(t.periodResolve).toHaveBeenCalledWith({
      actorIds: [t.me.id, t.followed.id],
      currentActorId: t.me.id,
      since,
      until,
    });
    expect(t.searchRun).not.toHaveBeenCalled();
    expect(result.usedPostCount).toBe(1);
    expect(t.postsResolve).toHaveBeenCalledWith({ postIds: expect.any(Array), currentActorId: t.me.id });
    expect(documentsOf(t.calls[0]!)[0]).toContain('期間の投稿');
  });

  it('期間の要約で actor のない利用者は UserNotFoundError にする', async () => {
    const t = setup();
    const withoutActor = SummarizeTimelineUseCase.create({
      actorResolverByUserId: createMockActorResolverByUserId(),
      actorsResolverByFollowerId: createMockActorsResolverByFollowerId(),
      mutedActorIdsResolverByUserId: createMockMutedActorIdsResolverByUserId(),
      searchTimeline: { run: t.searchRun },
      homePostsResolverByPeriod: { resolve: t.periodResolve },
      postsWithAuthorResolverByPostIds: { resolve: t.postsResolve },
      aiSummaryUsageRecorder: t.usage.recorder,
      htmlToPlainText,
    });

    const error = await expectErr(
      withoutActor.run({
        userId: t.userId,
        target: { type: 'period', since: Instant.orThrow(NOW - 1_000), until: Instant.orThrow(NOW) },
      }),
    );

    expect(error).toMatchObject({ type: 'UserNotFoundError' });
    expect(t.periodResolve).not.toHaveBeenCalled();
  });
});
