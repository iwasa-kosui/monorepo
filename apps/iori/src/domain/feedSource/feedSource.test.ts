import { describe, expect, it } from 'vitest';

import { FeedSource } from './feedSource.ts';

describe('FeedSource.parseNew', () => {
  it('http の URL は受け付けない', () => {
    expect(FeedSource.parseNew({ kind: 'rss', url: 'http://example.com/feed.xml', title: 'ブログ' }).ok).toBe(false);
  });

  it.each([
    'https://localhost/feed.xml',
    'https://LOCALHOST./feed.xml',
    'https://blog.localhost/feed.xml',
    'https://printer.local/feed.xml',
    'https://db.internal/feed.xml',
    'https://127.0.0.1/feed.xml',
    'https://[::1]/',
    'https://2130706433/',
  ])('取得で拒否される URL %s は受け付けない', (url) => {
    expect(FeedSource.parseNew({ kind: 'rss', url, title: 'ブログ' }).ok).toBe(false);
  });

  it.each([
    'https://x.com/jack',
    'https://www.x.com/jack',
    'https://twitter.com/jack',
    'https://www.twitter.com/jack',
    'https://X.COM/jack',
    'https://Www.Twitter.Com/jack',
    'https://x.com./jack',
  ])('rss には x.com と twitter.com の URL %s を受け付けない', (url) => {
    expect(FeedSource.parseNew({ kind: 'rss', url, title: 'ブログ' }).ok).toBe(false);
  });

  it.each([
    'https://user:pass@example.com/feed.xml',
    'https://user@example.com/feed.xml',
    'https://:pass@example.com/feed.xml',
  ])('資格情報つきの URL %s は受け付けない', (url) => {
    expect(FeedSource.parseNew({ kind: 'rss', url, title: 'ブログ' }).ok).toBe(false);
  });

  it.each([
    ['https://EXAMPLE.com/feed.xml', 'https://example.com/feed.xml'],
    ['https://example.com:443/feed.xml', 'https://example.com/feed.xml'],
    ['https://example.com/feed.xml#top', 'https://example.com/feed.xml'],
    ['https://example.com/feed.xml#', 'https://example.com/feed.xml'],
    ['https:example.com/feed.xml', 'https://example.com/feed.xml'],
    ['https://example.com', 'https://example.com/'],
    ['https://example.com/feed.xml?a=1#top', 'https://example.com/feed.xml?a=1'],
  ])('URL %s を %s に正規化する', (url, normalized) => {
    const parsed = FeedSource.parseNew({ kind: 'rss', url, title: 'ブログ' });

    expect(parsed).toMatchObject({ ok: true, val: { url: normalized } });
  });
});

describe('FeedSource.parseNew の x_user', () => {
  it('ユーザー名から https://x.com/<小文字のユーザー名> の URL と @<ユーザー名> の title を作る', () => {
    expect(FeedSource.parseNew({ kind: 'x_user', username: 'Kosui_Iwasa' })).toMatchObject({
      ok: true,
      val: { kind: 'x_user', url: 'https://x.com/kosui_iwasa', title: '@Kosui_Iwasa' },
    });
  });

  it('url と title を渡しても使わない', () => {
    expect(
      FeedSource.parseNew({ kind: 'x_user', username: 'jack', url: 'https://example.com/', title: '別名' }),
    ).toMatchObject({ ok: true, val: { url: 'https://x.com/jack', title: '@jack' } });
  });
});
