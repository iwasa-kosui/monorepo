import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { IoriBlueskyCrosspost, Status } from '../../adaptor/mastodon/entities.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import { postToStatus } from '../legacyConversion.ts';
import { PostView } from './PostView.tsx';

const base = postToStatus({
  type: 'local',
  postId: 'post-1',
  actorId: 'actor-1',
  userId: 'user-1',
  username: 'alice',
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
} as unknown as PostWithAuthor);

const render = (crosspost?: IoriBlueskyCrosspost, visibility?: Status['visibility']): string => {
  const status: Status = crosspost === undefined
    ? base
    : {
      ...base,
      ...(visibility === undefined ? {} : { visibility }),
      iori: { ...base.iori!, bluesky_crosspost: crosspost },
    };
  return String(jsx(PostView, { status }));
};

const crosspost = (overrides: Partial<IoriBlueskyCrosspost>): IoriBlueskyCrosspost => ({
  status: 'pending',
  skip_reason: null,
  retrying: true,
  url: null,
  ...overrides,
});

const textOf = (html: string): string => html.replace(/<[^>]*>/g, '');

describe('PostView の Bluesky の印', () => {
  it('bluesky_crosspost が無ければ印を出さない', () => {
    expect(render()).not.toContain('Bluesky');
  });

  it('sent は URL への別タブのリンクにする', () => {
    const html = render(
      crosspost({ status: 'sent', retrying: false, url: 'https://bsky.app/profile/did:plc:a/post/b' }),
    );

    expect(html).toContain('href="https://bsky.app/profile/did:plc:a/post/b"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain('aria-label="Bluesky"');
    expect(html).toContain('<svg');
    expect(textOf(html)).not.toContain('Bluesky');
  });

  it('pending は「Bluesky 送信中」をアイコンの aria-label に入れる', () => {
    const html = render(crosspost({ status: 'pending' }));

    expect(html).toContain('aria-label="Bluesky 送信中"');
    expect(html).toContain('role="img"');
    expect(html).toContain('<svg');
    expect(textOf(html)).not.toContain('Bluesky');
  });

  it('failed で再送が残っていれば「Bluesky 再送待ち」をアイコンの aria-label に入れる', () => {
    const html = render(crosspost({ status: 'failed', retrying: true }));

    expect(html).toContain('aria-label="Bluesky 再送待ち"');
    expect(html).toContain('role="img"');
    expect(html).toContain('<svg');
    expect(textOf(html)).not.toContain('Bluesky');
  });

  it('failed で再送が残っていなければ赤のアイコンで「Bluesky に届いていません」を aria-label に入れる', () => {
    const html = render(crosspost({ status: 'failed', retrying: false }));

    expect(html).toContain('aria-label="Bluesky に届いていません"');
    expect(html).toContain('role="img"');
    expect(html).toContain('<svg');
    expect(html).toContain('text-red-600');
    expect(textOf(html)).not.toContain('Bluesky');
  });

  it('content_warning の skipped は「Bluesky に未送信」を aria-label に入れ、title に理由を入れる', () => {
    const html = render(crosspost({ status: 'skipped', skip_reason: 'content_warning', retrying: false }));

    expect(html).toContain('aria-label="Bluesky に未送信"');
    expect(html).toContain('role="img"');
    expect(html).toContain('<svg');
    expect(html).toContain('title="この投稿の当時は、CW 付きの投稿を Bluesky に送っていませんでした"');
    expect(textOf(html)).not.toContain('Bluesky');
  });

  it('reply_to_unsent の skipped は印を出さない', () => {
    expect(render(crosspost({ status: 'skipped', skip_reason: 'reply_to_unsent', retrying: false })))
      .not.toContain('Bluesky');
  });

  it('direct の投稿の visibility の skipped は印を出さない', () => {
    expect(render(crosspost({ status: 'skipped', skip_reason: 'visibility', retrying: false }), 'direct'))
      .not.toContain('Bluesky');
  });

  it('private の投稿の visibility の skipped は印を出す', () => {
    const html = render(crosspost({ status: 'skipped', skip_reason: 'visibility', retrying: false }), 'private');

    expect(html).toContain('aria-label="Bluesky に未送信"');
    expect(html).toContain('role="img"');
    expect(html).toContain('<svg');
    expect(textOf(html)).not.toContain('Bluesky');
  });

  it('deleting は何も出さない', () => {
    expect(render(crosspost({ status: 'deleting', retrying: false }))).not.toContain('Bluesky');
  });
});
