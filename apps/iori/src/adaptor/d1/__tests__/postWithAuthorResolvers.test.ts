import { RA } from '@iwasa-kosui/result';
import { and, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createWorkerCoreApiRouter } from '../../../adaptor/routes/workerCoreApiRouter.ts';
import type { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import type { PostWithAuthor } from '../../../domain/post/post.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import { Username } from '../../../domain/user/username.ts';
import { createWorkerGetUserPostsUseCase } from '../../../runtime/workerCoreUseCases.ts';
import { resolveLocalActorWith, resolveUserByUsernameWith } from '../../../useCase/helper/resolve.ts';
import { createD1ActorResolverByUserId } from '../actor/actorResolverByUserId.ts';
import { createD1ActorsResolverByFollowerId } from '../actor/actorsResolverByFollowerId.ts';
import { createD1ActorsResolverByFollowingId } from '../actor/actorsResolverByFollowingId.ts';
import { actorIdsJson } from '../actorIdsJson.ts';
import type { IoriD1Db } from '../client.ts';
import { createD1FederatedTimelineItemsResolver } from '../federatedTimeline/federatedTimelineItemsResolver.ts';
import { resolvePostsWithAuthorByIds } from '../post/postWithAuthorBatch.ts';
import {
  createD1PostsResolverByActorIds,
  createD1PostsResolverByActorIdWithPagination,
} from '../post/postWithAuthorResolvers.ts';
import { createD1ThreadResolver } from '../post/threadResolver.ts';
import { likesTable, localPostsTable, postsTable, repostsTable } from '../schema.ts';
import { createD1UserResolverByUsername } from '../user/userResolverByUsername.ts';
import { createD1UserWithLocalActorResolverByUsername } from '../user/userWithLocalActorResolverByUsername.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const ORIGIN = 'https://iori.test';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const userId = id(1);
const localActorId = id(2) as ActorId;
const remoteActorId = id(3) as ActorId;
const viewerActorId = id(4) as ActorId;
const postIdOf = (index: number) => id(1000 + index);
const remoteReplyTargetId = id(2000);
const remoteReplyTargetUri = 'https://remote.test/notes/target';
const LOCAL_POST_COUNT = 25;
const richIndex = LOCAL_POST_COUNT;
const replyIndex = LOCAL_POST_COUNT - 1;
const parentIndex = LOCAL_POST_COUNT - 2;

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { sqlite } = fixture;
  const insertActor = (actorId: string, uri: string, type: 'local' | 'remote', logoUri: string | null) =>
    sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,logoUri,type) VALUES (?,?,?,?,?)').run(
      actorId,
      uri,
      `${uri}/inbox`,
      logoUri,
      type,
    );
  const insertPost = (postId: string, actorId: string, time: number, content: string, type: 'local' | 'remote') =>
    sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (?,?,?,?,?)').run(
      postId,
      actorId,
      content,
      time,
      type,
    );
  sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(userId, 'kosui');
  insertActor(localActorId, `${ORIGIN}/users/kosui`, 'local', 'https://iori.test/logo.png');
  sqlite.prepare('INSERT INTO local_actors(actorId,userId) VALUES (?,?)').run(localActorId, userId);
  insertActor(remoteActorId, 'https://remote.test/users/alice', 'remote', null);
  sqlite.prepare('INSERT INTO remote_actors(actorId,url,username) VALUES (?,?,?)').run(
    remoteActorId,
    'https://remote.test/@alice',
    'alice',
  );
  insertActor(viewerActorId, 'https://remote.test/users/bob', 'remote', 'https://remote.test/bob.png');
  sqlite.prepare('INSERT INTO remote_actors(actorId,url,username) VALUES (?,?,?)').run(
    viewerActorId,
    'https://remote.test/@bob',
    'bob',
  );
  sqlite.prepare('INSERT INTO follows(followerId,followingId) VALUES (?,?)').run(viewerActorId, localActorId);
  sqlite.prepare('INSERT INTO follows(followerId,followingId) VALUES (?,?)').run(localActorId, remoteActorId);

  for (let index = 1; index <= LOCAL_POST_COUNT; index++) {
    insertPost(postIdOf(index), localActorId, index * 1000, `local post ${index}`, 'local');
    sqlite.prepare('INSERT INTO local_posts(postId,userId,inReplyToUri) VALUES (?,?,?)').run(
      postIdOf(index),
      userId,
      null,
    );
  }
  const setReplyTarget = (index: number, uri: string) =>
    sqlite.prepare('UPDATE local_posts SET inReplyToUri=? WHERE postId=?').run(uri, postIdOf(index));
  setReplyTarget(richIndex, `${ORIGIN}/users/kosui/posts/${postIdOf(replyIndex)}`);
  setReplyTarget(replyIndex, remoteReplyTargetUri);
  setReplyTarget(parentIndex, `${ORIGIN}/users/kosui/posts/${postIdOf(richIndex)}`);
  insertPost(remoteReplyTargetId, remoteActorId, 500, '<b>remote target</b>', 'remote');
  sqlite.prepare('INSERT INTO remote_posts(postId,uri,inReplyToUri) VALUES (?,?,?)').run(
    remoteReplyTargetId,
    remoteReplyTargetUri,
    null,
  );
  for (let index = 1; index <= 3; index++) {
    insertPost(id(3000 + index), remoteActorId, index * 1500 + 200, `remote post ${index}`, 'remote');
    sqlite.prepare('INSERT INTO remote_posts(postId,uri,inReplyToUri) VALUES (?,?,?)').run(
      id(3000 + index),
      `https://remote.test/notes/${index}`,
      null,
    );
  }
  insertPost(id(4000), localActorId, 26_000, 'deleted post', 'local');
  sqlite.prepare('INSERT INTO local_posts(postId,userId,inReplyToUri) VALUES (?,?,?)').run(id(4000), userId, null);
  sqlite.prepare('UPDATE posts SET deletedAt=? WHERE postId=?').run(27_000, id(4000));

  const rich = postIdOf(richIndex);
  sqlite.prepare('INSERT INTO post_images(imageId,postId,url,altText,createdAt) VALUES (?,?,?,?,?)').run(
    id(5001),
    rich,
    'https://iori.test/uploads/1.png',
    'first',
    1,
  );
  sqlite.prepare('INSERT INTO post_images(imageId,postId,url,altText,createdAt) VALUES (?,?,?,?,?)').run(
    id(5002),
    rich,
    'https://iori.test/uploads/2.png',
    null,
    2,
  );
  sqlite.prepare('INSERT INTO post_images(imageId,postId,url,altText,createdAt) VALUES (?,?,?,?,?)').run(
    id(5003),
    postIdOf(3),
    'https://iori.test/uploads/3.png',
    'third',
    3,
  );
  const insertLike = (likeId: string, actorId: string, postId: string) => {
    sqlite.prepare('INSERT INTO likes(likeId,actorId,postId,type,createdAt) VALUES (?,?,?,?,?)').run(
      likeId,
      actorId,
      postId,
      'remote',
      1,
    );
    sqlite.prepare('INSERT INTO remote_likes(likeId,likeActivityUri) VALUES (?,?)').run(
      likeId,
      `https://remote.test/likes/${likeId}`,
    );
  };
  insertLike(id(5101), viewerActorId, rich);
  insertLike(id(5102), remoteActorId, rich);
  insertLike(id(5103), remoteActorId, postIdOf(3));
  const insertRepost = (repostId: string, actorId: string, postId: string) =>
    sqlite.prepare('INSERT INTO reposts(repostId,actorId,postId,createdAt) VALUES (?,?,?,?)').run(
      repostId,
      actorId,
      postId,
      1,
    );
  insertRepost(id(5201), viewerActorId, rich);
  insertRepost(id(5202), remoteActorId, rich);
  insertRepost(id(5203), remoteActorId, postIdOf(4));
  const insertReact = (reactId: string, actorId: string, postId: string, emoji: string, imageUrl: string | null) =>
    sqlite.prepare(
      'INSERT INTO emoji_reacts(emojiReactId,actorId,postId,emoji,emojiImageUrl,createdAt) VALUES (?,?,?,?,?,?)',
    ).run(reactId, actorId, postId, emoji, imageUrl, 1);
  insertReact(id(5301), viewerActorId, rich, '👍', null);
  insertReact(id(5302), remoteActorId, rich, '👍', null);
  insertReact(id(5303), remoteActorId, rich, ':blob:', 'https://remote.test/emoji/blob.png');
  insertReact(id(5304), viewerActorId, rich, '🎉', null);
  insertReact(id(5305), viewerActorId, postIdOf(3), '🎉', null);
  const insertPreview = (previewId: string, postId: string, url: string, title: string | null) =>
    sqlite.prepare(
      'INSERT INTO link_previews(linkPreviewId,postId,url,title,description,imageUrl,faviconUrl,siteName,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(previewId, postId, url, title, null, 'https://example.test/og.png', null, 'Example', 12_345);
  insertPreview(id(5401), rich, 'https://example.test/a', 'A');
  insertPreview(id(5402), rich, 'https://example.test/b', null);
  insertPreview(id(5403), postIdOf(3), 'https://example.test/c', 'C');
  insertPreview(id(5404), id(3002), 'https://example.test/d', 'D');

  sqlite.prepare('INSERT INTO relays(relayId,inboxUrl,actorUri,status,createdAt) VALUES (?,?,?,?,?)').run(
    id(6000),
    'https://relay.test/inbox',
    'https://relay.test/actor',
    'accepted',
    1,
  );
  for (const [index, postId] of [rich, postIdOf(3), id(3002), id(3003)].entries()) {
    sqlite.prepare(
      'INSERT INTO federated_timeline_items(federatedTimelineItemId,postId,relayId,receivedAt) VALUES (?,?,?,?)',
    ).run(id(6100 + index), postId, id(6000), 90_000 - index * 1000);
  }
  return fixture;
};

