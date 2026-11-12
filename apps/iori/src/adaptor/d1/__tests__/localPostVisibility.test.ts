import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { PageRequest } from '../../../domain/page/page.ts';
import { Post } from '../../../domain/post/post.ts';
import { PostId } from '../../../domain/post/postId.ts';
import type { Visibility } from '../../../domain/post/visibility.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { createD1LocalPostResolverByUri } from '../post/localPostResolverByUri.ts';
import { createD1LocalPostsResolverByPage } from '../post/localPostsResolverByPage.ts';
import { createD1PostCreatedStore } from '../post/postCreatedStore.ts';
import { createD1PostResolver } from '../post/postResolver.ts';
import { createD1PostsResolverByActorId } from '../post/postsResolverByActorId.ts';
import { createD1PostsWithAuthorResolverByPostIds } from '../post/postWithAuthorBatch.ts';
import { createD1TimelineItemsResolverByActorIds } from '../timeline/timelineItemsResolverByActorIds.ts';
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

const page = (): PageRequest => ({
  limit: 20,
  olderThanId: undefined,
  newerThanId: undefined,
  order: 'newestFirst',
});

const visibilities: ReadonlyArray<Visibility> = ['public', 'unlisted', 'private'];

describe('local_posts.visibility の migration', () => {
  const migrationsDir = new URL('../../../../drizzle-d1/', import.meta.url);
  const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
  const migrationFile = migrationFiles.find((name) => name.includes('local_post_visibility'));

  it('既存のローカルの投稿は public になる', () => {
    if (migrationFile === undefined) throw new Error('local_post_visibility の migration が見つからない');
    const sqlite = new DatabaseSync(':memory:');
    for (const file of migrationFiles.filter((name) => name < migrationFile)) {
      sqlite.exec(readFileSync(new URL(file, migrationsDir), 'utf8'));
    }
    sqlite.exec('INSERT INTO users(userId,username) VALUES (\'user-1\',\'kosui\')');
    sqlite.exec(
      'INSERT INTO actors(actorId,type,uri,inboxUrl) VALUES (\'actor-1\',\'local\',\'https://iori.test/users/kosui\',\'https://iori.test/inbox\')',
    );
    sqlite.exec(
      'INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (\'post-1\',\'actor-1\',\'hi\',1000,\'local\')',
    );
    sqlite.exec('INSERT INTO local_posts(postId,userId,inReplyToUri) VALUES (\'post-1\',\'user-1\',NULL)');

    sqlite.exec(readFileSync(new URL(migrationFile, migrationsDir), 'utf8'));

    expect(sqlite.prepare('SELECT visibility FROM local_posts WHERE postId = ?').get('post-1')).toEqual({
      visibility: 'public',
    });
    sqlite.close();
  });
});

describe('ローカルの投稿の visibility の保存と読み戻し', () => {
  const createLocal = (me: { actorId: string; userId: string }, visibility?: Visibility) =>
    Post.createPost(Instant.now())({
      actorId: ActorId.orThrow(me.actorId),
      userId: UserId.orThrow(me.userId),
      content: 'mine',
      ...(visibility === undefined ? {} : { visibility }),
    });

  it.each(visibilities)('%s で保存した投稿を postResolver が同じ値で返す', async (visibility) => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const event = createLocal(me, visibility);

    await createD1PostCreatedStore(t.db).store(event);

    const resolved = await createD1PostResolver(t.db).resolve(event.aggregateState.postId);
    expect(resolved.ok && resolved.val?.type === 'local' && resolved.val.visibility).toBe(visibility);
    expect(t.sqlite.prepare('SELECT visibility FROM local_posts WHERE postId = ?').get(event.aggregateState.postId))
      .toEqual({ visibility });
  });

  it('visibility を省略した投稿は public で保存する', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const event = createLocal(me);

    await createD1PostCreatedStore(t.db).store(event);

    expect(t.sqlite.prepare('SELECT visibility FROM local_posts WHERE postId = ?').get(event.aggregateState.postId))
      .toEqual({ visibility: 'public' });
  });

  it('localPostResolverByUri、postsResolverByActorId、postWithAuthor、タイムラインの行も visibility を返す', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const post = t.seed.addLocalPost(me, 1_000, { visibility: 'unlisted' });

    const byUri = await createD1LocalPostResolverByUri(t.db, SEED_ORIGIN).resolve({ uri: post.uri });
    const byActor = await createD1PostsResolverByActorId(t.db).resolve(ActorId.orThrow(me.actorId));
    const withAuthor = await createD1PostsWithAuthorResolverByPostIds(t.db).resolve({
      postIds: [PostId.orThrow(post.postId)],
      currentActorId: ActorId.orThrow(me.actorId),
    });
    const timeline = await createD1TimelineItemsResolverByActorIds(t.db).resolve({
      actorIds: [ActorId.orThrow(me.actorId)],
      currentActorId: ActorId.orThrow(me.actorId),
      createdAt: undefined,
      mutedActorIds: [],
    });

    expect(byUri.ok && byUri.val?.visibility).toBe('unlisted');
    expect(byActor.ok && byActor.val.map((p) => p.type === 'local' && p.visibility)).toEqual(['unlisted']);
    expect(withAuthor.ok && withAuthor.val.get(PostId.orThrow(post.postId))).toMatchObject({ visibility: 'unlisted' });
    expect(timeline.ok && timeline.val.map((item) => item.type === 'post' && item.post.visibility)).toEqual([
      'unlisted',
    ]);
  });
});

