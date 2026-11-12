import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import { postToStatus } from '../legacyConversion.ts';
import { PostView } from './PostView.tsx';

const remotePost = (overrides: Record<string, unknown> = {}) =>
  postToStatus({
    type: 'remote',
    postId: 'post-1',
    actorId: 'actor-1',
    userId: 'user-1',
    username: 'alice',
    uri: 'https://remote.example/notes/1',
    content: '<p>本文です</p>',
    createdAt: Date.parse('2026-01-02T03:04:05.000Z'),
    logoUri: undefined,
    liked: false,
    reposted: false,
    inReplyToUri: null,
    summary: null,
    sensitive: false,
    images: [],
    likeCount: 0,
    repostCount: 0,
    reactions: [],
    linkPreviews: [],
    ...overrides,
  } as unknown as PostWithAuthor);

const base = remotePost();
const quotedBase = remotePost({
  postId: 'post-q',
  username: 'bob',
  uri: 'https://other.example/notes/9',
  content: '<p>引用先の本文 <a href="https://example.com/x">リンク</a></p>',
  images: [{ imageId: 'image-q', url: 'https://other.example/media/q.png', altText: null }],
});
const quoted: Status = {
  ...quotedBase,
  account: { ...quotedBase.account, display_name: 'Bob Display' },
};

const withQuote = (status: Status, quote: Status['quote'], quoteUrl?: string): Status => ({
  ...status,
  quote,
  ...(quoteUrl === undefined
    ? {}
    : { iori: { reactions: [], link_previews: [], ...status.iori, quote_url: quoteUrl } }),
});

const accepted = (quotedStatus: Status): Status['quote'] => ({ state: 'accepted', quoted_status: quotedStatus });

const render = (status: Status): string => String(jsx(PostView, { status }));

const hasNestedAnchor = (html: string): boolean => {
  let depth = 0;
  for (const match of html.matchAll(/<(\/?)a(?=[\s>])/g)) {
    depth += match[1] === '/' ? -1 : 1;
    if (depth > 1) return true;
  }
  return false;
};

describe('PostView の引用カード', () => {
  it('accepted の引用先を、名前・本文・詳細ページへのリンク付きのカードで出す', () => {
    const html = render(withQuote(base, accepted(quoted)));

    expect(html).toContain('Bob Display');
    expect(html).toContain('引用先の本文');
    expect(html).toContain(`href="/posts/${quoted.id}"`);
    expect(html).toContain('https://other.example/media/q.png');
  });

  it('引用カードの中に入れ子の <a> を作らない', () => {
    const html = render(withQuote(base, accepted(quoted)));

    expect(html).toContain('リンク');
    expect(html).not.toContain('href="https://example.com/x"');
    expect(hasNestedAnchor(html)).toBe(false);
  });

  it('CW 付きの引用先は、本文と画像を出さずに spoiler_text だけ出す', () => {
    const html = render(withQuote(base, accepted({ ...quoted, spoiler_text: 'ネタバレ注意', sensitive: true })));

    expect(html).toContain('ネタバレ注意');
    expect(html).not.toContain('引用先の本文');
    expect(html).not.toContain('https://other.example/media/q.png');
  });

  it('sensitive だけの引用先も、本文と画像を出さない', () => {
    const html = render(withQuote(base, accepted({ ...quoted, sensitive: true })));

    expect(html).toContain('センシティブな内容');
    expect(html).not.toContain('引用先の本文');
    expect(html).not.toContain('https://other.example/media/q.png');
  });

  it('引用先を解決できないときは、quote_url へのリンクだけのカードを出す', () => {
    const html = render(withQuote(base, null, 'https://gone.example/notes/5'));

    expect(html).toContain('引用元の投稿を開く');
    expect(html).toContain('href="https://gone.example/notes/5"');
    expect(html).toContain('gone.example');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('noopener');
  });

  it('http(s) 以外の quote_url は出さない', () => {
    const html = render(withQuote(base, null, 'javascript:alert(1)'));

    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('引用元の投稿を開く');
  });

  it('引用カードを出すときは、引用先の URI を指す「RE:」の段落を隠す', () => {
    const content =
      '<p>コメント</p><p class="quote-inline">RE: <a href="https://other.example/notes/9">https://other.example/notes/9</a></p>';
    const html = render(withQuote({ ...base, content }, accepted(quoted)));

    expect(html).toContain('コメント');
    expect(html).not.toContain('RE:');
  });

  it('sanitize で class が落ちた「RE:」の段落も、リンク先が一致すれば隠す', () => {
    const content =
      '<p>コメント</p><p>RE: <a href="https://gone.example/notes/5" rel="nofollow">https://gone.example/notes/5</a></p>';
    const html = render(withQuote({ ...base, content }, null, 'https://gone.example/notes/5'));

    expect(html).toContain('コメント');
    expect(html).not.toContain('RE:');
  });

  it('引用先と関係ない「RE:」の段落は隠さない', () => {
    const content = '<p>RE: <a href="https://unrelated.example/">https://unrelated.example/</a></p>';
    const html = render(withQuote({ ...base, content }, accepted(quoted)));

    expect(html).toContain('RE:');
  });

  it('リブーストの中の投稿の引用も出す', () => {
    const inner = withQuote(base, accepted(quoted));
    const html = render({ ...base, id: 'boost-1', reblog: inner });

    expect(html).toContain('Bob Display');
    expect(html).toContain('引用先の本文');
  });

  it('引用が無いときは、引用カードを出さない', () => {
    const html = render(withQuote(base, null));

    expect(html).not.toContain('引用元の投稿を開く');
    expect(html).not.toContain('Bob Display');
  });
});
