import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { Post } from '../../../domain/post/post.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1PostCreatedStore } from '../post/postCreatedStore.ts';
import { createD1PostDeletedStore } from '../post/postDeletedStore.ts';
import { createD1PostQuotesResolverByPostIds } from '../post/postQuotesResolverByPostIds.ts';
import { createMastodonSeed } from './mastodonSeed.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  return { ...fixture, seed: createMastodonSeed(fixture) };
};

const quoteRows = (t: ReturnType<typeof setup>) =>
  t.sqlite.prepare('SELECT postId, quoteUri FROM post_quotes').all() as { postId: string; quoteUri: string }[];

describe('post_quotes の保存', () => {
  const createRemote = (actorId: string, quoteUri?: string | null) =>
    Post.createRemotePost(Instant.now())({
      actorId: ActorId.orThrow(actorId),
      content: 'hi',
      uri: 'https://remote.example/notes/new',
      visibility: 'public',
      quoteUri,
    });

  it('remote_posts と同じバッチで引用先の URI を保存する', async () => {
    const t = setup();
    const alice = t.seed.addRemoteActor('alice');
    const event = createRemote(alice.actorId, 'https://remote.example/notes/quoted');

    await createD1PostCreatedStore(t.db).store(event);

    expect(quoteRows(t)).toEqual([
      { postId: event.aggregateState.postId, quoteUri: 'https://remote.example/notes/quoted' },
    ]);
  });

  it('引用先がなければ行を足さず、ローカルの投稿にも足さない', async () => {
    const t = setup();
    const alice = t.seed.addRemoteActor('alice');
    const me = t.seed.addLocalActor('kosui');
    const remote = createRemote(alice.actorId, null);
    const local = Post.createPost(Instant.now())({
      actorId: ActorId.orThrow(me.actorId),
      userId: UserId.orThrow(me.userId),
      content: 'mine',
    });

    await createD1PostCreatedStore(t.db).store(remote);
    await createD1PostCreatedStore(t.db).store(local);

    expect(quoteRows(t)).toEqual([]);
  });

  it('ローカルの投稿でも作成イベントの quoteUri を保存する', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const event = Post.createPost(Instant.now())({
      actorId: ActorId.orThrow(me.actorId),
      userId: UserId.orThrow(me.userId),
      content: 'mine',
      quoteUri: 'https://remote.example/notes/quoted',
    });

    await createD1PostCreatedStore(t.db).store(event);

    expect(event.eventPayload.quoteUri).toBe('https://remote.example/notes/quoted');
    expect(event.aggregateState).not.toHaveProperty('quoteUri');
    expect(quoteRows(t)).toEqual([
      { postId: event.aggregateState.postId, quoteUri: 'https://remote.example/notes/quoted' },
    ]);
  });

  it('投稿を削除すると引用先の URI も消す', async () => {
    const t = setup();
    const alice = t.seed.addRemoteActor('alice');
    const event = createRemote(alice.actorId, 'https://remote.example/notes/quoted');
    await createD1PostCreatedStore(t.db).store(event);

    await createD1PostDeletedStore(t.db).store(Post.deletePost(Instant.now())(event.aggregateState.postId));

    expect(quoteRows(t)).toEqual([]);
  });

  it('投稿のイベントの payload に引用先の URI を残す', () => {
    const event = createRemote(ActorId.generate(), 'https://remote.example/notes/quoted');

    expect(event.eventPayload.quoteUri).toBe('https://remote.example/notes/quoted');
    expect(createRemote(ActorId.generate()).eventPayload.quoteUri).toBeNull();
  });
});

describe('createD1PostQuotesResolverByPostIds', () => {
  const addQuote = (t: ReturnType<typeof setup>, postId: string, quoteUri: string) =>
    t.sqlite.prepare('INSERT INTO post_quotes(postId,quoteUri) VALUES (?,?)').run(postId, quoteUri);

  it('引用先がリモートの投稿なら、その作者の actor URI・inbox・username も返す', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const quoted = t.seed.addRemotePost(alice, 1_000, { visibility: 'public' });
    const post = t.seed.addLocalPost(me, 2_000);
    addQuote(t, post.postId, quoted.uri);

    const result = await createD1PostQuotesResolverByPostIds(t.db).resolve([PostId.orThrow(post.postId)]);

    expect(result.ok && result.val.get(PostId.orThrow(post.postId))).toEqual({
      uri: quoted.uri,
      author: {
        id: 'https://remote.example/users/alice',
        inboxUrl: 'https://remote.example/users/alice/inbox',
        username: 'alice',
      },
    });
  });

  it('引用先が未取得やローカルの投稿なら author を null にし、引用の無い投稿は含めない', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const own = t.seed.addLocalPost(me, 1_000);
    const unknown = t.seed.addLocalPost(me, 2_000);
    const plain = t.seed.addLocalPost(me, 3_000);
    addQuote(t, unknown.postId, 'https://other.example/notes/unknown');
    addQuote(t, plain.postId, own.uri);
    const none = t.seed.addLocalPost(me, 4_000);

    const result = await createD1PostQuotesResolverByPostIds(t.db).resolve(
      [unknown.postId, plain.postId, none.postId].map((id) => PostId.orThrow(id)),
    );

    expect(result.ok && [...result.val]).toEqual([
      [unknown.postId, { uri: 'https://other.example/notes/unknown', author: null }],
      [plain.postId, { uri: own.uri, author: null }],
    ]);
  });

  it('投稿 ID が空なら空の Map を返す', async () => {
    const t = setup();

    const result = await createD1PostQuotesResolverByPostIds(t.db).resolve([]);

    expect(result.ok && result.val.size).toBe(0);
  });
});
