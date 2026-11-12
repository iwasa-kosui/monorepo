import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { Post } from '../../../domain/post/post.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1PostCreatedStore } from '../post/postCreatedStore.ts';
import { createD1PostDeletedStore } from '../post/postDeletedStore.ts';
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
