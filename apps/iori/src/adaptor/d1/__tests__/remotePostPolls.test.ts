import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { Post, type RemotePost } from '../../../domain/post/post.ts';
import type { RemotePostPoll } from '../../../domain/post/remotePostPoll.ts';
import { createD1PostCreatedStore } from '../post/postCreatedStore.ts';
import { createD1PostDeletedStore } from '../post/postDeletedStore.ts';
import { createD1RemotePostPollsResolverByPostIds } from '../post/remotePostPollsResolverByPostIds.ts';
import { createD1RemotePostsPrunedStore } from '../post/remotePostsPrunedStore.ts';
import { createD1RemotePostUpdatedStore } from '../post/remotePostUpdatedStore.ts';
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
  return { ...fixture, seed, alice };
};

const poll = (overrides: Partial<RemotePostPoll> = {}): RemotePostPoll => ({
  multiple: false,
  options: [{ title: '赤', votesCount: 3 }, { title: '青', votesCount: 5 }],
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

const pollRows = (t: ReturnType<typeof setup>, postId: string) =>
  t.sqlite.prepare('SELECT * FROM remote_post_polls WHERE postId = ?').all(postId);

const edit = (post: RemotePost, editedAt: number, pollValue?: RemotePostPoll) =>
  Post.updateRemotePost(Instant.now())(post, {
    content: '<p>q2</p>',
    summary: null,
    sensitive: false,
    editedAt: Instant.orThrow(editedAt),
    visibility: null,
    recipientActorUris: [],
    previousRecipientActorUris: [],
    images: [],
    poll: pollValue,
  });

describe('remote_post_polls の migration', () => {
  it('既存の投稿の行は変えず、空の remote_post_polls を足す', () => {
    const migrationsDir = new URL('../../../../drizzle-d1/', import.meta.url);
    const files = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
    const migrationFile = files.find((name) => name.includes('remote_post_polls'));
    if (migrationFile === undefined) throw new Error('remote_post_polls の migration が見つからない');
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
    sqlite.exec(
      'INSERT INTO remote_posts(postId,uri,inReplyToUri,visibility) VALUES (\'post-1\',\'https://remote.example/notes/1\',NULL,NULL)',
    );

    sqlite.exec(readFileSync(new URL(migrationFile, migrationsDir), 'utf8'));

    expect(sqlite.prepare('SELECT postId, content FROM posts').all()).toEqual([{ postId: 'post-1', content: 'hi' }]);
    expect(sqlite.prepare('SELECT postId, uri FROM remote_posts').all()).toEqual([
      { postId: 'post-1', uri: 'https://remote.example/notes/1' },
    ]);
    expect(sqlite.prepare('SELECT count(*) AS n FROM remote_post_polls').get()).toEqual({ n: 0 });
    sqlite.close();
  });
});

describe('remote_post_polls の保存と読み出し', () => {
  it('Question の投稿を保存すると、投票を同じ値で読み出せる', async () => {
    const t = setup();
    const event = createRemote(t.alice.actorId, poll({ multiple: true, votersCount: null, closed: true }));

    await createD1PostCreatedStore(t.db).store(event);

    const resolved = await createD1RemotePostPollsResolverByPostIds(t.db).resolve([event.aggregateState.postId]);
    expect(resolved.ok && resolved.val.get(event.aggregateState.postId)).toEqual(
      poll({ multiple: true, votersCount: null, closed: true }),
    );
  });

  it('締め切りが無い投票は expiresAt を null で読み出す', async () => {
    const t = setup();
    const event = createRemote(t.alice.actorId, poll({ expiresAt: null }));

    await createD1PostCreatedStore(t.db).store(event);

    const resolved = await createD1RemotePostPollsResolverByPostIds(t.db).resolve([event.aggregateState.postId]);
    expect(resolved.ok && resolved.val.get(event.aggregateState.postId)?.expiresAt).toBeNull();
  });

  it('投票の無い投稿には行を作らない', async () => {
    const t = setup();
    const event = createRemote(t.alice.actorId);

    await createD1PostCreatedStore(t.db).store(event);

    expect(pollRows(t, event.aggregateState.postId)).toEqual([]);
  });

  it('複数の投稿の投票を 1 回の問い合わせで読む', async () => {
    const t = setup();
    const first = createRemote(t.alice.actorId, poll());
    const second = createRemote(t.alice.actorId, poll({ closed: true }));
    const none = createRemote(t.alice.actorId);
    for (const event of [first, second, none]) await createD1PostCreatedStore(t.db).store(event);
    const before = t.queries.length;

    const resolved = await createD1RemotePostPollsResolverByPostIds(t.db).resolve([
      first.aggregateState.postId,
      second.aggregateState.postId,
      none.aggregateState.postId,
    ]);

    expect(t.queries.length - before).toBe(1);
    expect(resolved.ok && [...resolved.val.keys()].sort()).toEqual(
      [first.aggregateState.postId, second.aggregateState.postId].sort(),
    );
  });

  it('投稿の ID が空なら問い合わせない', async () => {
    const t = setup();
    const before = t.queries.length;

    const resolved = await createD1RemotePostPollsResolverByPostIds(t.db).resolve([]);

    expect(resolved.ok && resolved.val.size).toBe(0);
    expect(t.queries.length).toBe(before);
  });
});

describe('Update での投票の上書き', () => {
  it('票数、投票者数、締め切り、closed を上書きする', async () => {
    const t = setup();
    const created = createRemote(t.alice.actorId, poll());
    await createD1PostCreatedStore(t.db).store(created);
    const next = poll({
      options: [{ title: '赤', votesCount: 10 }, { title: '青', votesCount: 6 }],
      votersCount: 16,
      expiresAt: Instant.orThrow(1_000),
      closed: true,
    });

    const result = await createD1RemotePostUpdatedStore(t.db).store(edit(created.aggregateState, 5_000, next));

    expect(result).toMatchObject({ ok: true, val: { written: true } });
    const resolved = await createD1RemotePostPollsResolverByPostIds(t.db).resolve([created.aggregateState.postId]);
    expect(resolved.ok && resolved.val.get(created.aggregateState.postId)).toEqual(next);
    expect(pollRows(t, created.aggregateState.postId)).toHaveLength(1);
  });

  it('投票が無かった投稿に、Update で投票を足せる', async () => {
    const t = setup();
    const created = createRemote(t.alice.actorId);
    await createD1PostCreatedStore(t.db).store(created);

    await createD1RemotePostUpdatedStore(t.db).store(edit(created.aggregateState, 5_000, poll()));

    expect(pollRows(t, created.aggregateState.postId)).toHaveLength(1);
  });

  it('Update に投票が無ければ、保存済みの投票を変えない', async () => {
    const t = setup();
    const created = createRemote(t.alice.actorId, poll());
    await createD1PostCreatedStore(t.db).store(created);

    await createD1RemotePostUpdatedStore(t.db).store(edit(created.aggregateState, 5_000));

    const resolved = await createD1RemotePostPollsResolverByPostIds(t.db).resolve([created.aggregateState.postId]);
    expect(resolved.ok && resolved.val.get(created.aggregateState.postId)).toEqual(poll());
  });

  it('保存済みより古い編集は、投票を上書きしない', async () => {
    const t = setup();
    const created = createRemote(t.alice.actorId, poll());
    await createD1PostCreatedStore(t.db).store(created);
    await createD1RemotePostUpdatedStore(t.db).store(edit(created.aggregateState, 5_000, poll({ closed: true })));

    const result = await createD1RemotePostUpdatedStore(t.db).store(
      edit(created.aggregateState, 3_000, poll({ options: [{ title: '赤', votesCount: 99 }] })),
    );

    expect(result).toMatchObject({ ok: true, val: { written: false } });
    const resolved = await createD1RemotePostPollsResolverByPostIds(t.db).resolve([created.aggregateState.postId]);
    expect(resolved.ok && resolved.val.get(created.aggregateState.postId)).toEqual(poll({ closed: true }));
  });
});

describe('投票を持つ投稿の削除', () => {
  it('投稿を削除すると、投票の行も消す', async () => {
    const t = setup();
    const created = createRemote(t.alice.actorId, poll());
    await createD1PostCreatedStore(t.db).store(created);

    await createD1PostDeletedStore(t.db).store(Post.deletePost(Instant.now())(created.aggregateState.postId));

    expect(pollRows(t, created.aggregateState.postId)).toEqual([]);
    expect(t.sqlite.prepare('SELECT count(*) AS n FROM posts').get()).toEqual({ n: 0 });
  });

  it('古いリモート投稿を片付けると、投票の行も消す', async () => {
    const t = setup();
    const created = createRemote(t.alice.actorId, poll());
    await createD1PostCreatedStore(t.db).store(created);

    await createD1RemotePostsPrunedStore(t.db).store([created.aggregateState.postId]);

    expect(pollRows(t, created.aggregateState.postId)).toEqual([]);
    expect(t.sqlite.prepare('SELECT count(*) AS n FROM posts').get()).toEqual({ n: 0 });
  });
});
