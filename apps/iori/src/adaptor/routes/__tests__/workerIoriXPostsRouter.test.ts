import { describe, expect, it } from 'vitest';

import { setupReadApi } from './helper/mastodonReadHarness.ts';

const PATH = '/api/iori/v1/x-posts';
const USER_SOURCE_ID = '11111111-1111-4111-8111-111111111111';
const DISABLED_SOURCE_ID = '22222222-2222-4222-8222-222222222222';
const RSS_SOURCE_ID = '33333333-3333-4333-8333-333333333333';

const seed = (t: ReturnType<typeof setupReadApi>) => {
  const addSource = (feedSourceId: string, kind: string, title: string, enabled: boolean) =>
    t.sqlite.prepare(
      'INSERT INTO feed_sources(feedSourceId,kind,url,title,enabled,createdAt) VALUES (?,?,?,?,?,?)',
    ).run(feedSourceId, kind, `https://example.com/${feedSourceId}`, title, enabled ? 1 : 0, 1);
  const addEntry = (feedEntryId: string, feedSourceId: string, text: string, publishedAt: number) =>
    t.sqlite.prepare(
      'INSERT INTO feed_entries(feedEntryId,feedSourceId,guid,url,title,description,publishedAt,fetchedAt) VALUES (?,?,?,?,?,?,?,?)',
    ).run(
      feedEntryId,
      feedSourceId,
      `guid-${feedEntryId}`,
      `https://x.com/jack/status/${feedEntryId}`,
      text.slice(0, 20),
      text,
      publishedAt,
      publishedAt,
    );
  addSource(USER_SOURCE_ID, 'x_user', '@jack', true);
  addSource(DISABLED_SOURCE_ID, 'x_user', '@muted', false);
  addSource(RSS_SOURCE_ID, 'rss', 'ブログ', true);
  addEntry('00000000-0000-4000-8000-000000000001', USER_SOURCE_ID, '古い投稿', Date.UTC(2026, 10, 5, 1));
  addEntry('00000000-0000-4000-8000-000000000002', USER_SOURCE_ID, '新しい投稿', Date.UTC(2026, 10, 6, 1));
  addEntry('00000000-0000-4000-8000-000000000003', DISABLED_SOURCE_ID, '無効な情報源の投稿', Date.UTC(2026, 10, 7, 1));
  addEntry('00000000-0000-4000-8000-000000000004', RSS_SOURCE_ID, 'RSS の記事', Date.UTC(2026, 10, 7, 2));
};

describe('GET /api/iori/v1/x-posts', () => {
  it('認証なしだと 401 にし、投稿を返さない', async () => {
    const t = setupReadApi();
    seed(t);

    const response = await t.request(PATH);

    expect(response.status).toBe(401);
    expect(await response.text()).not.toContain('投稿');
  });

  it('不正な Cookie でも 401 にする', async () => {
    const t = setupReadApi();
    seed(t);

    const response = await t.request(PATH, { headers: { Cookie: 'sessionId=00000000-0000-4000-8000-0000000000ff' } });

    expect(response.status).toBe(401);
  });

  it('read:statuses を満たさない scope のトークンを 403 にする', async () => {
    const t = setupReadApi();
    const me = await t.signIn('write:statuses');

    const response = await t.request(PATH, { headers: me.bearer });

    expect(response.status).toBe(403);
  });

  it('ログインしていれば、有効な x_user の投稿だけを新しい順に返す', async () => {
    const t = setupReadApi();
    const me = await t.signIn('read:statuses');
    seed(t);

    const response = await t.request(PATH, { headers: { Cookie: `sessionId=${me.sessionId}` } });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      posts: [
        {
          feedEntryId: '00000000-0000-4000-8000-000000000002',
          sourceTitle: '@jack',
          text: '新しい投稿',
          url: 'https://x.com/jack/status/00000000-0000-4000-8000-000000000002',
          postedAt: '2026-11-06T01:00:00.000Z',
        },
        {
          feedEntryId: '00000000-0000-4000-8000-000000000001',
          sourceTitle: '@jack',
          text: '古い投稿',
          url: 'https://x.com/jack/status/00000000-0000-4000-8000-000000000001',
          postedAt: '2026-11-05T01:00:00.000Z',
        },
      ],
    });
  });

  it('成功も失敗もキャッシュを許さず、検索エンジンに載せない', async () => {
    const t = setupReadApi();
    const me = await t.signIn('read:statuses');
    seed(t);

    const ok = await t.request(PATH, { headers: me.bearer });
    const unauthorized = await t.request(PATH);

    for (const response of [ok, unauthorized]) {
      expect(response.headers.get('Cache-Control')).toBe('private, no-store');
      expect(response.headers.get('X-Robots-Tag')).toBe('noindex');
    }
  });

  it('limit で件数を絞る', async () => {
    const t = setupReadApi();
    const me = await t.signIn('read:statuses');
    seed(t);

    const response = await t.request(`${PATH}?limit=1`, { headers: me.bearer });

    const { posts } = await response.json() as { posts: Array<{ text: string }> };
    expect(posts.map((post) => post.text)).toEqual(['新しい投稿']);
  });
});