type Input = Readonly<{
  actorIds?: readonly ActorId[];
  currentActorId?: ActorId;
  createdAt: Instant | undefined;
}>;

// Implementation before batching: one id query, then threadResolver.resolve per post.
const legacyResolvePosts = async (db: IoriD1Db, origin: string, input: Input): Promise<PostWithAuthor[]> => {
  if (input.actorIds?.length === 0) return [];
  const liked = input.currentActorId === undefined ? sql<number>`0` : sql<number>`exists (
    select 1 from ${likesTable} where ${likesTable.postId} = ${postsTable.postId}
      and ${likesTable.actorId} = ${input.currentActorId}
  )`;
  const reposted = input.currentActorId === undefined ? sql<number>`0` : sql<number>`exists (
    select 1 from ${repostsTable} where ${repostsTable.postId} = ${postsTable.postId}
      and ${repostsTable.actorId} = ${input.currentActorId}
  )`;
  const rows = await db.select({
    postId: postsTable.postId,
    liked: liked.mapWith(value => value === 1),
    reposted: reposted.mapWith(value => value === 1),
  })
    .from(postsTable)
    .leftJoin(localPostsTable, eq(postsTable.postId, localPostsTable.postId))
    .where(and(
      isNull(postsTable.deletedAt),
      input.actorIds === undefined
        ? undefined
        : inArray(postsTable.actorId, sql`(select value from json_each(${actorIdsJson(input.actorIds)}))`),
      input.createdAt === undefined ? undefined : lt(postsTable.createdAt, new Date(input.createdAt)),
    ))
    .orderBy(desc(postsTable.createdAt))
    .limit(20);
  const threadResolver = createD1ThreadResolver(db, origin);
  const resolved = await Promise.all(rows.map((row) => threadResolver.resolve({ postId: row.postId as never })));
  return resolved.flatMap((result, index) =>
    result.ok && result.val.currentPost !== null
      ? [{ ...result.val.currentPost, liked: rows[index].liked, reposted: rows[index].reposted }]
      : []
  );
};

