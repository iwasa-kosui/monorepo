import { afterEach, describe, expect, it } from 'vitest';

import type { ActorId } from '../../../domain/actor/actorId.ts';
import type { PostWithAuthor } from '../../../domain/post/post.ts';
import type { PostId } from '../../../domain/post/postId.ts';
import { createD1FederatedTimelineItemsResolver } from '../federatedTimeline/federatedTimelineItemsResolver.ts';
import { resolvePostsWithAuthorByIds } from '../post/postWithAuthorBatch.ts';
import { createD1ThreadResolver } from '../post/threadResolver.ts';
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

const unwrap = <T>(result: { ok: boolean; val?: T }): T => {
  if (!result.ok) throw new Error('Expected ok');
  return result.val as T;
};

describe('D1 post resolvers batch the enrichment queries', () => {
  it('keeps the enrichment values of a post with images, likes, reposts, reactions, link previews and replies', async () => {
    const { db } = setup();
    const first = (await resolvePostsWithAuthorByIds(db, [postIdOf(richIndex) as PostId], viewerActorId))
      .get(postIdOf(richIndex) as PostId);
    if (first === undefined) throw new Error('Expected the post');
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

  it('merges reactions of the same name into one entry even when only some rows carry an image URL', async () => {
    const { db, sqlite } = setup();
    const insert = (reactId: string, actorId: string, emoji: string, imageUrl: string | null) =>
      sqlite.prepare(
        'INSERT INTO emoji_reacts(emojiReactId,actorId,postId,emoji,emojiImageUrl,createdAt) VALUES (?,?,?,?,?,?)',
      ).run(reactId, actorId, postIdOf(4), emoji, imageUrl, 1);
    insert(id(5311), remoteActorId, ':x:', 'https://remote.test/emoji/x.png');
    insert(id(5312), viewerActorId, ':x:', null);

    const post = (await resolvePostsWithAuthorByIds(db, [postIdOf(4) as PostId], viewerActorId))
      .get(postIdOf(4) as PostId);

    expect(post?.reactions).toEqual([
      { emoji: ':x:', emojiImageUrl: 'https://remote.test/emoji/x.png', count: 2 },
    ]);
  });

  it('keeps the federated timeline resolver posts identical to the thread resolver result', async () => {
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

  it('reads the recorded visibility of a remote post in every batched path and keeps null when unrecorded', async () => {
    const { db, sqlite } = setup();
    sqlite.prepare('UPDATE remote_posts SET visibility=? WHERE postId=?').run('unlisted', id(3001));
    sqlite.prepare('UPDATE remote_posts SET visibility=? WHERE postId=?').run('direct', id(3002));
    const expected = new Map<string, string | null>([[id(3001), 'unlisted'], [id(3002), 'direct'], [id(3003), null]]);
    const expectVisibilities = (posts: ReadonlyArray<PostWithAuthor>, postIds: ReadonlyArray<string>) => {
      const visibilities = posts.flatMap((post) =>
        post.type === 'remote' && postIds.includes(post.postId) ? [[post.postId, post.visibility] as const] : []
      );
      expect(new Map(visibilities)).toEqual(new Map(postIds.map((postId) => [postId, expected.get(postId)])));
    };
    const allIds = [id(3001), id(3002), id(3003)];
    expectVisibilities([...(await resolvePostsWithAuthorByIds(db, allIds as PostId[], undefined)).values()], allIds);
    expectVisibilities(
      unwrap(
        await createD1FederatedTimelineItemsResolver(db).resolve({
          page: { limit: 20, olderThanId: undefined, newerThanId: undefined, order: 'newestFirst' },
          mutedActorIds: [],
          currentActorId: undefined,
        }),
      ).map((item) => item.post),
      [id(3002), id(3003)],
    );
    const threadResolver = createD1ThreadResolver(db, ORIGIN);
    const threads = await Promise.all(
      [id(3001), id(3002), id(3003)].map(async (postId) =>
        unwrap(await threadResolver.resolve({ postId: postId as never })).currentPost
      ),
    );
    expectVisibilities(threads.flatMap((post) => post === null ? [] : [post]), allIds);
  });

  it('returns no posts without a query when no post ID is given', async () => {
    const { db, queries } = setup();
    expect(await resolvePostsWithAuthorByIds(db, [], undefined)).toEqual(new Map());
    expect(queries).toHaveLength(0);
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

  it('runs 6 queries for resolvePostsWithAuthorByIds without a viewer and 8 with a viewer', async () => {
    const { db, queries } = setup();
    const postIds = Array.from({ length: 20 }, (_, index) => postIdOf(LOCAL_POST_COUNT - index) as PostId);
    const anonymous = [...(await resolvePostsWithAuthorByIds(db, postIds, undefined)).values()];
    expect(anonymous).toHaveLength(20);
    expect(anonymous.every(post => !post.liked && !post.reposted)).toBe(true);
    expect(queries).toHaveLength(6);

    queries.length = 0;
    const asViewer = await resolvePostsWithAuthorByIds(db, postIds, viewerActorId);
    expect(asViewer).toHaveProperty('size', 20);
    expect(asViewer.get(postIdOf(richIndex) as PostId)).toMatchObject({ liked: true, reposted: true });
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
