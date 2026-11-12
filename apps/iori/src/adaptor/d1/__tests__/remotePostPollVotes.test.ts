import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
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

describe('remote_post_poll_votes の migration', () => {
  it('既存の行は変えず、空の remote_post_poll_votes を足す', () => {
    const migrationsDir = new URL('../../../../drizzle-d1/', import.meta.url);
    const files = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
    const migrationFile = files.find((name) => name.includes('remote_post_poll_votes'));
    if (migrationFile === undefined) throw new Error('remote_post_poll_votes の migration が見つからない');
    const sqlite = new DatabaseSync(':memory:');
    for (const file of files.filter((name) => name < migrationFile)) {
      sqlite.exec(readFileSync(new URL(file, migrationsDir), 'utf8'));
    }
    sqlite.exec(
      'INSERT INTO actors(actorId,type,uri,inboxUrl) VALUES (\'actor-1\',\'remote\',\'https://remote.example/users/alice\',\'https://remote.example/inbox\')',
    );
    sqlite.exec(
      'INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (\'post-1\',\'actor-1\',\'hi\',1000,\'remote\')',
    );

    sqlite.exec(readFileSync(new URL(migrationFile, migrationsDir), 'utf8'));

    expect(sqlite.prepare('SELECT postId, content FROM posts').all()).toEqual([{ postId: 'post-1', content: 'hi' }]);
    expect(sqlite.prepare('SELECT count(*) AS n FROM remote_post_poll_votes').get()).toEqual({ n: 0 });
    sqlite.close();
  });

  it('(postId, actorId, choice) の同じ組を 2 回は入れられない', () => {
    const t = setup();
    const created = createRemote(t.alice.actorId, poll());
    t.sqlite.exec('PRAGMA foreign_keys=OFF');
    const insert = () =>
      t.sqlite.prepare('INSERT INTO remote_post_poll_votes(postId,actorId,choice,createdAt) VALUES (?,?,?,?)').run(
        created.aggregateState.postId,
        t.me.actorId,
        1,
        1_000,
      );

    insert();

    expect(insert).toThrow();
  });
});

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

  it('投票をドメインイベントとして domain_events に残す', async () => {
    const t = setup();
    const created = createRemote(t.alice.actorId, poll());
    await createD1PostCreatedStore(t.db).store(created);
    const { postId } = created.aggregateState;
    const event = vote(postId, t.me.actorId, [1], poll());

    await createD1RemotePostPollVotedStore(t.db).store(event);

    expect(
      t.sqlite.prepare('SELECT aggregateId, aggregateName, eventName FROM domain_events WHERE eventId = ?').get(
        event.eventId,
      ),
    ).toEqual({
      aggregateId: JSON.stringify({ postId, actorId: t.me.actorId }),
      aggregateName: 'remotePostPollVote',
      eventName: 'remotePostPollVote.voted',
    });
  });

  it('同じ利用者が同じ選択肢に 2 回保存しようとすると失敗し、票数も増やさない', async () => {
    const t = setup();
    const created = createRemote(t.alice.actorId, poll());
    await createD1PostCreatedStore(t.db).store(created);
    const { postId } = created.aggregateState;
    await createD1RemotePostPollVotedStore(t.db).store(vote(postId, t.me.actorId, [1], poll()));

    await expect(createD1RemotePostPollVotedStore(t.db).store(vote(postId, t.me.actorId, [1], poll()))).rejects
      .toThrow();

    expect((await resolvePoll(t, postId))?.votersCount).toBe(9);
    expect(voteRows(t, postId)).toHaveLength(1);
  });

  it('複数の投稿の自分の投票を 1 回の問い合わせで読み、他の利用者の投票は読まない', async () => {
    const t = setup();
    const first = createRemote(t.alice.actorId, poll());
    const second = createRemote(t.alice.actorId, poll());
    const none = createRemote(t.alice.actorId, poll());
    for (const event of [first, second, none]) await createD1PostCreatedStore(t.db).store(event);
    await createD1RemotePostPollVotedStore(t.db).store(
      vote(first.aggregateState.postId, t.me.actorId, [1], poll()),
      vote(second.aggregateState.postId, t.me.actorId, [0, 2], poll()),
      vote(none.aggregateState.postId, t.other.actorId, [0], poll()),
    );
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

  it('投稿の ID が空なら問い合わせない', async () => {
    const t = setup();
    const before = t.queries.length;

    const resolved = await createD1RemotePostPollVotesResolverByPostIds(t.db).resolve({
      actorId: ActorId.orThrow(t.me.actorId),
      postIds: [],
    });

    expect(resolved.ok && resolved.val.size).toBe(0);
    expect(t.queries.length).toBe(before);
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
