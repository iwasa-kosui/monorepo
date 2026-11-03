import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { Post } from '../../../domain/post/post.ts';
import { PostId } from '../../../domain/post/postId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1PostCreatedStore } from '../post/postCreatedStore.ts';
import { createD1PostDeletedStore } from '../post/postDeletedStore.ts';
import { createD1PostsWithAuthorResolverByPostIds } from '../post/postWithAuthorBatch.ts';
import { createD1ThreadResolver } from '../post/threadResolver.ts';
import { createMastodonSeed, SEED_ORIGIN } from './mastodonSeed.ts';
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

const recipientRows = (t: ReturnType<typeof setup>, postId: string) =>
  (t.sqlite.prepare('SELECT actorUri FROM remote_post_recipients WHERE postId = ? ORDER BY actorUri').all(postId) as {
    actorUri: string;
  }[]).map((row) => row.actorUri);

describe('remote_post_recipients の保存', () => {
  const createRemote = (actorId: string, recipientActorUris?: ReadonlyArray<string>) =>
    Post.createRemotePost(Instant.now())({
      actorId: ActorId.orThrow(actorId),
      content: 'hi',
      uri: 'https://remote.example/notes/new',
      visibility: 'direct',
      recipientActorUris,
    });

  it('remote_posts と同じバッチで宛先を保存する', async () => {
    const t = setup();
    const alice = t.seed.addRemoteActor('alice');
    const event = createRemote(alice.actorId, [`${SEED_ORIGIN}/users/kosui`, `${SEED_ORIGIN}/users/hanako`]);

    await createD1PostCreatedStore(t.db).store(event);

    expect(recipientRows(t, event.aggregateState.postId)).toEqual([
      `${SEED_ORIGIN}/users/hanako`,
      `${SEED_ORIGIN}/users/kosui`,
    ]);
  });

  it('宛先が束縛数の上限を超える数あっても投稿ごと保存する', async () => {
    const t = setup();
    const alice = t.seed.addRemoteActor('alice');
    const uris = Array.from({ length: 95 }, (_, n) => `${SEED_ORIGIN}/users/user${n}`);
    const event = createRemote(alice.actorId, uris);

    await createD1PostCreatedStore(t.db).store(event);

    expect(recipientRows(t, event.aggregateState.postId)).toHaveLength(95);
  });

  it('宛先がなければ行を足さず、ローカルの投稿にも足さない', async () => {
    const t = setup();
    const alice = t.seed.addRemoteActor('alice');
    const me = t.seed.addLocalActor('kosui');
    const remote = createRemote(alice.actorId);
    const local = Post.createPost(Instant.now())({
      actorId: ActorId.orThrow(me.actorId),
      userId: UserId.orThrow(me.userId),
      content: 'mine',
    });

    await createD1PostCreatedStore(t.db).store(remote);
    await createD1PostCreatedStore(t.db).store(local);

    expect(t.sqlite.prepare('SELECT count(*) AS n FROM remote_post_recipients').get()).toEqual({ n: 0 });
  });

  it('投稿を削除すると宛先も消す', async () => {
    const t = setup();
    const alice = t.seed.addRemoteActor('alice');
    const event = createRemote(alice.actorId, [`${SEED_ORIGIN}/users/kosui`]);
    await createD1PostCreatedStore(t.db).store(event);

    await createD1PostDeletedStore(t.db).store(
      Post.deletePost(Instant.now())(event.aggregateState.postId),
    );

    expect(t.sqlite.prepare('SELECT count(*) AS n FROM remote_post_recipients').get()).toEqual({ n: 0 });
  });
});

