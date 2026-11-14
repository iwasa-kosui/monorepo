import { describe, expect, it } from 'vitest';

import { Instant } from '../../../domain/instant/instant.ts';
import { X_USER_RETENTION_DAYS } from '../../../useCase/fetchXUserItems.ts';
import { createD1DigestXPostsResolverByArticleId } from '../digest/digestXPostsResolverByArticleId.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const NOW = Instant.orThrow(Date.UTC(2026, 10, 8));
const DAY = 24 * 60 * 60 * 1000;

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
  const addEntry = (
    feedSourceId: string,
    title: string,
    times: Readonly<{ publishedAt: number | null; fetchedAt: number }> = {
      publishedAt: NOW - DAY,
      fetchedAt: NOW - DAY,
    },
  ) => {
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
      times.publishedAt,
      times.fetchedAt,
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
    (await createD1DigestXPostsResolverByArticleId(fixture.db).resolve({ articleId: articleId as never, now: NOW }))
      .val;
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

  it('feed_entries に行が残っていても、削除と同じ基準で 7 日を過ぎていれば返さない', async () => {
    const { addDigest, addSource, addEntry, link, resolve } = setup();
    addDigest('article-1', 'digest-1');
    const source = addSource('x_user', 'https://x.com/jack');
    const retention = X_USER_RETENTION_DAYS * DAY;
    link('digest-1', 1, addEntry(source, 'old published', { publishedAt: NOW - retention - 1, fetchedAt: NOW }));
    link('digest-1', 2, addEntry(source, 'old fetched', { publishedAt: null, fetchedAt: NOW - retention - 1 }));
    link('digest-1', 3, addEntry(source, 'edge published', { publishedAt: NOW - retention, fetchedAt: NOW - 8 * DAY }));
    link('digest-1', 4, addEntry(source, 'edge fetched', { publishedAt: null, fetchedAt: NOW - retention }));

    expect((await resolve('article-1')).map((post) => post.title)).toEqual(['edge published', 'edge fetched']);
  });

  it('情報源を無効にした投稿と、URL からユーザー名を取れない情報源の投稿は返さない', async () => {
    const { addDigest, addSource, addEntry, link, resolve } = setup();
    addDigest('article-1', 'digest-1');
    link('digest-1', 1, addEntry(addSource('x_user', 'https://x.com/disabled', false), 'disabled'));
    link('digest-1', 2, addEntry(addSource('x_user', 'https://x.com/not-valid-name'), 'invalid'));
    link('digest-1', 3, addEntry(addSource('x_user', 'https://x.com/jack'), 'kept'));

    expect((await resolve('article-1')).map((post) => post.title)).toEqual(['kept']);
  });
});