const unwrap = <T>(result: { ok: boolean; val?: T }): T => {
  if (!result.ok) throw new Error('Expected ok');
  return result.val as T;
};

const cursors = [undefined, Instant.orThrow(20_000)];
const viewers = [undefined, viewerActorId, remoteActorId];

describe('D1 post resolvers batch the enrichment queries', () => {
  it('returns the same posts as the per-post threadResolver for /api/v1/users/:username/posts (by actor IDs)', async () => {
    const { db } = setup();
    const resolver = createD1PostsResolverByActorIds(db, ORIGIN);
    for (const createdAt of cursors) {
      for (const currentActorId of viewers) {
        const actual = unwrap(await resolver.resolve({ actorIds: [localActorId], currentActorId, createdAt }));
        const expected = await legacyResolvePosts(db, ORIGIN, { actorIds: [localActorId], currentActorId, createdAt });
        expect(actual.length).toBe(createdAt === undefined ? 20 : 19);
        expect(actual).toEqual(expected);
        expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
      }
    }
  });

  it('keeps the enrichment values of a post with images, likes, reposts, reactions, link previews and replies', async () => {
    const { db } = setup();
    const [first] = unwrap(
      await createD1PostsResolverByActorIds(db, ORIGIN).resolve({
        actorIds: [localActorId],
        currentActorId: viewerActorId,
        createdAt: undefined,
      }),
    );
    expect(first).toMatchObject({
      postId: postIdOf(richIndex),
      type: 'local',
      username: 'kosui',
      logoUri: 'https://iori.test/logo.png',
      liked: true,
      reposted: true,
      images: [
        { url: 'https://iori.test/uploads/1.png', altText: 'first' },
        { url: 'https://iori.test/uploads/2.png', altText: null },
      ],
      likeCount: 2,
      repostCount: 2,
    });
    expect(first.reactions).toEqual([
      { emoji: ':blob:', emojiImageUrl: 'https://remote.test/emoji/blob.png', count: 1 },
      { emoji: '🎉', emojiImageUrl: null, count: 1 },
      { emoji: '👍', emojiImageUrl: null, count: 2 },
    ]);
    expect(first.linkPreviews.map(preview => [preview.url, preview.title, preview.createdAt])).toEqual([
      ['https://example.test/a', 'A', 12_345],
      ['https://example.test/b', null, 12_345],
    ]);
    const thread = unwrap(await createD1ThreadResolver(db, ORIGIN).resolve({ postId: postIdOf(replyIndex) as never }));
    expect(thread.ancestors.map(post => post.postId)).toEqual([remoteReplyTargetId]);
    expect(thread.descendants.map(post => post.postId)).toEqual([postIdOf(richIndex), postIdOf(parentIndex)]);
  });

  it('returns the same posts as the per-post threadResolver for remote-users posts (with pagination)', async () => {
    const { db } = setup();
    const resolver = createD1PostsResolverByActorIdWithPagination(db, ORIGIN);
    for (const actorId of [remoteActorId, localActorId]) {
      for (const createdAt of cursors) {
        for (const currentActorId of viewers) {
          const actual = unwrap(await resolver.resolve({ actorId, currentActorId, createdAt }));
          const expected = await legacyResolvePosts(db, ORIGIN, { actorIds: [actorId], currentActorId, createdAt });
          expect(actual.length).toBeGreaterThan(0);
          expect(actual).toEqual(expected);
          expect(JSON.stringify(actual)).toBe(JSON.stringify(expected));
        }
      }
    }
  });

  it('keeps federated resolver posts identical to the thread resolver result', async () => {
    const { db } = setup();
    const result = unwrap(
      await createD1FederatedTimelineItemsResolver(db).resolve({
        page: { limit: 20, olderThanId: undefined, newerThanId: undefined, order: 'newestFirst' },
        mutedActorIds: [],
        currentActorId: undefined,
      }),
    );
    const threadResolver = createD1ThreadResolver(db, ORIGIN);
    expect(result.map(item => item.post.postId)).toEqual([postIdOf(richIndex), postIdOf(3), id(3002), id(3003)]);
    for (const item of result) {
      const thread = unwrap(await threadResolver.resolve({ postId: item.post.postId as never }));
      expect(item.post).toEqual(thread.currentPost);
    }
    expect(result[0].post).toMatchObject({ likeCount: 2, repostCount: 2, liked: false, reposted: false });
    expect(result[0].post.images).toHaveLength(2);
    expect(result[0].post.reactions).toHaveLength(3);
    expect(result[0].post.linkPreviews).toHaveLength(2);
  });

  it('returns an empty page with one query when no post matches', async () => {
    const { db, queries } = setup();
    const result = unwrap(
      await createD1PostsResolverByActorIds(db, ORIGIN).resolve({
        actorIds: [localActorId],
        currentActorId: undefined,
        createdAt: Instant.orThrow(1),
      }),
    );
    expect(result).toEqual([]);
    expect(queries).toHaveLength(1);
  });
});

