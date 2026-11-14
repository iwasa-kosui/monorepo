import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { Post } from '../../../domain/post/post.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { RemotePostPoll } from '../../../domain/post/remotePostPoll.ts';
import { RemotePostPollVote } from '../../../domain/post/remotePostPollVote.ts';
import { createD1PostCreatedStore } from '../post/postCreatedStore.ts';
import { createD1PostDeletedStore } from '../post/postDeletedStore.ts';
import { createD1RemotePostPollsResolverByPostIds } from '../post/remotePostPollsResolverByPostIds.ts';
import { createD1RemotePostPollUpdatedStore } from '../post/remotePostPollUpdatedStore.ts';
import { createD1RemotePostPollVotedStore } from '../post/remotePostPollVotedStore.ts';
import { createD1RemotePostPollVotesResolverByPostIds } from '../post/remotePostPollVotesResolverByPostIds.ts';
import { createD1RemotePostsPrunedStore } from '../post/remotePostsPrunedStore.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const seed = createMastodonSeed(fixture);
  const alice = seed.addRemoteActor('alice');
  const me = seed.addLocalActor('kosui');
  const other = seed.addLocalActor('other');
  return { ...fixture, seed, alice, me, other };
};

const poll = (overrides: Partial<RemotePostPoll> = {}): RemotePostPoll => ({
  multiple: true,
  options: [{ title: '赤', votesCount: 3 }, { title: '青', votesCount: 5 }, { title: '緑', votesCount: 0 }],
  votersCount: 8,
  expiresAt: Instant.orThrow(4_000_000_000_000),
  closed: false,
  ...overrides,
});

const createRemote = (actorId: string, pollValue?: RemotePostPoll) =>
  Post.createRemotePost(Instant.now())({
    actorId: ActorId.orThrow(actorId),
    content: '<p>q</p>',
    uri: `https://remote.example/notes/${crypto.randomUUID()}`,
    visibility: null,
    poll: pollValue,
  });

const vote = (postId: PostId, actorId: string, choices: number[], pollValue: RemotePostPoll) => {
  const voted = RemotePostPollVote.vote(
    { postId, actorId: ActorId.orThrow(actorId), choices },
    pollValue,
    [],
    Instant.now(),
  );
  if (!voted.ok) throw new Error(voted.err.message);
  return voted.val;
};

const resolvePoll = async (t: ReturnType<typeof setup>, postId: PostId) => {
  const resolved = await createD1RemotePostPollsResolverByPostIds(t.db).resolve([postId]);
  return resolved.ok ? resolved.val.get(postId) : undefined;
};

const voteRows = (t: ReturnType<typeof setup>, postId: string) =>
  t.sqlite.prepare(
    'SELECT postId, actorId, choice FROM remote_post_poll_votes WHERE postId = ? ORDER BY actorId, choice',
  )
    .all(postId);

