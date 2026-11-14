import { jsx } from 'hono/jsx';
import { describe, expect, it, vi } from 'vitest';

import type { Poll, Status } from '../../adaptor/mastodon/entities.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import { postToStatus } from '../legacyConversion.ts';
import { castVote, pollPercent } from './PollView.tsx';
import { PostView } from './PostView.tsx';

const base: Status = postToStatus({
  type: 'remote',
  postId: 'post-1',
  actorId: 'actor-1',
  userId: 'user-1',
  username: 'alice',
  uri: 'https://remote.example/notes/1',
  content: '<p>好きな色は?</p>',
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

const poll = (overrides: Partial<Poll> = {}): Poll => ({
  id: 'post-1',
  expires_at: null,
  expired: false,
  multiple: false,
  votes_count: 4,
  voters_count: 4,
  options: [{ title: '赤', votes_count: 3 }, { title: '青 <b>', votes_count: 1 }],
  emojis: [],
  voted: false,
  own_votes: [],
  ...overrides,
});

const render = (status: Status, onVote?: (postId: string, choices: readonly number[]) => Promise<void>): string =>
  String(jsx(PostView, { status, onVote }));
const withPoll = (value: Poll | null): Status => ({ ...base, poll: value });

describe('pollPercent', () => {
  it('票数を合計で割った割合を、四捨五入した整数の百分率で返す', () => {
    expect(pollPercent(1, 3)).toBe(33);
    expect(pollPercent(2, 3)).toBe(67);
    expect(pollPercent(4, 4)).toBe(100);
  });

  it('合計が 0 なら 0 を返す', () => {
    expect(pollPercent(0, 0)).toBe(0);
  });
});

describe('PostView の投票', () => {
  it('複数選択の投票は、投票者数で割った割合を出す', () => {
    const html = render(
      withPoll(
        poll({
          multiple: true,
          votes_count: 7,
          voters_count: 4,
          options: [{ title: '赤', votes_count: 3 }, { title: '青', votes_count: 4 }],
        }),
      ),
    );

    expect(html).toContain('75%');
    expect(html).toContain('100%');
    expect(html).toContain('7 票');
  });

  it('複数選択の投票でも、投票者数が null か 0 なら合計の票数で割る', () => {
    const options = [{ title: '赤', votes_count: 3 }, { title: '青', votes_count: 1 }];

    for (const votersCount of [null, 0]) {
      const html = render(withPoll(poll({ multiple: true, voters_count: votersCount, options })));

      expect(html).toContain('75%');
      expect(html).toContain('25%');
    }
  });

  it('単一選択の投票は、投票者数が違っても合計の票数で割る', () => {
    const html = render(withPoll(poll({ voters_count: 2 })));

    expect(html).toContain('75%');
    expect(html).toContain('25%');
  });

  it('選択肢の title をエスケープする', () => {
    const html = render(withPoll(poll()));

    expect(html).toContain('青 &lt;b&gt;');
    expect(html).not.toContain('青 <b>');
  });
});

describe('PostView の投票の操作', () => {
  const onVote = () => Promise.resolve();

  it('投票後は結果表示にして、自分が選んだ選択肢にだけ印を付ける', () => {
    const html = render(withPoll(poll({ voted: true, own_votes: [1] })), onVote);

    expect(html).not.toContain('data-poll-form');
    expect(html).not.toContain('type="radio"');
    expect(html).not.toContain('投票する');
    expect(html).toContain('75%');
    expect(html.match(/data-poll-own-vote/g)).toHaveLength(1);
    expect(html).toMatch(/✓<\/span>青 &lt;b&gt;/);
    expect(html).not.toMatch(/✓<\/span>赤/);
  });
});

describe('castVote', () => {
  it('API のエラーなら、サーバーのメッセージを含むエラー文を返す', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const apiError = Object.assign(new Error('Validation failed: The poll has already ended'), { status: 422 });

    const error = await castVote(() => Promise.reject(apiError), [0]);

    expect(error).toBe('Failed to vote: Validation failed: The poll has already ended');
  });
});
