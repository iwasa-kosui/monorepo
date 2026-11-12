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

describe('PostView の投票の操作', () => {
  const onVote = () => Promise.resolve();

  it('未投票で終了していない単一選択の投票は、ラジオと「投票する」ボタンを出し、結果の棒は出さない', () => {
    const html = render(withPoll(poll()), onVote);

    expect(html).toContain('data-poll-form');
    expect(html).toContain('type="radio"');
    expect(html).not.toContain('type="checkbox"');
    expect(html).toContain('name="poll-post-1"');
    expect(html).toContain('投票する');
    expect(html).toContain('赤');
    expect(html).toContain('青 &lt;b&gt;');
    expect(html).not.toContain('data-poll-bar');
    expect(html).not.toContain('75%');
  });

  it('何も選んでいない間は、「投票する」ボタンを押せなくする', () => {
    const html = render(withPoll(poll()), onVote);

    expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  });

  it('複数選択の投票は、チェックボックスを出す', () => {
    const html = render(withPoll(poll({ multiple: true })), onVote);

    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('type="radio"');
    expect(html).toContain('投票する');
  });

  it('下に合計の票数と締め切りを出す', () => {
    const html = render(withPoll(poll({ expires_at: '2999-01-02T03:04:05.000Z' })), onVote);

    expect(html).toContain('4 票');
    expect(html).toContain('まで');
  });

  it('投票の操作が無ければ、未投票でも今の結果表示にする', () => {
    const html = render(withPoll(poll()));

    expect(html).not.toContain('data-poll-form');
    expect(html).not.toContain('投票する');
    expect(html).toContain('data-poll-bar');
    expect(html).toContain('75%');
  });

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

  it('複数の選択肢に投票していれば、そのすべてに印を付ける', () => {
    const html = render(withPoll(poll({ multiple: true, voted: true, own_votes: [0, 1] })), onVote);

    expect(html.match(/data-poll-own-vote/g)).toHaveLength(2);
  });

  it('終了した投票は、未投票でも結果表示にして、投票の入力を出さない', () => {
    const html = render(withPoll(poll({ expired: true })), onVote);

    expect(html).not.toContain('data-poll-form');
    expect(html).not.toContain('type="radio"');
    expect(html).toContain('終了');
    expect(html).toContain('75%');
    expect(html).not.toContain('data-poll-own-vote');
  });

  it('終了した投票でも、自分が選んだ選択肢には印を付ける', () => {
    const html = render(withPoll(poll({ expired: true, voted: true, own_votes: [0] })), onVote);

    expect(html.match(/data-poll-own-vote/g)).toHaveLength(1);
  });

  it('リブログされた投稿の投票にも、投票の入力を出す', () => {
    const reblog: Status = { ...base, id: 'repost-1', content: '', reblog: withPoll(poll()), poll: null };

    expect(render(reblog, onVote)).toContain('data-poll-form');
  });
});

describe('castVote', () => {
  it('成功したら、選んだ選択肢の番号を渡し、エラーを返さない', async () => {
    const calls: Array<readonly number[]> = [];

    const error = await castVote((choices) => {
      calls.push(choices);
      return Promise.resolve();
    }, [0, 2]);

    expect(error).toBeUndefined();
    expect(calls).toEqual([[0, 2]]);
  });

  it('API のエラーなら、サーバーのメッセージを含むエラー文を返す', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const apiError = Object.assign(new Error('Validation failed: The poll has already ended'), { status: 422 });

    const error = await castVote(() => Promise.reject(apiError), [0]);

    expect(error).toBe('Failed to vote: Validation failed: The poll has already ended');
  });

  it('ネットワークエラーなら、再試行を促すエラー文を返す', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const error = await castVote(() => Promise.reject(new TypeError('Failed to fetch')), [0]);

    expect(error).toBe('Failed to vote. Please try again.');
  });
});
