import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { AccountProfile } from '../../domain/actor/accountProfile.ts';
import { ActorId } from '../../domain/actor/actorId.ts';
import { Instant } from '../../domain/instant/instant.ts';
import type { PostWithAuthor } from '../../domain/post/post.ts';
import type { PostExtras } from '../../domain/post/postExtras.ts';
import { PostId } from '../../domain/post/postId.ts';
import type { RemotePostPoll } from '../../domain/post/remotePostPoll.ts';
import { UserId } from '../../domain/user/userId.ts';
import { Username } from '../../domain/user/username.ts';
import { createStatusAssembler, type StatusSource } from './statusAssembler.ts';

const actorId = ActorId.generate();
const createdAt = Instant.orThrow(Date.UTC(2025, 0, 2, 3, 4, 5));

const profile: AccountProfile = {
  type: 'remote',
  actor: {
    id: actorId,
    uri: 'https://remote.example/users/alice',
    inboxUrl: 'https://remote.example/users/alice/inbox',
    type: 'remote',
    username: 'alice',
  },
  stats: { followersCount: 0, followingCount: 0, statusesCount: 0, createdAt, lastStatusAt: null },
};

const extras = (quotePost: PostWithAuthor | null = null): PostExtras => ({
  repliesCount: 0,
  inReplyTo: null,
  myReactionEmojis: [],
  bookmarked: false,
  blueskyCrosspost: null,
  quote: quotePost === null ? null : { uri: 'https://remote.example/notes/quoted', post: quotePost },
});

const base = {
  actorId,
  createdAt,
  summary: null,
  sensitive: false,
  inReplyToUri: null,
  username: Username.orThrow('alice'),
  logoUri: undefined,
  liked: false,
  reposted: false,
  images: [],
  likeCount: 0,
  repostCount: 0,
  reactions: [],
  linkPreviews: [],
};

const remotePost = (): PostWithAuthor => ({
  ...base,
  type: 'remote',
  postId: PostId.generate(),
  content: '<p>q</p>',
  uri: `https://remote.example/notes/${crypto.randomUUID()}`,
  visibility: 'public',
});

const localPost = (): PostWithAuthor => ({
  ...base,
  type: 'local',
  postId: PostId.generate(),
  content: '<p>local</p>',
  userId: UserId.generate(),
  visibility: 'public',
});

const poll = (votesCount: number): RemotePostPoll => ({
  multiple: false,
  options: [{ title: 'a', votesCount }, { title: 'b', votesCount: 1 }],
  votersCount: null,
  expiresAt: null,
  closed: false,
});

const setup = (
  polls: ReadonlyMap<PostId, RemotePostPoll>,
  extrasOf: (post: PostWithAuthor) => PostExtras = () => extras(),
  votes: ReadonlyMap<PostId, ReadonlyArray<number>> = new Map(),
) => {
  const remotePostPollsResolver = { resolve: vi.fn(async () => RA.ok(polls)) };
  const remotePostPollVotesResolver = { resolve: vi.fn(async () => RA.ok(votes)) };
  const assembler = createStatusAssembler({
    accountProfilesResolver: { resolve: async () => RA.ok(new Map([[actorId, profile]])) },
    postExtrasResolver: {
      resolve: async ({ posts }: Readonly<{ posts: ReadonlyArray<PostWithAuthor> }>) =>
        RA.ok(new Map(posts.map((post): [PostId, PostExtras] => [post.postId, extrasOf(post)]))),
    },
    remotePostPollsResolver,
    remotePostPollVotesResolver,
  } as never);
  const assemble = (posts: ReadonlyArray<PostWithAuthor>, viewerActorId: ActorId | undefined = undefined) =>
    assembler.assemble({
      sources: posts.map((post): StatusSource => ({ type: 'post', post })),
      viewerActorId,
      requestUrl: 'https://iori.example/api/v1/timelines/public',
    });
  return { remotePostPollsResolver, remotePostPollVotesResolver, assemble };
};

