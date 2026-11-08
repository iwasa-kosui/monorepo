import { describe, expect, it } from 'vitest';

import { createD1DigestXPostsResolverByArticleId } from '../digest/digestXPostsResolverByArticleId.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

const setup = () => {
  const fixture = createSqliteD1Fixture();
  const { sqlite } = fixture;
  const author = createMastodonSeed(fixture).addLocalActor('kosui');
  let counter = 1000;
  const addDigest = (articleId: string, digestId: string) => {
    sqlite.prepare(
      'INSERT INTO articles(articleId,authorActorId,authorUserId,rootPostId,title,status,createdAt,publishedAt,unpublishedAt) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(articleId, author.actorId, author.userId, null, 'title', 'draft', 1_000, null, null);
    sqlite.prepare(
      'INSERT INTO digests(digestId,userId,digestDate,articleId,createdAt,pushSentAt,topicKey) VALUES (?,?,?,?,?,?,?)',
    ).run(digestId, author.userId, '2026-11-05', articleId, 2_000, null, `summary-${digestId}`);
  };
  const addSource = (kind: string, url: string, enabled = true) => {
    const feedSourceId = uuid(++counter);
    sqlite.prepare('INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)')
      .run(feedSourceId, kind, url, kind, enabled ? 1 : 0, 1_000);
    return feedSourceId;
  };
  const addEntry = (feedSourceId: string, title: string) => {
    const feedEntryId = uuid(++counter);
    sqlite.prepare(
      'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,publishedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?)',
    ).run(
      feedEntryId,
      feedSourceId,
      `guid-${feedEntryId}`,
      `https://x.com/someone/status/${counter}`,
      title,
      title,
      1,
      1,
    );
    return feedEntryId;
  };
  const link = (digestId: string, rank: number, feedEntryId: string) =>
    sqlite.prepare('INSERT INTO digest_x_posts(digestId,rank,feedEntryId) VALUES (?,?,?)').run(
      digestId,
      rank,
      feedEntryId,
    );
  const resolve = async (articleId: string) =>
    (await createD1DigestXPostsResolverByArticleId(fixture.db).resolve(articleId as never)).val;
  return { sqlite, addDigest, addSource, addEntry, link, resolve };
};

describe('DigestXPostsResolverByArticleId', () => {
  it('保存した順に、feed_entries から引いた本文とユーザー名を返し、別の記事の投稿は返さない', async () => {
    const { addDigest, addSource, addEntry, link, resolve } = setup();
    addDigest('article-1', 'digest-1');
    addDigest('article-2', 'digest-2');
    const source = addSource('x_user', 'https://x.com/kosui_iwasa');
    link('digest-1', 1, addEntry(source, 'first'));
    link('digest-1', 2, addEntry(source, 'second'));
    link('digest-2', 1, addEntry(source, 'other'));

    const posts = await resolve('article-1');

    expect(posts.map((post) => [post.username, post.title])).toEqual([
      ['kosui_iwasa', 'first'],
      ['kosui_iwasa', 'second'],
    ]);
  });

  it('7 日を過ぎて feed_entries から消えた投稿は返さない', async () => {
    const { sqlite, addDigest, addSource, addEntry, link, resolve } = setup();
    addDigest('article-1', 'digest-1');
    const source = addSource('x_user', 'https://x.com/jack');
    const expired = addEntry(source, 'expired');
    link('digest-1', 1, expired);
    link('digest-1', 2, addEntry(source, 'kept'));
    sqlite.prepare('DELETE FROM feed_entries WHERE feedEntryId = ?').run(expired);

    expect((await resolve('article-1')).map((post) => post.title)).toEqual(['kept']);
  });

  it('全部消えていれば空にする', async () => {
    const { sqlite, addDigest, addSource, addEntry, link, resolve } = setup();
    addDigest('article-1', 'digest-1');
    link('digest-1', 1, addEntry(addSource('x_user', 'https://x.com/jack'), 'gone'));
    sqlite.prepare('DELETE FROM feed_entries').run();

    expect(await resolve('article-1')).toEqual([]);
  });

  it('情報源を無効にした投稿と、URL からユーザー名を取れない情報源の投稿は返さない', async () => {
    const { addDigest, addSource, addEntry, link, resolve } = setup();
    addDigest('article-1', 'digest-1');
    link('digest-1', 1, addEntry(addSource('x_user', 'https://x.com/disabled', false), 'disabled'));
    link('digest-1', 2, addEntry(addSource('x_user', 'https://x.com/not-valid-name'), 'invalid'));
    link('digest-1', 3, addEntry(addSource('x_user', 'https://x.com/jack'), 'kept'));

    expect((await resolve('article-1')).map((post) => post.title)).toEqual(['kept']);
  });

  it('投稿を保存していない記事は空にする', async () => {
    const { addDigest, resolve } = setup();
    addDigest('article-1', 'digest-1');

    expect(await resolve('article-1')).toEqual([]);
    expect(await resolve('no-such-article')).toEqual([]);
  });
});
