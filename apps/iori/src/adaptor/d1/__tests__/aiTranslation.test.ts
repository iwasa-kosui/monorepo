import { afterEach, describe, expect, it } from 'vitest';

import { PostTranslation } from '../../../domain/aiTranslation/postTranslation.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1AiTranslationUsageRecorder } from '../aiTranslation/aiTranslationUsageRecorder.ts';
import { createD1PostTranslationStore } from '../aiTranslation/postTranslationStore.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  return { ...fixture, seed: createMastodonSeed(fixture) };
};

const translation = (postId: string, overrides: Partial<PostTranslation> = {}) =>
  PostTranslation.orThrow({
    postId: PostId.orThrow(postId),
    targetLanguage: 'ja',
    sourceHash: 'hash-1',
    content: '<p>こんにちは</p>',
    detectedSourceLanguage: 'en',
    model: '@cf/meta/llama-4-scout-17b-16e-instruct',
    createdAt: 1_000 as PostTranslation['createdAt'],
    ...overrides,
  });

describe('createD1PostTranslationStore', () => {
  it('保存した訳文を postId と targetLanguage で取り出す', async () => {
    const { db, seed } = setup();
    const alice = seed.addRemoteActor('alice');
    const post = seed.addRemotePost(alice, 1_000);
    const store = createD1PostTranslationStore(db);

    await store.save(translation(post.postId));
    const found = await store.find(PostId.orThrow(post.postId), 'ja');

    expect(found).toEqual({ ok: true, val: translation(post.postId) });
  });

  it('保存がなければ undefined を返し、別の targetLanguage は別に扱う', async () => {
    const { db, seed } = setup();
    const alice = seed.addRemoteActor('alice');
    const post = seed.addRemotePost(alice, 1_000);
    const store = createD1PostTranslationStore(db);
    await store.save(translation(post.postId));

    expect(await store.find(PostId.orThrow(post.postId), 'en')).toEqual({ ok: true, val: undefined });
    expect(await store.find(PostId.generate(), 'ja')).toEqual({ ok: true, val: undefined });
  });

  it('同じ postId と targetLanguage への保存は上書きする', async () => {
    const { db, seed, sqlite } = setup();
    const alice = seed.addRemoteActor('alice');
    const post = seed.addRemotePost(alice, 1_000);
    const store = createD1PostTranslationStore(db);
    await store.save(translation(post.postId));

    await store.save(translation(post.postId, {
      sourceHash: 'hash-2',
      content: '<p>やあ</p>',
      detectedSourceLanguage: 'und',
      createdAt: 2_000 as PostTranslation['createdAt'],
    }));

    expect(await store.find(PostId.orThrow(post.postId), 'ja')).toEqual({
      ok: true,
      val: translation(post.postId, {
        sourceHash: 'hash-2',
        content: '<p>やあ</p>',
        detectedSourceLanguage: 'und',
        createdAt: 2_000 as PostTranslation['createdAt'],
      }),
    });
    expect(sqlite.prepare('SELECT count(*) AS n FROM post_translations').get()).toEqual({ n: 1 });
  });

  it('投稿の行を消すと訳文も消える', async () => {
    const { db, seed, sqlite } = setup();
    const alice = seed.addRemoteActor('alice');
    const post = seed.addRemotePost(alice, 1_000);
    await createD1PostTranslationStore(db).save(translation(post.postId));

    sqlite.prepare('DELETE FROM remote_posts WHERE postId = ?').run(post.postId);
    sqlite.prepare('DELETE FROM posts WHERE postId = ?').run(post.postId);

    expect(sqlite.prepare('SELECT count(*) AS n FROM post_translations').get()).toEqual({ n: 0 });
  });

  it('存在しない投稿への保存は外部キーで拒否する', async () => {
    const { db } = setup();

    await expect(createD1PostTranslationStore(db).save(translation(PostId.generate()))).rejects.toThrow();
  });
});

describe('createD1AiTranslationUsageRecorder', () => {
  it('予約するたびに回数を増やし、上限を超える予約は断る', async () => {
    const { db, seed } = setup();
    const me = seed.addLocalActor('kosui');
    const recorder = createD1AiTranslationUsageRecorder(db);
    const input = { userId: UserId.orThrow(me.userId), day: '2026-11-04', limit: 2 };

    expect(await recorder.reserve(input)).toEqual({ ok: true, val: { allowed: true, count: 1 } });
    expect(await recorder.reserve(input)).toEqual({ ok: true, val: { allowed: true, count: 2 } });
    expect(await recorder.reserve(input)).toEqual({ ok: true, val: { allowed: false, count: 2 } });
    expect(await recorder.read({ userId: input.userId, day: input.day })).toEqual({ ok: true, val: 2 });
  });

  it('日付と利用者ごとに別に数え、予約のない日は 0 を返す', async () => {
    const { db, seed } = setup();
    const me = seed.addLocalActor('kosui');
    const other = seed.addLocalActor('other');
    const recorder = createD1AiTranslationUsageRecorder(db);
    const userId = UserId.orThrow(me.userId);

    await recorder.reserve({ userId, day: '2026-11-04', limit: 50 });

    expect(await recorder.read({ userId, day: '2026-11-05' })).toEqual({ ok: true, val: 0 });
    expect(await recorder.read({ userId: UserId.orThrow(other.userId), day: '2026-11-04' })).toEqual({
      ok: true,
      val: 0,
    });
  });

  it('要約の回数とは別の表に数える', async () => {
    const { db, seed, sqlite } = setup();
    const me = seed.addLocalActor('kosui');

    await createD1AiTranslationUsageRecorder(db).reserve({
      userId: UserId.orThrow(me.userId),
      day: '2026-11-04',
      limit: 50,
    });

    expect(sqlite.prepare('SELECT count(*) AS n FROM ai_summary_usages').get()).toEqual({ n: 0 });
    expect(sqlite.prepare('SELECT day, count FROM ai_translation_usages').all()).toEqual([
      { day: '2026-11-04', count: 1 },
    ]);
  });
});