describe('createStatusAssembler の投票', () => {
  it('複数の投稿の投票を 1 回の問い合わせでまとめて読み、投稿ごとに入れる', async () => {
    const withPoll = remotePost();
    const otherPoll = remotePost();
    const noPoll = remotePost();
    const t = setup(new Map([[withPoll.postId, poll(4)], [otherPoll.postId, poll(9)]]));

    const statuses = await t.assemble([withPoll, noPoll, otherPoll]);

    expect(t.remotePostPollsResolver.resolve).toHaveBeenCalledTimes(1);
    expect(t.remotePostPollsResolver.resolve).toHaveBeenCalledWith([withPoll.postId, noPoll.postId, otherPoll.postId]);
    expect(statuses.map((status) => status.poll?.votes_count ?? null)).toEqual([5, null, 10]);
    expect(statuses[0].poll?.id).toBe(withPoll.postId);
  });

  it('ローカルの投稿は投票を読む対象にしない', async () => {
    const local = localPost();
    const remote = remotePost();
    const t = setup(new Map([[remote.postId, poll(1)]]));

    const statuses = await t.assemble([local, remote]);

    expect(t.remotePostPollsResolver.resolve).toHaveBeenCalledWith([remote.postId]);
    expect(statuses[0].poll).toBeNull();
    expect(statuses[1].poll).not.toBeNull();
  });

  it('引用先の投稿の投票も、引用元とは別に 1 回の問い合わせで読む', async () => {
    const quoted = remotePost();
    const quoting = remotePost();
    const t = setup(
      new Map([[quoted.postId, poll(7)]]),
      (post) => post.postId === quoting.postId ? extras(quoted) : extras(),
    );

    const statuses = await t.assemble([quoting]);

    expect(t.remotePostPollsResolver.resolve).toHaveBeenCalledTimes(2);
    expect(t.remotePostPollsResolver.resolve).toHaveBeenNthCalledWith(2, [quoted.postId]);
    expect(statuses[0].poll).toBeNull();
    expect(statuses[0].quote?.quoted_status.poll?.votes_count).toBe(8);
  });

  it('引用が無ければ、投票の問い合わせは 1 回だけにする', async () => {
    const t = setup(new Map());

    await t.assemble([remotePost(), remotePost()]);

    expect(t.remotePostPollsResolver.resolve).toHaveBeenCalledTimes(1);
  });
});

describe('createStatusAssembler の自分の投票', () => {
  const viewerActorId = ActorId.generate();

  it('複数の投稿の自分の投票を 1 回の問い合わせでまとめて読み、投稿ごとに voted と own_votes を入れる', async () => {
    const voted = remotePost();
    const notVoted = remotePost();
    const multiple = remotePost();
    const t = setup(
      new Map([[voted.postId, poll(4)], [notVoted.postId, poll(2)], [multiple.postId, poll(1)]]),
      () => extras(),
      new Map([[voted.postId, [1]], [multiple.postId, [0, 1]]]),
    );

    const statuses = await t.assemble([voted, notVoted, multiple], viewerActorId);

    expect(t.remotePostPollVotesResolver.resolve).toHaveBeenCalledTimes(1);
    expect(t.remotePostPollVotesResolver.resolve).toHaveBeenCalledWith({
      actorId: viewerActorId,
      postIds: [voted.postId, notVoted.postId, multiple.postId],
    });
    expect(statuses.map((status) => [status.poll?.voted, status.poll?.own_votes])).toEqual([
      [true, [1]],
      [false, []],
      [true, [0, 1]],
    ]);
  });

  it('ローカルの投稿は自分の投票を読む対象にしない', async () => {
    const remote = remotePost();
    const t = setup(new Map([[remote.postId, poll(1)]]));

    await t.assemble([localPost(), remote], viewerActorId);

    expect(t.remotePostPollVotesResolver.resolve).toHaveBeenCalledWith({
      actorId: viewerActorId,
      postIds: [remote.postId],
    });
  });

  it('閲覧者がいなければ、自分の投票を読まず、voted を false にする', async () => {
    const remote = remotePost();
    const t = setup(new Map([[remote.postId, poll(1)]]), () => extras(), new Map([[remote.postId, [0]]]));

    const statuses = await t.assemble([remote]);

    expect(t.remotePostPollVotesResolver.resolve).not.toHaveBeenCalled();
    expect(statuses[0].poll).toMatchObject({ voted: false, own_votes: [] });
  });

  it('引用先の自分の投票も、引用元とは別に 1 回の問い合わせで読む', async () => {
    const quoted = remotePost();
    const quoting = remotePost();
    const t = setup(
      new Map([[quoted.postId, poll(7)]]),
      (post) => post.postId === quoting.postId ? extras(quoted) : extras(),
      new Map([[quoted.postId, [1]]]),
    );

    const statuses = await t.assemble([quoting], viewerActorId);

    expect(t.remotePostPollVotesResolver.resolve).toHaveBeenCalledTimes(2);
    expect(t.remotePostPollVotesResolver.resolve).toHaveBeenNthCalledWith(2, {
      actorId: viewerActorId,
      postIds: [quoted.postId],
    });
    expect(statuses[0].quote?.quoted_status.poll).toMatchObject({ voted: true, own_votes: [1] });
  });

  it('自分の投票を読めなければ、組み立てに失敗する', async () => {
    const remote = remotePost();
    const t = setup(new Map([[remote.postId, poll(1)]]));
    t.remotePostPollVotesResolver.resolve.mockResolvedValue(RA.err(new Error('x')) as never);

    await expect(t.assemble([remote], viewerActorId)).rejects.toThrow('Failed to resolve remote post poll votes');
  });
});