describe('createD1PostsResolverByActorId', () => {
  it('private の投稿を除き、除いた分で件数の上限を使わない', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const publicPost = t.seed.addLocalPost(me, 1_000, { visibility: 'public' });
    const unlistedPost = t.seed.addLocalPost(me, 2_000, { visibility: 'unlisted' });
    for (let index = 0; index < 10; index++) t.seed.addLocalPost(me, 3_000 + index, { visibility: 'private' });

    const result = await createD1PostsResolverByActorId(t.db).resolve(ActorId.orThrow(me.actorId));

    expect(result.ok && result.val.map((post) => post.postId)).toEqual([unlistedPost.postId, publicPost.postId]);
  });
});

describe('createD1LocalPostsResolverByPage', () => {
  it('public のローカルの投稿だけを返し、unlisted と private を除く', async () => {
    const t = setup();
    const me = t.seed.addLocalActor('kosui');
    const publicPost = t.seed.addLocalPost(me, 1_000, { visibility: 'public' });
    t.seed.addLocalPost(me, 2_000, { visibility: 'unlisted' });
    t.seed.addLocalPost(me, 3_000, { visibility: 'private' });

    const result = await createD1LocalPostsResolverByPage(t.db).resolve({
      currentActorId: ActorId.orThrow(me.actorId),
      mutedActorIds: [],
      page: page(),
    });

    expect(result.ok && result.val.map((post) => post.postId)).toEqual([publicPost.postId]);
  });
});

describe('onlyVisibleToViewer でのローカルの投稿の絞り込み', () => {
  const resolveFor = async (
    t: ReturnType<typeof setup>,
    postIds: ReadonlyArray<string>,
    viewerActorId: string,
  ) => {
    const result = await createD1PostsWithAuthorResolverByPostIds(t.db).resolve({
      postIds: postIds.map((id) => PostId.orThrow(id)),
      currentActorId: ActorId.orThrow(viewerActorId),
      onlyVisibleToViewer: true,
    });
    if (!result.ok) throw new Error('unexpected');
    return [...result.val.keys()].sort();
  };

  const seedPosts = () => {
    const t = setup();
    const author = t.seed.addLocalActor('kosui');
    const follower = t.seed.addRemoteActor('follower');
    const stranger = t.seed.addRemoteActor('stranger');
    t.seed.addFollow(follower.actorId, author.actorId);
    const publicPost = t.seed.addLocalPost(author, 1_000, { visibility: 'public' });
    const unlistedPost = t.seed.addLocalPost(author, 2_000, { visibility: 'unlisted' });
    const privatePost = t.seed.addLocalPost(author, 3_000, { visibility: 'private' });
    const all = [publicPost.postId, unlistedPost.postId, privatePost.postId];
    return { t, author, follower, stranger, publicPost, unlistedPost, privatePost, all };
  };

  it('作者本人には private の投稿も見える', async () => {
    const { t, author, all } = seedPosts();

    expect(await resolveFor(t, all, author.actorId)).toEqual([...all].sort());
  });

  it('作者のフォロワーには private の投稿も見える', async () => {
    const { t, follower, all } = seedPosts();

    expect(await resolveFor(t, all, follower.actorId)).toEqual([...all].sort());
  });

  it('作者をフォローしていない人には public と unlisted だけが見え、private は見えない', async () => {
    const { t, stranger, publicPost, unlistedPost, privatePost } = seedPosts();

    const visible = await resolveFor(t, [publicPost.postId, unlistedPost.postId, privatePost.postId], stranger.actorId);

    expect(visible).toEqual([publicPost.postId, unlistedPost.postId].sort());
  });

  it('作者が相手をフォローしているだけでは private の投稿は見えない', async () => {
    const { t, author, stranger, privatePost } = seedPosts();
    t.seed.addFollow(author.actorId, stranger.actorId);

    expect(await resolveFor(t, [privatePost.postId], stranger.actorId)).toEqual([]);
  });

  it('タイムラインでも、フォローしていない人には private の投稿の項目を出さない', async () => {
    const { t, author, stranger, publicPost, unlistedPost } = seedPosts();

    const result = await createD1TimelineItemsResolverByActorIds(t.db).resolve({
      actorIds: [ActorId.orThrow(author.actorId)],
      currentActorId: ActorId.orThrow(stranger.actorId),
      createdAt: undefined,
      mutedActorIds: [],
      onlyVisibleToViewer: true,
    });

    const postIds = result.ok ? result.val.flatMap((item) => item.type === 'post' ? [item.post.postId] : []) : [];
    expect([...postIds].sort()).toEqual([publicPost.postId, unlistedPost.postId].sort());
  });
});
