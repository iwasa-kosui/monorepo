import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { Notification, Status } from '../../adaptor/mastodon/entities.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import { postToStatus } from '../legacyConversion.ts';
import { DIRECT_MARK_LABEL, DirectMark, isDirectStatus } from './DirectMark.tsx';
import { NotificationItem } from './NotificationItem.tsx';
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

const withVisibility = (visibility: Status['visibility']): Status => ({ ...base, visibility });

describe('isDirectStatus / DirectMark', () => {
  it('visibility が direct の Status だけを direct とみなす', () => {
    expect(isDirectStatus(withVisibility('direct'))).toBe(true);
    for (const visibility of ['public', 'unlisted', 'private'] as const) {
      expect(isDirectStatus(withVisibility(visibility))).toBe(false);
    }
  });

  it('鍵のアイコンと「ダイレクト」の文字を出す', () => {
    const html = String(jsx(DirectMark, {}));

    expect(html).toContain(DIRECT_MARK_LABEL);
    expect(html).toContain('<svg');
    expect(html).toContain('data-testid="direct-mark"');
  });
});

describe('PostView の direct の印', () => {
  it('direct の投稿にだけ印を出す', () => {
    expect(String(jsx(PostView, { status: withVisibility('direct') }))).toContain('data-testid="direct-mark"');
    for (const visibility of ['public', 'unlisted', 'private'] as const) {
      expect(String(jsx(PostView, { status: withVisibility(visibility) }))).not.toContain('data-testid="direct-mark"');
    }
  });
});

describe('NotificationItem の direct の印', () => {
  const mention = (status: Status): Notification =>
    ({
      id: 'n1',
      type: 'mention',
      created_at: '2026-01-02T03:04:05.000Z',
      account: {
        id: 'actor-2',
        username: 'alice',
        acct: 'alice@remote.example',
        uri: 'https://remote.example/users/alice',
        avatar: 'https://iori.test/a.png',
      },
      status,
    }) as unknown as Notification;

  it('メンションの投稿が direct のときだけ印を出す', () => {
    const render = (status: Status) =>
      String(jsx(NotificationItem, { notification: mention(status), recipientUsername: 'kosui' }));

    expect(render(withVisibility('direct'))).toContain('data-testid="direct-mark"');
    expect(render(withVisibility('public'))).not.toContain('data-testid="direct-mark"');
  });
});
