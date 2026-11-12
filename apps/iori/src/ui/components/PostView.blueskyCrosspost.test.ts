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

const render = (crosspost?: IoriBlueskyCrosspost): string => {
  const status: Status = crosspost === undefined
    ? base
    : { ...base, iori: { ...base.iori!, bluesky_crosspost: crosspost } };
  return String(jsx(PostView, { status }));
};

const crosspost = (overrides: Partial<IoriBlueskyCrosspost>): IoriBlueskyCrosspost => ({
  status: 'pending',
  skip_reason: null,
  retrying: true,
  url: null,
  ...overrides,
});

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
    expect(html).toContain('>Bluesky</a>');
  });

  it('pending は「Bluesky 送信中」を出す', () => {
    expect(render(crosspost({ status: 'pending' }))).toContain('Bluesky 送信中');
  });

  it('failed で再送が残っていれば「Bluesky 再送待ち」を出す', () => {
    expect(render(crosspost({ status: 'failed', retrying: true }))).toContain('Bluesky 再送待ち');
  });

  it('failed で再送が残っていなければ赤で「Bluesky に届いていません」を出す', () => {
    const html = render(crosspost({ status: 'failed', retrying: false }));

    expect(html).toContain('Bluesky に届いていません');
    expect(html).toContain('text-red-600');
  });

  it('content_warning の skipped は「Bluesky に未送信」を出し、title に理由を入れる', () => {
    const html = render(crosspost({ status: 'skipped', skip_reason: 'content_warning', retrying: false }));

    expect(html).toContain('Bluesky に未送信');
    expect(html).toContain('title="この投稿の当時は、CW 付きの投稿を Bluesky に送っていませんでした"');
  });

  it('reply_to_unsent の skipped は印を出さない', () => {
    expect(render(crosspost({ status: 'skipped', skip_reason: 'reply_to_unsent', retrying: false })))
      .not.toContain('Bluesky');
  });

  it('deleting は何も出さない', () => {
    expect(render(crosspost({ status: 'deleting', retrying: false }))).not.toContain('Bluesky');
  });
});
