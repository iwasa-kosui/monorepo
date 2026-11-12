import { Result } from '@iwasa-kosui/result';
import { describe, expect, it } from 'vitest';

import { createD1BlueskyTimelineItemsResolver } from '../blueskyTimeline/blueskyTimelineItemsResolver.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const BASE = Date.UTC(2026, 10, 8, 12);
const BRIDGED_HANDLE = 'alice.mastodon.example.ap.brid.gy';

const setup = () => {
  const { sqlite, db } = createSqliteD1Fixture();
  sqlite.exec(
    'INSERT INTO actors(actorId,type,uri,inboxUrl) VALUES (\'actor-1\',\'remote\',\'https://mastodon.example/users/alice\',\'https://mastodon.example/inbox\')',
  );
  const insertPost = sqlite.prepare(
    'INSERT INTO posts(postId,actorId,content,createdAt,type,deletedAt) VALUES (?,?,?,?,?,?)',
  );
  const insertRemotePost = sqlite.prepare('INSERT INTO remote_posts(postId,uri,url) VALUES (?,?,?)');
  const insertItem = sqlite.prepare(
    'INSERT INTO bluesky_timeline_items(feedItemId,uri,cid,authorDid,authorHandle,text,facets,bridgyOriginalUrl,postedAt,indexedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
  );
  const resolver = createD1BlueskyTimelineItemsResolver(db);
  return {
    remotePost: (postId: string, uri: string, url: string | null, deletedAt: number | null = null) => {
      insertPost.run(postId, 'actor-1', 'hi', 1000, 'remote', deletedAt);
      insertRemotePost.run(postId, uri, url);
    },
    blueskyItem: (feedItemId: string, bridgyOriginalUrl: string | null, authorHandle: string = BRIDGED_HANDLE) =>
      insertItem.run(
        feedItemId,
        feedItemId,
        'cid',
        'did:plc:a',
        authorHandle,
        'text',
        '[]',
        bridgyOriginalUrl,
        1,
        BASE,
        1,
      ),
    bridgedFromPostIds: async () =>
      Object.fromEntries(
        Result.unsafeUnwrap(await resolver.resolve({ limit: 10, before: undefined }))
          .map((item) => [item.feedItemId, item.bridgedFromPostId]),
      ),
  };
};

describe('Bluesky のタイムラインの項目と Fediverse の投稿の突き合わせ', () => {
  it('bridgyOriginalUrl が remote_posts.url と一致すれば、その投稿の postId を返す', async () => {
    const t = setup();
    t.remotePost('post-1', 'https://mastodon.example/users/alice/statuses/1', 'https://mastodon.example/@alice/1');
    t.blueskyItem('at://x/1', 'https://mastodon.example/@alice/1');

    expect(await t.bridgedFromPostIds()).toEqual({ 'at://x/1': 'post-1' });
  });

  it('bridgyOriginalUrl が remote_posts.uri と一致すれば、その投稿の postId を返す', async () => {
    const t = setup();
    t.remotePost('post-1', 'https://mastodon.example/users/alice/statuses/1', null);
    t.blueskyItem('at://x/1', 'https://mastodon.example/users/alice/statuses/1');

    expect(await t.bridgedFromPostIds()).toEqual({ 'at://x/1': 'post-1' });
  });

  it('末尾のスラッシュの有無が違っても一致する', async () => {
    const t = setup();
    t.remotePost('post-1', 'https://mastodon.example/users/alice/statuses/1', 'https://mastodon.example/@alice/1/');
    t.remotePost('post-2', 'https://mastodon.example/users/alice/statuses/2', 'https://mastodon.example/@alice/2');
    t.blueskyItem('at://x/1', 'https://mastodon.example/@alice/1');
    t.blueskyItem('at://x/2', 'https://mastodon.example/@alice/2/');

    expect(await t.bridgedFromPostIds()).toEqual({ 'at://x/1': 'post-1', 'at://x/2': 'post-2' });
  });

  it('url と uri が別の投稿に当たるときは uri の一致を優先する', async () => {
    const t = setup();
    t.remotePost('post-url', 'https://mastodon.example/users/alice/statuses/1', 'https://mastodon.example/@alice/1');
    t.remotePost('post-uri', 'https://mastodon.example/@alice/1', null);
    t.blueskyItem('at://x/1', 'https://mastodon.example/@alice/1');

    expect(await t.bridgedFromPostIds()).toEqual({ 'at://x/1': 'post-uri' });
  });

  it('ハンドルが .ap.brid.gy で終わらなければ、URL が一致しても null にする', async () => {
    const t = setup();
    t.remotePost('post-1', 'https://mastodon.example/users/alice/statuses/1', 'https://mastodon.example/@alice/1');
    t.blueskyItem('at://x/1', 'https://mastodon.example/@alice/1', 'alice.bsky.social');

    expect(await t.bridgedFromPostIds()).toEqual({ 'at://x/1': null });
  });

  it('一致する投稿が無いとき、bridgyOriginalUrl が無いときは null にする', async () => {
    const t = setup();
    t.remotePost('post-1', 'https://mastodon.example/users/alice/statuses/1', 'https://mastodon.example/@alice/1');
    t.blueskyItem('at://x/1', 'https://mastodon.example/@alice/999');
    t.blueskyItem('at://x/2', null);

    expect(await t.bridgedFromPostIds()).toEqual({ 'at://x/1': null, 'at://x/2': null });
  });

  it('削除済みの投稿には一致させない', async () => {
    const t = setup();
    t.remotePost('post-1', 'https://mastodon.example/users/alice/statuses/1', 'https://mastodon.example/@alice/1', 5);
    t.blueskyItem('at://x/1', 'https://mastodon.example/@alice/1');

    expect(await t.bridgedFromPostIds()).toEqual({ 'at://x/1': null });
  });
});
