import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { Poll, Status } from '../../adaptor/mastodon/entities.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import { postToStatus } from '../legacyConversion.ts';
import { pollPercent } from './PollView.tsx';
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

const render = (status: Status): string => String(jsx(PostView, { status }));
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
  it('poll が null なら、投票を出さない', () => {
    expect(render(withPoll(null))).not.toContain('data-poll');
  });

  it('選択肢ごとに title と割合の数字と横棒を出す', () => {
    const html = render(withPoll(poll()));

    expect(html).toContain('赤');
    expect(html).toContain('75%');
    expect(html).toContain('25%');
    expect(html).toContain('width:75%');
    expect(html).toContain('width:25%');
  });

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

  it('合計が 0 票なら、すべての選択肢を 0% にする', () => {
    const html = render(
      withPoll(poll({ votes_count: 0, options: [{ title: 'a', votes_count: 0 }, { title: 'b', votes_count: 0 }] })),
    );

    expect(html).toContain('0%');
    expect(html).toContain('width:0%');
    expect(html).toContain('0 票');
  });

  it('下に合計の票数を出す', () => {
    expect(render(withPoll(poll()))).toContain('4 票');
  });

  it('終了していれば「終了」を出す', () => {
    const html = render(withPoll(poll({ expired: true, expires_at: '2026-01-01T00:00:00.000Z' })));

    expect(html).toContain('終了');
  });

  it('終了していなければ締め切りの日時を出し、「終了」は出さない', () => {
    const html = render(withPoll(poll({ expires_at: '2999-01-02T03:04:05.000Z' })));

    expect(html).toContain('まで');
    expect(html).not.toContain('終了');
  });

  it('締め切りが無く終了もしていなければ、票数だけを出す', () => {
    const html = render(withPoll(poll()));

    expect(html).not.toContain('終了');
    expect(html).not.toContain('まで');
  });

  it('リブログされた投稿の投票を出す', () => {
    const reblog: Status = { ...base, id: 'repost-1', content: '', reblog: withPoll(poll()), poll: null };

    expect(render(reblog)).toContain('75%');
  });

  it('CW で本文を隠している間は、投票を出さない', () => {
    const html = render({ ...withPoll(poll()), spoiler_text: 'ネタバレ' });

    expect(html).not.toContain('data-poll');
  });
});
