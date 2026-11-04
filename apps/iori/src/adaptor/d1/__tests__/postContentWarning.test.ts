import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { Post } from '../../../domain/post/post.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1PostCreatedStore } from '../post/postCreatedStore.ts';
import { createD1PostResolver } from '../post/postResolver.ts';
import { createD1PostResolverByUri } from '../post/postResolverByUri.ts';
import { createD1PostsResolverByActorId } from '../post/postsResolverByActorId.ts';
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

describe('投稿の content warning の保存と読み出し', () => {
  it('リモートの投稿の summary と sensitive を保存し、3つのリゾルバーで読み出せる', async () => {
    const t = setup();
    const alice = t.seed.addRemoteActor('alice');
    const event = Post.createRemotePost(Instant.now())({
      actorId: ActorId.orThrow(alice.actorId),
      content: 'hi',
      uri: 'https://remote.example/notes/cw',
      visibility: 'public',
      summary: 'ネタバレ注意',
      sensitive: true,
    });
    const { postId } = event.aggregateState;

    await createD1PostCreatedStore(t.db).store(event);

    expect(t.sqlite.prepare('SELECT summary, sensitive FROM posts WHERE postId = ?').get(postId)).toEqual({
      summary: 'ネタバレ注意',
      sensitive: 1,
    });
    const byId = await createD1PostResolver(t.db).resolve(postId);
    const byUri = await createD1PostResolverByUri(t.db).resolve({ uri: 'https://remote.example/notes/cw' });
    const byActor = await createD1PostsResolverByActorId(t.db).resolve(ActorId.orThrow(alice.actorId));
    expect(byId.ok && byId.val).toMatchObject({ summary: 'ネタバレ注意', sensitive: true });
    expect(byUri.ok && byUri.val).toMatchObject({ summary: 'ネタバレ注意', sensitive: true });
    expect(byActor.ok && byActor.val).toEqual([
      expect.objectContaining({ postId, summary: 'ネタバレ注意', sensitive: true }),
    ]);
  });

  it('省略した投稿は summary が null、sensitive が false で往復する', async () => {
    const t = setup();
    const alice = t.seed.addRemoteActor('alice');
    const me = t.seed.addLocalActor('kosui');
    const remote = Post.createRemotePost(Instant.now())({
      actorId: ActorId.orThrow(alice.actorId),
      content: 'hi',
      uri: 'https://remote.example/notes/plain',
      visibility: 'public',
    });
    const local = Post.createPost(Instant.now())({
      actorId: ActorId.orThrow(me.actorId),
      userId: UserId.orThrow(me.userId),
      content: 'mine',
    });

    await createD1PostCreatedStore(t.db).store(remote);
    await createD1PostCreatedStore(t.db).store(local);

    const resolver = createD1PostResolver(t.db);
    const remoteResult = await resolver.resolve(remote.aggregateState.postId);
    const localResult = await resolver.resolve(PostId.orThrow(local.aggregateState.postId));
    expect(remoteResult.ok && remoteResult.val).toMatchObject({ summary: null, sensitive: false });
    expect(localResult.ok && localResult.val).toMatchObject({ summary: null, sensitive: false });
  });
});
