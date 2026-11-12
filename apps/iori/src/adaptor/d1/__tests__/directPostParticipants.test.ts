import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { Post } from '../../../domain/post/post.ts';
import type { Visibility } from '../../../domain/post/visibility.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1DirectPostParticipantsResolverByPostId } from '../post/directPostParticipantsResolverByPostId.ts';
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

  it('リモートの public、private と visibility が null の投稿には保存しない', async () => {
    const t = setup();
    const alice = t.seed.addRemoteActor('alice');

    for (const visibility of ['public', 'unlisted', 'private', null] as const) {
      await createD1PostCreatedStore(t.db).store(createRemote(alice.actorId, aliceUri, visibility));
    }

    expect(rowCount(t)).toEqual({ n: 0 });
  });

  it('参加者が束縛数の上限を超える数あっても投稿ごと保存する', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const uris = Array.from({ length: 95 }, (_, n) => `https://remote.example/users/user${n}`);
    const event = createLocal(me, 'direct', uris);

    await createD1PostCreatedStore(t.db).store(event);

    expect(participantRows(t, event.aggregateState.postId)).toHaveLength(95);
  });

  it('リゾルバーは投稿の参加者を返し、参加者のいない投稿には空を返す', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const direct = createLocal(me, 'direct', [kosuiUri, aliceUri]);
    const publicPost = createLocal(me, 'public', [kosuiUri]);
    await createD1PostCreatedStore(t.db).store(direct);
    await createD1PostCreatedStore(t.db).store(publicPost);
    const resolver = createD1DirectPostParticipantsResolverByPostId(t.db);

    const directResult = await resolver.resolve(direct.aggregateState.postId);
    const publicResult = await resolver.resolve(publicPost.aggregateState.postId);

    expect(directResult.ok && [...directResult.val].sort()).toEqual([aliceUri, kosuiUri].sort());
    expect(publicResult.ok && publicResult.val).toEqual([]);
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

  it('ローカルの public の投稿を編集しても参加者は保存しない', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const created = createLocal(me, 'public', []);
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

    expect(rowCount(t)).toEqual({ n: 0 });
  });
});

describe('direct_post_participants の削除', () => {
  it('ローカルの投稿を削除すると参加者も消す', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const event = createLocal(me, 'direct', [kosuiUri, aliceUri]);
    await createD1PostCreatedStore(t.db).store(event);

    await createD1PostDeletedStore(t.db).store(Post.deletePost(Instant.now())(event.aggregateState.postId));

    expect(rowCount(t)).toEqual({ n: 0 });
  });

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

describe('direct_post_participants の migration', () => {
  const migrationsDir = new URL('../../../../drizzle-d1/', import.meta.url);
  const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
  const migrationFile = migrationFiles.find((name) => name.includes('direct_post_participants'));

  const setupBeforeMigration = () => {
    if (migrationFile === undefined) throw new Error('direct_post_participants の migration が見つからない');
    const sqlite = new DatabaseSync(':memory:');
    for (const file of migrationFiles.filter((name) => name < migrationFile)) {
      sqlite.exec(readFileSync(new URL(file, migrationsDir), 'utf8'));
    }
    const actor = (id: string, uri: string, type: string) =>
      sqlite.prepare('INSERT INTO actors(actorId,type,uri,inboxUrl) VALUES (?,?,?,?)').run(
        id,
        type,
        uri,
        `${uri}/inbox`,
      );
    actor('actor-alice', aliceUri, 'remote');
    actor('actor-bob', bobUri, 'remote');
    const post = (postId: string, actorId: string, visibility: string | null) => {
      sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (?,?,?,?,?)').run(
        postId,
        actorId,
        'hi',
        1000,
        'remote',
      );
      sqlite.prepare('INSERT INTO remote_posts(postId,uri,inReplyToUri,visibility) VALUES (?,?,?,?)').run(
        postId,
        `https://remote.example/notes/${postId}`,
        null,
        visibility,
      );
    };
    post('direct-1', 'actor-alice', 'direct');
    post('direct-2', 'actor-bob', 'direct');
    post('public-1', 'actor-alice', 'public');
    post('private-1', 'actor-bob', 'private');
    post('null-1', 'actor-alice', null);
    for (const [postId, uri] of [['direct-1', kosuiUri], ['direct-1', hanakoUri], ['public-1', kosuiUri]]) {
      sqlite.prepare('INSERT INTO remote_post_recipients(postId,actorUri) VALUES (?,?)').run(postId, uri);
    }
    sqlite.exec(readFileSync(new URL(migrationFile, migrationsDir), 'utf8'));
    return sqlite;
  };

  it('既存のリモートの direct の投稿に、作者と宛先を入れる', () => {
    const sqlite = setupBeforeMigration();

    const rows = sqlite.prepare('SELECT postId, actorUri FROM direct_post_participants ORDER BY postId, actorUri')
      .all();

    expect(rows).toEqual([
      ...[aliceUri, hanakoUri, kosuiUri].sort().map((actorUri) => ({ postId: 'direct-1', actorUri })),
      { postId: 'direct-2', actorUri: bobUri },
    ]);
    sqlite.close();
  });
});