describe('remote_post_poll_votes の保存と読み出し', () => {
  it('選んだ選択肢ごとに行を保存し、読み出すと選択肢の番号の昇順で返す', async () => {
    const t = setup();
    const created = createRemote(t.alice.actorId, poll());
    await createD1PostCreatedStore(t.db).store(created);
    const { postId } = created.aggregateState;

    await createD1RemotePostPollVotedStore(t.db).store(vote(postId, t.me.actorId, [2, 0], poll()));

    expect(voteRows(t, postId)).toEqual([
      { postId, actorId: t.me.actorId, choice: 0 },
      { postId, actorId: t.me.actorId, choice: 2 },
    ]);
    const resolved = await createD1RemotePostPollVotesResolverByPostIds(t.db).resolve({
      actorId: ActorId.orThrow(t.me.actorId),
      postIds: [postId],
    });
    expect(resolved.ok && resolved.val.get(postId)).toEqual([0, 2]);
  });

  it('保存済みの poll の、選んだ選択肢の votesCount と votersCount を 1 ずつ増やす', async () => {
    const t = setup();
    const created = createRemote(t.alice.actorId, poll());
    await createD1PostCreatedStore(t.db).store(created);
    const { postId } = created.aggregateState;

    await createD1RemotePostPollVotedStore(t.db).store(vote(postId, t.me.actorId, [0, 2], poll()));

    expect(await resolvePoll(t, postId)).toEqual(poll({
      options: [{ title: '赤', votesCount: 4 }, { title: '青', votesCount: 5 }, { title: '緑', votesCount: 1 }],
      votersCount: 9,
    }));
  });

  it('votersCount が null の poll は、null のままにする', async () => {
    const t = setup();
    const created = createRemote(t.alice.actorId, poll({ votersCount: null }));
    await createD1PostCreatedStore(t.db).store(created);
    const { postId } = created.aggregateState;

    await createD1RemotePostPollVotedStore(t.db).store(vote(postId, t.me.actorId, [1], poll()));

    const saved = await resolvePoll(t, postId);
    expect(saved?.votersCount).toBeNull();
    expect(saved?.options.map((option) => option.votesCount)).toEqual([3, 6, 0]);
  });

  it('同じ利用者の 2 回目の投票は何も書かず、written を false で返す', async () => {
    const t = setup();
    const created = createRemote(t.alice.actorId, poll());
    await createD1PostCreatedStore(t.db).store(created);
    const { postId } = created.aggregateState;
    const store = createD1RemotePostPollVotedStore(t.db);
    const first = await store.store(vote(postId, t.me.actorId, [1], poll()));
    const eventsAfterFirst = t.sqlite.prepare('SELECT count(*) AS n FROM domain_events').get();

    const second = await store.store(vote(postId, t.me.actorId, [1], poll()));

    expect(first).toMatchObject({ ok: true, val: { written: true } });
    expect(second).toMatchObject({ ok: true, val: { written: false } });
    expect((await resolvePoll(t, postId))?.votersCount).toBe(9);
    expect(voteRows(t, postId)).toHaveLength(1);
    expect(t.sqlite.prepare('SELECT count(*) AS n FROM domain_events').get()).toEqual(eventsAfterFirst);
  });

  it('複数選択でも、投票した後に別の選択肢を足す投票は何も書かない', async () => {
    const t = setup();
    const created = createRemote(t.alice.actorId, poll());
    await createD1PostCreatedStore(t.db).store(created);
    const { postId } = created.aggregateState;
    const store = createD1RemotePostPollVotedStore(t.db);
    await store.store(vote(postId, t.me.actorId, [0], poll()));

    const second = await store.store(vote(postId, t.me.actorId, [2], poll()));

    expect(second).toMatchObject({ ok: true, val: { written: false } });
    expect(voteRows(t, postId)).toEqual([{ postId, actorId: t.me.actorId, choice: 0 }]);
    expect((await resolvePoll(t, postId))?.options.map((option) => option.votesCount)).toEqual([4, 5, 0]);
  });

  it('別の利用者の投票は、先の投票があっても書く', async () => {
    const t = setup();
    const created = createRemote(t.alice.actorId, poll());
    await createD1PostCreatedStore(t.db).store(created);
    const { postId } = created.aggregateState;
    const store = createD1RemotePostPollVotedStore(t.db);
    await store.store(vote(postId, t.me.actorId, [1], poll()));

    const other = await store.store(vote(postId, t.other.actorId, [1], poll()));

    expect(other).toMatchObject({ ok: true, val: { written: true } });
    expect((await resolvePoll(t, postId))?.votersCount).toBe(10);
  });

  it('相手の Update が投票を上書きしても、自分の投票の記録は残る', async () => {
    const t = setup();
    const created = createRemote(t.alice.actorId, poll());
    await createD1PostCreatedStore(t.db).store(created);
    const { postId } = created.aggregateState;
    await createD1RemotePostPollVotedStore(t.db).store(vote(postId, t.me.actorId, [1], poll()));
    const theirs = poll({
      options: [{ title: '赤', votesCount: 10 }, { title: '青', votesCount: 20 }, { title: '緑', votesCount: 1 }],
      votersCount: 31,
    });

    await createD1RemotePostPollUpdatedStore(t.db).store(
      Post.updateRemotePostPoll(Instant.now())(created.aggregateState, theirs),
    );

    expect(await resolvePoll(t, postId)).toEqual(theirs);
    expect(voteRows(t, postId)).toEqual([{ postId, actorId: t.me.actorId, choice: 1 }]);
    const resolved = await createD1RemotePostPollVotesResolverByPostIds(t.db).resolve({
      actorId: ActorId.orThrow(t.me.actorId),
      postIds: [postId],
    });
    expect(resolved.ok && resolved.val.get(postId)).toEqual([1]);
  });

  it('複数の投稿の自分の投票を 1 回の問い合わせで読み、他の利用者の投票は読まない', async () => {
    const t = setup();
    const first = createRemote(t.alice.actorId, poll());
    const second = createRemote(t.alice.actorId, poll());
    const none = createRemote(t.alice.actorId, poll());
    for (const event of [first, second, none]) await createD1PostCreatedStore(t.db).store(event);
    const votedStore = createD1RemotePostPollVotedStore(t.db);
    await votedStore.store(vote(first.aggregateState.postId, t.me.actorId, [1], poll()));
    await votedStore.store(vote(second.aggregateState.postId, t.me.actorId, [0, 2], poll()));
    await votedStore.store(vote(none.aggregateState.postId, t.other.actorId, [0], poll()));
    const before = t.queries.length;

    const resolved = await createD1RemotePostPollVotesResolverByPostIds(t.db).resolve({
      actorId: ActorId.orThrow(t.me.actorId),
      postIds: [first.aggregateState.postId, second.aggregateState.postId, none.aggregateState.postId],
    });

    expect(t.queries.length - before).toBe(1);
    expect(resolved.ok && [...resolved.val.entries()].sort()).toEqual([
      [first.aggregateState.postId, [1]],
      [second.aggregateState.postId, [0, 2]],
    ].sort());
  });
});

describe('投票の記録を持つ投稿の削除', () => {
  it('投稿を削除すると、投票の記録の行も消す', async () => {
    const t = setup();
    const created = createRemote(t.alice.actorId, poll());
    await createD1PostCreatedStore(t.db).store(created);
    const { postId } = created.aggregateState;
    await createD1RemotePostPollVotedStore(t.db).store(vote(postId, t.me.actorId, [1], poll()));

    await createD1PostDeletedStore(t.db).store(Post.deletePost(Instant.now())(postId));

    expect(voteRows(t, postId)).toEqual([]);
    expect(t.sqlite.prepare('SELECT count(*) AS n FROM posts').get()).toEqual({ n: 0 });
  });

  it('古いリモート投稿を片付けると、投票の記録の行も消す', async () => {
    const t = setup();
    const created = createRemote(t.alice.actorId, poll());
    await createD1PostCreatedStore(t.db).store(created);
    const { postId } = created.aggregateState;
    await createD1RemotePostPollVotedStore(t.db).store(vote(postId, t.me.actorId, [1], poll()));

    await createD1RemotePostsPrunedStore(t.db).store([postId]);

    expect(voteRows(t, postId)).toEqual([]);
    expect(t.sqlite.prepare('SELECT count(*) AS n FROM posts').get()).toEqual({ n: 0 });
  });
});