describe('ログイン中の閲覧者の閲覧条件', () => {
  const seedCases = () => {
    const t = setup();
    const viewer = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const bob = t.seed.addRemoteActor('bob');
    t.seed.addFollow(viewer.actorId, alice.actorId);
    const viewerUri = `${SEED_ORIGIN}/users/kosui`;
    const cases = {
      public: t.seed.addRemotePost(bob, 1_000, { visibility: 'public' }),
      unlisted: t.seed.addRemotePost(bob, 1_100, { visibility: 'unlisted' }),
      directToViewer: t.seed.addRemotePost(bob, 1_200, { visibility: 'direct', recipientActorUris: [viewerUri] }),
      directToOther: t.seed.addRemotePost(bob, 1_300, {
        visibility: 'direct',
        recipientActorUris: [`${SEED_ORIGIN}/users/hanako`],
      }),
      privateFollowed: t.seed.addRemotePost(alice, 1_400, { visibility: 'private' }),
      privateNotFollowed: t.seed.addRemotePost(bob, 1_500, { visibility: 'private' }),
      nullFollowed: t.seed.addRemotePost(alice, 1_600, { visibility: null }),
      nullNotFollowed: t.seed.addRemotePost(bob, 1_700, { visibility: null }),
      privateToViewer: t.seed.addRemotePost(bob, 1_800, { visibility: 'private', recipientActorUris: [viewerUri] }),
      directFollowed: t.seed.addRemotePost(alice, 1_900, { visibility: 'direct' }),
      local: t.seed.addLocalPost(viewer, 2_000),
    };
    return { ...t, viewer, cases };
  };

  const visibleKeys = async (t: ReturnType<typeof seedCases>, onlyVisibleToViewer: boolean) => {
    const result = await createD1PostsWithAuthorResolverByPostIds(t.db).resolve({
      postIds: Object.values(t.cases).map((post) => PostId.orThrow(post.postId)),
      currentActorId: ActorId.orThrow(t.viewer.actorId),
      onlyVisibleToViewer,
    });
    const visible = result.ok ? new Set(result.val.keys()) : new Set();
    return Object.entries(t.cases).filter(([, post]) => visible.has(post.postId)).map(([key]) => key);
  };

  it('public、unlisted、宛先に含まれる投稿、フォロー中の private と記録のない投稿、ローカルの投稿だけ見える', async () => {
    const t = seedCases();

    expect(await visibleKeys(t, true)).toEqual([
      'public',
      'unlisted',
      'directToViewer',
      'privateFollowed',
      'nullFollowed',
      'privateToViewer',
      'local',
    ]);
  });

  it('onlyVisibleToViewer がなければ今までどおりすべて返す', async () => {
    const t = seedCases();

    expect(await visibleKeys(t, false)).toEqual(Object.keys(t.cases));
  });

  it('スレッドの祖先と子孫も同じ条件で絞り、見えない起点は null にする', async () => {
    const t = setup();
    const viewer = t.seed.addLocalActor('kosui');
    const alice = t.seed.addRemoteActor('alice');
    const root = t.seed.addRemotePost(alice, 1_000, { visibility: 'direct' });
    const mid = t.seed.addLocalPost(viewer, 2_000, { inReplyToUri: root.uri });
    const hidden = t.seed.addRemotePost(alice, 3_000, { inReplyToUri: mid.uri, visibility: 'private' });
    const shown = t.seed.addRemotePost(alice, 4_000, { inReplyToUri: mid.uri, visibility: 'public' });
    const resolver = createD1ThreadResolver(t.db, SEED_ORIGIN);
    const resolve = async (postId: string, onlyVisibleToViewer: boolean) => {
      const result = await resolver.resolve({
        postId: PostId.orThrow(postId),
        currentActorId: ActorId.orThrow(viewer.actorId),
        onlyVisibleToViewer,
      });
      if (!result.ok) throw new Error('unreachable');
      return result.val;
    };

    const restricted = await resolve(mid.postId, true);
    const unrestricted = await resolve(mid.postId, false);
    const hiddenOrigin = await resolve(hidden.postId, true);

    expect(restricted.ancestors).toEqual([]);
    expect(restricted.descendants.map((post) => post.postId)).toEqual([shown.postId]);
    expect(unrestricted.ancestors.map((post) => post.postId)).toEqual([root.postId]);
    expect(unrestricted.descendants.map((post) => post.postId)).toEqual([hidden.postId, shown.postId]);
    expect(hiddenOrigin.currentPost).toBeNull();
  });
});