describe('D1 query counts for a page of 20 posts', () => {
  const addFederatedItems = (sqlite: ReturnType<typeof setup>['sqlite']) => {
    for (let index = 1; index < LOCAL_POST_COUNT; index++) {
      if (index === 3) continue;
      sqlite.prepare(
        'INSERT INTO federated_timeline_items(federatedTimelineItemId,postId,relayId,receivedAt) VALUES (?,?,?,?)',
      ).run(id(6200 + index), postIdOf(index), id(6000), 80_000 - index * 100);
    }
  };
  const federatedInput = (currentActorId: ActorId | undefined) => ({
    page: { limit: 20, olderThanId: undefined, newerThanId: undefined, order: 'newestFirst' as const },
    mutedActorIds: [],
    currentActorId,
  });

  it('runs 7 queries for the federated resolver without a viewer', async () => {
    const { sqlite, db, queries } = setup();
    addFederatedItems(sqlite);
    const result = unwrap(await createD1FederatedTimelineItemsResolver(db).resolve(federatedInput(undefined)));
    expect(result).toHaveLength(20);
    expect(result.every(item => !item.post.liked && !item.post.reposted)).toBe(true);
    expect(result.slice(0, 4).map(item => item.post.postId)).toEqual([
      postIdOf(richIndex),
      postIdOf(3),
      id(3002),
      id(3003),
    ]);
    expect(result[0].post).toMatchObject({ likeCount: 2, repostCount: 2, liked: false, reposted: false });
    expect(result[0].post.images).toHaveLength(2);
    expect(result[0].post.reactions).toHaveLength(3);
    expect(result[0].post.linkPreviews).toHaveLength(2);
    expect(queries).toHaveLength(7);
  });

  it('runs 9 queries for the federated resolver with a viewer and marks liked and reposted posts', async () => {
    const { sqlite, db, queries } = setup();
    addFederatedItems(sqlite);
    const resolver = createD1FederatedTimelineItemsResolver(db);
    const asViewer = unwrap(await resolver.resolve(federatedInput(viewerActorId)));
    expect(queries).toHaveLength(9);
    expect(asViewer).toHaveLength(20);
    expect(asViewer[0].post).toMatchObject({ postId: postIdOf(richIndex), liked: true, reposted: true });
    expect(asViewer.filter(item => item.post.liked).map(item => item.post.postId)).toEqual([postIdOf(richIndex)]);
    expect(asViewer.filter(item => item.post.reposted).map(item => item.post.postId)).toEqual([
      postIdOf(richIndex),
    ]);

    queries.length = 0;
    const asRemote = unwrap(await resolver.resolve(federatedInput(remoteActorId)));
    expect(queries).toHaveLength(9);
    expect(asRemote.filter(item => item.post.liked).map(item => item.post.postId)).toEqual([
      postIdOf(richIndex),
      postIdOf(3),
    ]);
    expect(asRemote.filter(item => item.post.reposted).map(item => item.post.postId)).toEqual([
      postIdOf(richIndex),
      postIdOf(4),
    ]);
  });

  it('runs 6 queries for /api/v1/users/:username/posts without a viewer and 8 with a viewer', async () => {
    const { db, queries } = setup();
    const resolver = createD1PostsResolverByActorIds(db, ORIGIN);
    const anonymous = unwrap(
      await resolver.resolve({ actorIds: [localActorId], currentActorId: undefined, createdAt: undefined }),
    );
    expect(anonymous).toHaveLength(20);
    expect(anonymous.every(post => !post.liked && !post.reposted)).toBe(true);
    expect(queries).toHaveLength(6);

    queries.length = 0;
    const asViewer = unwrap(
      await resolver.resolve({ actorIds: [localActorId], currentActorId: viewerActorId, createdAt: undefined }),
    );
    expect(asViewer).toHaveLength(20);
    expect(asViewer[0]).toMatchObject({ postId: postIdOf(richIndex), liked: true, reposted: true });
    expect(queries).toHaveLength(8);
  });
});

