import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { Post } from '../../../domain/post/post.ts';
import type { Visibility } from '../../../domain/post/visibility.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1PostCreatedStore } from '../post/postCreatedStore.ts';
import { createD1PostDeletedStore } from '../post/postDeletedStore.ts';
import { createD1PostUpdatedStore } from '../post/postUpdatedStore.ts';
import { createD1RemotePostsPrunedStore } from '../post/remotePostsPrunedStore.ts';
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

const participantRows = (t: ReturnType<typeof setup>, postId: string) =>
  (t.sqlite.prepare('SELECT actorUri FROM direct_post_participants WHERE postId = ? ORDER BY actorUri').all(postId) as {
    actorUri: string;
  }[]).map((row) => row.actorUri);

const rowCount = (t: ReturnType<typeof setup>) =>
  t.sqlite.prepare('SELECT count(*) AS n FROM direct_post_participants').get();

const kosuiUri = `${SEED_ORIGIN}/users/kosui`;
const hanakoUri = `${SEED_ORIGIN}/users/hanako`;
const aliceUri = 'https://remote.example/users/alice';
const bobUri = 'https://other.example/users/bob';

const createLocal = (
  me: { actorId: string; userId: string },
  visibility: Visibility,
  participantActorUris: ReadonlyArray<string>,
) =>
  Post.createPost(Instant.now())({
    actorId: ActorId.orThrow(me.actorId),
    userId: UserId.orThrow(me.userId),
    content: 'hi',
    visibility,
    participantActorUris,
  });

const createRemote = (actorId: string, authorUri: string, visibility: Visibility | null) =>
  Post.createRemotePost(Instant.now())({
    actorId: ActorId.orThrow(actorId),
    content: 'hi',
    uri: `https://remote.example/notes/${crypto.randomUUID()}`,
    visibility,
    authorActorUri: authorUri,
    mentionedActorUris: [bobUri, aliceUri],
    recipientActorUris: [kosuiUri, hanakoUri],
  });

describe('direct_post_participants の保存', () => {
  it('ローカルの direct の投稿は、渡した参加者を保存する', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const event = createLocal(me, 'direct', [kosuiUri, aliceUri, aliceUri]);

    await createD1PostCreatedStore(t.db).store(event);

    expect(participantRows(t, event.aggregateState.postId)).toEqual([aliceUri, kosuiUri].sort());
  });

  it('ローカルの public、unlisted、private の投稿には保存しない', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');

    for (const visibility of ['public', 'unlisted', 'private'] as const) {
      await createD1PostCreatedStore(t.db).store(createLocal(me, visibility, [kosuiUri, aliceUri]));
    }

    expect(rowCount(t)).toEqual({ n: 0 });
  });

  it('リモートの direct の投稿は、作者、Mention タグ、自サーバーの宛先を重複なく保存する', async () => {
    const t = setup();
    const alice = t.seed.addRemoteActor('alice');
    const event = createRemote(alice.actorId, aliceUri, 'direct');

    await createD1PostCreatedStore(t.db).store(event);

    expect(participantRows(t, event.aggregateState.postId)).toEqual([aliceUri, bobUri, hanakoUri, kosuiUri].sort());
  });

  it('参加者が束縛数の上限を超える数あっても投稿ごと保存する', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const uris = Array.from({ length: 95 }, (_, n) => `https://remote.example/users/user${n}`);
    const event = createLocal(me, 'direct', uris);

    await createD1PostCreatedStore(t.db).store(event);

    expect(participantRows(t, event.aggregateState.postId)).toHaveLength(95);
  });
});

describe('direct_post_participants の編集', () => {
  it('ローカルの direct の投稿を編集すると、新しい参加者を足し、既存の参加者は残す', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const created = createLocal(me, 'direct', [kosuiUri, aliceUri]);
    await createD1PostCreatedStore(t.db).store(created);

    await createD1PostUpdatedStore(t.db).store(
      Post.updatePost(Instant.now())(created.aggregateState, {
        content: '<p>edited</p>',
        summary: null,
        sensitive: false,
        sourceText: 'edited',
        participantActorUris: [kosuiUri, bobUri],
      }),
    );

    expect(participantRows(t, created.aggregateState.postId)).toEqual([aliceUri, bobUri, kosuiUri].sort());
  });
});

describe('direct_post_participants の削除', () => {
  it('リモートの投稿を削除すると参加者も消し、ほかの投稿の参加者は残す', async () => {
    const t = setup();
    const alice = t.seed.addRemoteActor('alice');
    const target = createRemote(alice.actorId, aliceUri, 'direct');
    const other = createRemote(alice.actorId, aliceUri, 'direct');
    await createD1PostCreatedStore(t.db).store(target);
    await createD1PostCreatedStore(t.db).store(other);

    await createD1PostDeletedStore(t.db).store(Post.deletePost(Instant.now())(target.aggregateState.postId));

    expect(participantRows(t, target.aggregateState.postId)).toEqual([]);
    expect(participantRows(t, other.aggregateState.postId)).toHaveLength(4);
  });

  it('古いリモートの投稿を prune すると参加者も消す', async () => {
    const t = setup();
    const alice = t.seed.addRemoteActor('alice');
    const event = createRemote(alice.actorId, aliceUri, 'direct');
    await createD1PostCreatedStore(t.db).store(event);

    const result = await createD1RemotePostsPrunedStore(t.db).store([event.aggregateState.postId]);

    expect(result.ok).toBe(true);
    expect(rowCount(t)).toEqual({ n: 0 });
  });
});
