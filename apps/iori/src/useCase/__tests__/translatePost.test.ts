import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { htmlToPlainText } from '../../adaptor/text/htmlToPlainText.ts';
import type { ActorId } from '../../domain/actor/actorId.ts';
import { PostTranslation, type PostTranslationStore } from '../../domain/aiTranslation/postTranslation.ts';
import { hashTranslationSource } from '../../domain/aiTranslation/sourceHash.ts';
import type { AiTranslationUsageRecorder } from '../../domain/aiTranslation/usageLimit.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { PostsWithAuthorResolverByPostIds, PostWithAuthor } from '../../domain/post/post.ts';
import type { PostId } from '../../domain/post/postId.ts';
import type { Visibility } from '../../domain/post/visibility.ts';
import type { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
import type { GenerateRequest, SummarizeRequest, TextGenerator } from '../../ports/textGenerator.ts';
import { createStubTextGenerator } from '../../testing/aiStubs.ts';
import { TranslatePostUseCase, TRANSLATION_MODEL, TRANSLATION_PROVIDER } from '../translatePost.ts';

afterEach(() => {
  vi.useRealTimers();
});

const NOW = Date.UTC(2026, 10, 4, 3, 0, 0);

type PostOptions = Readonly<{ visibility?: Visibility | null; local?: boolean }>;

const makePost = (content: string, options: PostOptions = {}): PostWithAuthor => {
  const common = {
    postId: crypto.randomUUID() as PostId,
    actorId: crypto.randomUUID() as ActorId,
    content,
    createdAt: Instant.orThrow(NOW - 60_000),
    inReplyToUri: null,
    summary: null,
    sensitive: false,
    username: Username.parseOrThrow('alice'),
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
    ? { ...common, type: 'local', visibility: 'public', userId: crypto.randomUUID() as UserId }
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
  const recorder: AiTranslationUsageRecorder = {
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

const memoryStore = () => {
  const saved = new Map<string, PostTranslation>();
  const key = (postId: string, language: string) => `${postId}:${language}`;
  const store: PostTranslationStore = {
    find: vi.fn((postId, language) => RA.ok(saved.get(key(postId, language)))),
    save: vi.fn((translation) => {
      saved.set(key(translation.postId, translation.targetLanguage), translation);
      return RA.ok(undefined);
    }),
  };
  return { store, saved, key };
};

const englishReply = () => '[[lang:en]]\nこんにちは、世界';

const setup = (
  options: { textGenerator?: TextGenerator | null; initialCount?: number; timeoutMs?: number; reply?: () => string } =
    {},
) => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  const viewer = { userId: crypto.randomUUID() as UserId, actorId: crypto.randomUUID() as ActorId };
  const stored = new Map<PostId, PostWithAuthor>();
  const add = (post: PostWithAuthor) => {
    stored.set(post.postId, post);
    return post;
  };
  const postsResolve = vi.fn<PostsWithAuthorResolverByPostIds['resolve']>(({ postIds }) =>
    RA.ok(new Map(postIds.flatMap((postId) => stored.has(postId) ? [[postId, stored.get(postId)!] as const] : [])))
  );
  const usage = memoryUsage(options.initialCount);
  const translations = memoryStore();
  const stub = createStubTextGenerator(options.reply ?? englishReply);
  const textGenerator = options.textGenerator === null ? undefined : options.textGenerator ?? stub.generator;
  const useCase = TranslatePostUseCase.create({
    postsWithAuthorResolverByPostIds: { resolve: postsResolve },
    postTranslationStore: translations.store,
    aiTranslationUsageRecorder: usage.recorder,
    textGenerator,
    translationTimeoutMs: options.timeoutMs,
    htmlToPlainText,
  });
  const translate = (postId: PostId, targetLanguage?: string) => useCase.run({ postId, viewer, targetLanguage });
  return { viewer, add, postsResolve, usage, translations, translate, calls: stub.calls };
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

const generateCall = (call: SummarizeRequest | GenerateRequest): GenerateRequest => {
  if (!('input' in call)) throw new Error('Expected a generate call');
  return call;
};

describe('TranslatePostUseCase', () => {
  it('英語の投稿を訳し、HTML と原文の言語と提供元と残り回数を返して保存する', async () => {
    const t = setup();
    const post = t.add(makePost('<p>Hello, world</p>'));

    const result = await expectOk(t.translate(post.postId));

    expect(result).toEqual({
      content: '<p>こんにちは、世界</p>',
      detectedSourceLanguage: 'en',
      provider: TRANSLATION_PROVIDER,
      remainingToday: 49,
    });
    expect(t.translations.saved.get(t.translations.key(post.postId, 'ja'))).toEqual({
      postId: post.postId,
      targetLanguage: 'ja',
      sourceHash: await hashTranslationSource('<p>Hello, world</p>'),
      content: '<p>こんにちは、世界</p>',
      detectedSourceLanguage: 'en',
      model: TRANSLATION_MODEL,
      createdAt: NOW,
    });
  });

  it('閲覧者だけに見える投稿を引く', async () => {
    const t = setup();
    const post = t.add(makePost('<p>Hello</p>'));

    await expectOk(t.translate(post.postId));

    expect(t.postsResolve).toHaveBeenCalledWith({
      postIds: [post.postId],
      currentActorId: t.viewer.actorId,
      onlyVisibleToViewer: true,
    });
  });

  it('リンクとメンションを印にして AI に渡し、訳文の印を元の <a> に戻す', async () => {
    const link = '<a href="https://example.com/a" rel="nofollow">example.com/a</a>';
    const mention = '<a href="https://remote.example/@bob" class="u-url mention">@bob</a>';
    const t = setup({ reply: () => '[[lang:en]]⟦1⟧ さん、⟦2⟧ を見て' });
    const post = t.add(makePost(`<p>${mention} look at ${link}</p>`));

    const result = await expectOk(t.translate(post.postId));

    expect(generateCall(t.calls[0]!).input).toBe('⟪1⟫ ⟦1⟧ look at ⟦2⟧');
    expect(result.content).toBe(`<p>${mention} さん、${link} を見て</p>`);
  });

  it('リンクだけの投稿は翻訳できないエラーにし、AI を呼ばず回数を数えない', async () => {
    const link = '<a href="https://example.com/a" rel="nofollow">example.com/a</a>';
    const t = setup();
    const post = t.add(makePost(`<p>RE: ${link}</p>`));

    expect(await expectErr(t.translate(post.postId))).toMatchObject({ type: 'TranslationNotAllowedError' });
    expect(t.calls).toEqual([]);
    expect(t.usage.recorder.reserve).not.toHaveBeenCalled();
  });

  it('訳文が空のときは AiError にする', async () => {
    const t = setup({ reply: () => '[[lang:en]]\n' });
    const post = t.add(makePost('<p>Hello</p>'));

    expect(await expectErr(t.translate(post.postId))).toMatchObject({ type: 'AiError' });
    expect(t.translations.store.save).not.toHaveBeenCalled();
  });

  it('5,000 字を超える原文は 5,000 字で切り、訳文の末尾に（以下省略）を足す', async () => {
    const t = setup();
    const post = t.add(makePost(`<p>${'a'.repeat(6000)}</p>`));

    const result = await expectOk(t.translate(post.postId));

    expect(Array.from(generateCall(t.calls[0]!).input)).toHaveLength(5000);
    expect(result.content).toBe('<p>こんにちは、世界</p><p>（以下省略）</p>');
  });

  it('ja 以外の lang は翻訳できないエラーにし、投稿を引かない', async () => {
    const t = setup();
    const post = t.add(makePost('<p>Hello</p>'));

    expect(await expectErr(t.translate(post.postId, 'en'))).toMatchObject({ type: 'TranslationNotAllowedError' });
    expect(t.postsResolve).not.toHaveBeenCalled();
    expect(t.calls).toEqual([]);
  });

  it('投稿を引けないときは store に訳文があっても PostNotFoundError にし、store を引かない', async () => {
    const t = setup();
    const postId = crypto.randomUUID() as PostId;
    t.translations.saved.set(
      t.translations.key(postId, 'ja'),
      PostTranslation.orThrow({
        postId,
        targetLanguage: 'ja',
        sourceHash: await hashTranslationSource('<p>Hello</p>'),
        content: '<p>保存済み</p>',
        detectedSourceLanguage: 'en',
        model: TRANSLATION_MODEL,
        createdAt: NOW - 1000,
      }),
    );

    expect(await expectErr(t.translate(postId))).toMatchObject({ type: 'PostNotFoundError' });
    expect(t.translations.store.find).not.toHaveBeenCalled();
  });

  it('direct のリモート投稿は翻訳できないエラーにし、AI を呼ばず回数を数えない', async () => {
    const t = setup();
    const post = t.add(makePost('<p>Hello</p>', { visibility: 'direct' }));

    expect(await expectErr(t.translate(post.postId))).toMatchObject({ type: 'TranslationNotAllowedError' });
    expect(t.calls).toEqual([]);
    expect(t.usage.recorder.reserve).not.toHaveBeenCalled();
  });

  it.each([
    ['かなを含む原文', '<p>こんにちは</p>'],
    ['平文が空の原文', '<p></p>'],
  ])('%s は翻訳できないエラーにし、AI を呼ばず回数を数えない', async (_name, content) => {
    const t = setup();
    const post = t.add(makePost(content));

    expect(await expectErr(t.translate(post.postId))).toMatchObject({ type: 'TranslationNotAllowedError' });
    expect(t.calls).toEqual([]);
    expect(t.usage.recorder.reserve).not.toHaveBeenCalled();
  });

  it('sourceHash が一致する訳文があればそれを返し、AI を呼ばず回数を数えず、残り回数は read で取る', async () => {
    const t = setup({ initialCount: 7 });
    const post = t.add(makePost('<p>Hello</p>'));
    t.translations.saved.set(
      t.translations.key(post.postId, 'ja'),
      PostTranslation.orThrow({
        postId: post.postId,
        targetLanguage: 'ja',
        sourceHash: await hashTranslationSource('<p>Hello</p>'),
        content: '<p>保存済み</p>',
        detectedSourceLanguage: 'en',
        model: TRANSLATION_MODEL,
        createdAt: NOW - 1000,
      }),
    );

    const result = await expectOk(t.translate(post.postId));

    expect(result).toEqual({
      content: '<p>保存済み</p>',
      detectedSourceLanguage: 'en',
      provider: TRANSLATION_PROVIDER,
      remainingToday: 43,
    });
    expect(t.calls).toEqual([]);
    expect(t.usage.recorder.reserve).not.toHaveBeenCalled();
    expect(t.translations.store.save).not.toHaveBeenCalled();
  });

  it('キャッシュがあれば AI が未設定でも返す', async () => {
    const t = setup({ textGenerator: null });
    const post = t.add(makePost('<p>Hello</p>'));
    t.translations.saved.set(
      t.translations.key(post.postId, 'ja'),
      PostTranslation.orThrow({
        postId: post.postId,
        targetLanguage: 'ja',
        sourceHash: await hashTranslationSource('<p>Hello</p>'),
        content: '<p>保存済み</p>',
        detectedSourceLanguage: 'en',
        model: TRANSLATION_MODEL,
        createdAt: NOW - 1000,
      }),
    );

    expect((await expectOk(t.translate(post.postId))).content).toBe('<p>保存済み</p>');
  });

  it('sourceHash が違う訳文は訳し直して上書きし、回数を数える', async () => {
    const t = setup();
    const post = t.add(makePost('<p>Hello again</p>'));
    t.translations.saved.set(
      t.translations.key(post.postId, 'ja'),
      PostTranslation.orThrow({
        postId: post.postId,
        targetLanguage: 'ja',
        sourceHash: await hashTranslationSource('<p>Hello</p>'),
        content: '<p>古い訳</p>',
        detectedSourceLanguage: 'en',
        model: TRANSLATION_MODEL,
        createdAt: NOW - 1000,
      }),
    );

    const result = await expectOk(t.translate(post.postId));

    expect(result.content).toBe('<p>こんにちは、世界</p>');
    expect(result.remainingToday).toBe(49);
    expect(t.calls).toHaveLength(1);
    expect(t.translations.saved.get(t.translations.key(post.postId, 'ja'))).toMatchObject({
      sourceHash: await hashTranslationSource('<p>Hello again</p>'),
      content: '<p>こんにちは、世界</p>',
      createdAt: NOW,
    });
  });

  it('AI が未設定なら予約の前に TranslationAiUnavailableError にする', async () => {
    const t = setup({ textGenerator: null });
    const post = t.add(makePost('<p>Hello</p>'));

    expect(await expectErr(t.translate(post.postId))).toMatchObject({ type: 'TranslationAiUnavailableError' });
    expect(t.usage.recorder.reserve).not.toHaveBeenCalled();
  });

  it('1 日 50 回を超えると TranslationLimitExceededError にし、次の日本時間 0 時までの秒数を付ける', async () => {
    const t = setup({ initialCount: 50 });
    const post = t.add(makePost('<p>Hello</p>'));

    const error = await expectErr(t.translate(post.postId));

    expect(error).toEqual({
      type: 'TranslationLimitExceededError',
      message: 'The daily translation limit of 50 has been reached.',
      retryAfterSeconds: 12 * 60 * 60,
    });
    expect(t.calls).toEqual([]);
  });

  it('50 回目までは訳せて、残り回数は 0 になる', async () => {
    const t = setup({ initialCount: 49 });
    const post = t.add(makePost('<p>Hello</p>'));

    expect((await expectOk(t.translate(post.postId))).remainingToday).toBe(0);
  });

  it('日本時間の日付で回数を数える', async () => {
    const t = setup();
    const post = t.add(makePost('<p>Hello</p>'));

    await expectOk(t.translate(post.postId));

    expect(t.usage.recorder.reserve).toHaveBeenCalledWith({ userId: t.viewer.userId, day: '2026-11-04', limit: 50 });
  });

  it('AI が失敗すると AiError にし、回数は戻さず、保存しない', async () => {
    const failing: TextGenerator = {
      summarize: () => RA.err({ type: 'AiError', message: 'unavailable' }),
      generate: () => RA.err({ type: 'AiError', message: 'unavailable' }),
    };
    const t = setup({ textGenerator: failing });
    const post = t.add(makePost('<p>Hello</p>'));

    expect(await expectErr(t.translate(post.postId))).toEqual({ type: 'AiError', message: 'unavailable' });
    expect(t.usage.counts.size).toBe(1);
    expect([...t.usage.counts.values()]).toEqual([1]);
    expect(t.translations.store.save).not.toHaveBeenCalled();
  });

  it('指定した時間で終わらなければ TranslationTimeoutError にし、回数は戻さず、保存しない', async () => {
    const neverResolving: TextGenerator = {
      summarize: () => new Promise(() => {}),
      generate: () => new Promise(() => {}),
    };
    const t = setup({ textGenerator: neverResolving, timeoutMs: 10 });
    const post = t.add(makePost('<p>Hello</p>'));

    expect(await expectErr(t.translate(post.postId))).toEqual({
      type: 'TranslationTimeoutError',
      message: 'The translation did not finish within 10 ms.',
    });
    expect([...t.usage.counts.values()]).toEqual([1]);
    expect(t.translations.store.save).not.toHaveBeenCalled();
  });
});