describe('resolvePostsWithAuthorByIds with more than 100 post IDs', () => {
  const EXTRA_LAST = 120;
  const addPosts = (sqlite: ReturnType<typeof setup>['sqlite']) => {
    for (let index = LOCAL_POST_COUNT + 1; index <= EXTRA_LAST; index++) {
      sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (?,?,?,?,?)').run(
        postIdOf(index),
        localActorId,
        `local post ${index}`,
        index * 1000,
        'local',
      );
      sqlite.prepare('INSERT INTO local_posts(postId,userId,inReplyToUri) VALUES (?,?,?)').run(
        postIdOf(index),
        userId,
        null,
      );
      if (index % 3 !== 0) {
        sqlite.prepare('INSERT INTO likes(likeId,actorId,postId,type,createdAt) VALUES (?,?,?,?,?)').run(
          id(7000 + index),
          viewerActorId,
          postIdOf(index),
          'remote',
          1,
        );
        sqlite.prepare('INSERT INTO remote_likes(likeId,likeActivityUri) VALUES (?,?)').run(
          id(7000 + index),
          `https://remote.test/likes/${index}`,
        );
      }
      sqlite.prepare('INSERT INTO reposts(repostId,actorId,postId,createdAt) VALUES (?,?,?,?)').run(
        id(7200 + index),
        index % 2 === 0 ? viewerActorId : remoteActorId,
        postIdOf(index),
        1,
      );
      if (index % 3 === 0) {
        sqlite.prepare('INSERT INTO post_images(imageId,postId,url,altText,createdAt) VALUES (?,?,?,?,?)').run(
          id(7400 + index),
          postIdOf(index),
          `https://iori.test/uploads/extra-${index}.png`,
          null,
          1,
        );
      }
      if (index % 5 === 0) {
        sqlite.prepare(
          'INSERT INTO emoji_reacts(emojiReactId,actorId,postId,emoji,emojiImageUrl,createdAt) VALUES (?,?,?,?,?,?)',
        ).run(id(7600 + index), remoteActorId, postIdOf(index), '👍', null, 1);
      }
      if (index % 7 === 0) {
        sqlite.prepare(
          'INSERT INTO link_previews(linkPreviewId,postId,url,title,description,imageUrl,faviconUrl,siteName,createdAt) VALUES (?,?,?,?,?,?,?,?,?)',
        ).run(
          id(7800 + index),
          postIdOf(index),
          `https://example.test/extra-${index}`,
          null,
          null,
          null,
          null,
          null,
          1,
        );
      }
    }
  };

  it('returns every post with its enrichment without hitting the D1 parameter limit', async () => {
    const { sqlite, db, queries } = setup();
    addPosts(sqlite);
    const postIds = Array.from({ length: EXTRA_LAST }, (_, index) => postIdOf(index + 1) as PostId);
    expect(postIds.length).toBeGreaterThan(100);

    const posts = await resolvePostsWithAuthorByIds(db, postIds, viewerActorId);

    expect(posts.size).toBe(EXTRA_LAST);
    expect([...posts.keys()].sort()).toEqual([...postIds].sort());
    expect(queries).toHaveLength(8);
    expect(posts.get(postIdOf(richIndex) as PostId)).toMatchObject({
      liked: true,
      reposted: true,
      likeCount: 2,
      repostCount: 2,
    });
    for (let index = LOCAL_POST_COUNT + 1; index <= EXTRA_LAST; index++) {
      const post = posts.get(postIdOf(index) as PostId);
      expect(post).toMatchObject({
        postId: postIdOf(index),
        liked: index % 3 !== 0,
        reposted: index % 2 === 0,
        likeCount: index % 3 !== 0 ? 1 : 0,
        repostCount: 1,
      });
      expect(post?.images.map(image => image.url)).toEqual(
        index % 3 === 0 ? [`https://iori.test/uploads/extra-${index}.png`] : [],
      );
      expect(post?.reactions).toEqual(index % 5 === 0 ? [{ emoji: '👍', emojiImageUrl: null, count: 1 }] : []);
      expect(post?.linkPreviews.map(preview => preview.url)).toEqual(
        index % 7 === 0 ? [`https://example.test/extra-${index}`] : [],
      );
    }
    const beyondFirst100 = postIds.slice(100).map(postId => posts.get(postId));
    expect(new Set(beyondFirst100.map(post => post?.liked))).toEqual(new Set([true, false]));
    expect(new Set(beyondFirst100.map(post => post?.reposted))).toEqual(new Set([true, false]));
  });
});

describe('getUserPosts resolves the user and the local actor in one query', () => {
  const legacyGetUserPosts = (db: IoriD1Db, username: Username, createdAt: Instant | undefined) =>
    createLegacyUseCase(db).run({ username, createdAt });

  const createLegacyUseCase = (db: IoriD1Db) => ({
    run: async ({ username, createdAt }: { username: Username; createdAt: Instant | undefined }) => {
      const user = await resolveUserByUsernameWith(createD1UserResolverByUsername(db))(username);
      if (!user.ok) return user;
      const actor = await resolveLocalActorWith(createD1ActorResolverByUserId(db))(user.val.id);
      if (!actor.ok) return actor;
      const [following, followers, posts] = await Promise.all([
        createD1ActorsResolverByFollowerId(db).resolve(actor.val.id),
        createD1ActorsResolverByFollowingId(db).resolve(actor.val.id),
        RA.ok(await legacyResolvePosts(db, ORIGIN, { actorIds: [actor.val.id], currentActorId: undefined, createdAt })),
      ]);
      if (!following.ok) return following;
      if (!followers.ok) return followers;
      return RA.ok({
        user: user.val,
        actor: actor.val,
        following: following.val,
        followers: followers.val,
        posts: posts.val,
      });
    },
  });

  const createUseCase = (db: IoriD1Db) =>
    createWorkerGetUserPostsUseCase({
      userWithLocalActorResolverByUsername: createD1UserWithLocalActorResolverByUsername(db),
      actorsResolverByFollowerId: createD1ActorsResolverByFollowerId(db),
      actorsResolverByFollowingId: createD1ActorsResolverByFollowingId(db),
      postsResolverByActorIds: createD1PostsResolverByActorIds(db, ORIGIN),
    });

  it('returns the same use case result and the same JSON response as before, with fewer D1 queries', async () => {
    const legacyFixture = setup();
    const legacyResult = await legacyGetUserPosts(legacyFixture.db, Username.orThrow('kosui'), undefined);
    const legacyQueryCount = legacyFixture.queries.length;

    const { db, queries } = setup();
    const result = await createUseCase(db).run({ username: Username.orThrow('kosui'), createdAt: undefined });
    expect(result).toEqual(legacyResult);
    expect(unwrap(result).posts).toHaveLength(20);
    expect(unwrap(result).following.map(actor => actor.id)).toEqual([remoteActorId]);
    expect(unwrap(result).followers.map(actor => actor.id)).toEqual([viewerActorId]);
    expect(legacyQueryCount).toBeGreaterThan(100);
    expect(queries).toHaveLength(9);

    const router = createWorkerCoreApiRouter({ getUserPostsUseCase: createUseCase(db) } as never);
    const legacyRouter = createWorkerCoreApiRouter({ getUserPostsUseCase: createLegacyUseCase(db) } as never);
    const response = await router.request('/v1/users/kosui/posts');
    const legacyResponse = await legacyRouter.request('/v1/users/kosui/posts');
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(await legacyResponse.text());
  });

  it('does not mix posts of other actors into the /api/v1/users/:username/posts response', async () => {
    const { db } = setup();
    const router = createWorkerCoreApiRouter({ getUserPostsUseCase: createUseCase(db) } as never);
    const response = await router.request('/v1/users/kosui/posts?createdAt=5000');
    const { posts } = await response.json() as { posts: PostWithAuthor[] };
    expect(response.status).toBe(200);
    expect(posts.map(post => post.postId)).toEqual([postIdOf(4), postIdOf(3), postIdOf(2), postIdOf(1)]);
    expect(posts.every(post => post.type === 'local' && post.actorId === localActorId)).toBe(true);
  });

  it('returns the same page for a cursor', async () => {
    const { db } = setup();
    const createdAt = Instant.orThrow(20_000);
    expect(await createUseCase(db).run({ username: Username.orThrow('kosui'), createdAt })).toEqual(
      await legacyGetUserPosts(db, Username.orThrow('kosui'), createdAt),
    );
  });

  it('returns the same UserNotFoundError when the user does not exist', async () => {
    const { db } = setup();
    const username = Username.orThrow('nobody');
    const result = await createUseCase(db).run({ username, createdAt: undefined });
    expect(result).toEqual(await legacyGetUserPosts(db, username, undefined));
    expect(result).toMatchObject({
      ok: false,
      err: {
        type: 'UserNotFoundError',
        message: 'The user with username "nobody" was not found.',
        detail: { username },
      },
    });
    const response = await createWorkerCoreApiRouter({ getUserPostsUseCase: createUseCase(db) } as never).request(
      '/v1/users/nobody/posts',
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'The user with username "nobody" was not found.' });
  });

  it('returns the same UserNotFoundError with the user ID when the user has no local actor', async () => {
    const { sqlite, db } = setup();
    const orphanId = id(7);
    sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(orphanId, 'orphan');
    const username = Username.orThrow('orphan');
    const result = await createUseCase(db).run({ username, createdAt: undefined });
    expect(result).toEqual(await legacyGetUserPosts(db, username, undefined));
    expect(result).toMatchObject({
      ok: false,
      err: {
        type: 'UserNotFoundError',
        message: `The user with ID "${orphanId}" was not found.`,
        detail: { userId: orphanId },
      },
    });
  });
});

describe('/v1/remote-users/:actorId/posts', () => {
  it('returns 401 without a session cookie and does not run the use case', async () => {
    const run = vi.fn();
    const router = createWorkerCoreApiRouter({ getRemoteActorPostsUseCase: { run } } as never);
    const response = await router.request(`/v1/remote-users/${remoteActorId}/posts`);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: 'Unauthorized' });
    expect(run).not.toHaveBeenCalled();
  });
});

describe('createD1UserWithLocalActorResolverByUsername', () => {
  it('returns the user and local actor from a single query', async () => {
    const { db, queries } = setup();
    const result = await createD1UserWithLocalActorResolverByUsername(db).resolve(Username.orThrow('kosui'));
    expect(result).toEqual({
      ok: true,
      val: {
        user: { id: userId, username: 'kosui' },
        actor: {
          id: localActorId,
          uri: `${ORIGIN}/users/kosui`,
          inboxUrl: `${ORIGIN}/users/kosui/inbox`,
          type: 'local',
          userId,
          logoUri: 'https://iori.test/logo.png',
        },
      },
      err: undefined,
    });
    expect(queries).toHaveLength(1);
  });

  it('returns undefined for an unknown user and an undefined actor for a user without one', async () => {
    const { sqlite, db } = setup();
    sqlite.prepare('INSERT INTO users(userId,username) VALUES (?,?)').run(id(7), 'orphan');
    const resolver = createD1UserWithLocalActorResolverByUsername(db);
    const unknown = await resolver.resolve(Username.orThrow('nobody'));
    const orphan = await resolver.resolve(Username.orThrow('orphan'));
    expect(unknown.ok && unknown.val).toBeUndefined();
    expect(orphan).toEqual({
      ok: true,
      val: { user: { id: id(7), username: 'orphan' }, actor: undefined },
      err: undefined,
    });
  });
});
