import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { Instant } from '../../../domain/instant/instant.ts';
import { actorIdsJson } from '../actorIdsJson.ts';
import {
  createD1PostsResolverByActorIds,
  createD1PostsResolverByActorIdWithPagination,
} from '../post/postWithAuthorResolvers.ts';
import { createD1TimelineItemsResolverByActorIds } from '../timeline/timelineItemsResolverByActorIds.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { sqlite } = fixture;
  const rows = Array.from({ length: 121 }, (_, i) => ({
    actorId: ActorId.orThrow(id(i + 1)),
    postId: id(i + 1001),
    time: ((i * 37) % 121 + 1) * 1000,
    index: i,
  }));
  for (const row of rows) {
    sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').run(
      row.actorId,
      `https://fixture.invalid/actors/${row.index}`,
      `https://fixture.invalid/inbox/${row.index}`,
      'remote',
    );
    sqlite.prepare('INSERT INTO remote_actors(actorId,username) VALUES (?,?)').run(row.actorId, `fixture${row.index}`);
    sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (?,?,?,?,?)').run(
      row.postId,
      row.actorId,
      'synthetic',
      row.time,
      'remote',
    );
    sqlite.prepare('INSERT INTO remote_posts(postId,uri) VALUES (?,?)').run(
      row.postId,
      `https://fixture.invalid/posts/${row.index}`,
    );
    sqlite.prepare('INSERT INTO timeline_items(timelineItemId,type,actorId,postId,createdAt) VALUES (?,?,?,?,?)').run(
      id(row.index + 2001),
      'post',
      row.actorId,
      row.postId,
      row.time,
    );
  }
  // The last actor is outside the followed selection; another item is deleted.
  sqlite.prepare('UPDATE timeline_items SET deletedAt=1 WHERE postId=?').run(rows[118].postId);
  sqlite.prepare('UPDATE posts SET deletedAt=1 WHERE postId=?').run(rows[118].postId);
  const actors = rows.slice(0, 120).filter(row => row.index !== 117).map(row => row.actorId);
  const expected = rows.filter(row => row.index < 120 && row.index !== 117 && row.index !== 118)
    .sort((a, b) => b.time - a.time);
  return { ...fixture, rows, actors, expected };
};

describe('D1 actor selection with actual SQLite', () => {
  it('bounds the complete JSON value and refuses oversize before D1 access', async () => {
    const { db, queries, rows } = setup();
    const largest = Array.from({ length: 51282 }, () => rows[0].actorId);
    expect(new TextEncoder().encode(actorIdsJson(largest)).byteLength).toBe(1_999_999);
    const actorIds = [...largest, rows[0].actorId];
    await expect(
      createD1TimelineItemsResolverByActorIds(db).resolve({
        actorIds,
        currentActorId: undefined,
        createdAt: undefined,
        mutedActorIds: [],
      }),
    ).rejects.toThrow('text value limit');
    await expect(
      createD1PostsResolverByActorIds(db, 'https://fixture.invalid').resolve({
        actorIds,
        currentActorId: undefined,
        createdAt: undefined,
      }),
    ).rejects.toThrow('text value limit');
    expect(queries).toHaveLength(0);
  });

  it.each([undefined, 80000])('preserves global timeline order/limit across >100 actors (cursor=%s)', async cursor => {
    const { db, queries, rows, actors, expected } = setup();
    const result = await createD1TimelineItemsResolverByActorIds(db).resolve({
      actorIds: actors,
      currentActorId: rows[0].actorId,
      createdAt: cursor === undefined ? undefined : Instant.orThrow(cursor),
      mutedActorIds: [rows[117].actorId],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected timeline');
    expect(result.val.map(item => item.post.postId)).toEqual(
      expected.filter(row => cursor === undefined || row.time < cursor).slice(0, 10).map(row => row.postId),
    );
    expect(queries[0].params.length).toBeLessThanOrEqual(4);
  });

  it('retains muted-original filtering and viewer enrichment in timeline results', async () => {
    const { sqlite, db, rows, actors, expected } = setup();
    const selected = expected.slice(0, 10);
    sqlite.prepare('INSERT INTO likes(likeId,actorId,postId,type,createdAt) VALUES (?,?,?,?,?)').run(
      id(5001),
      rows[0].actorId,
      selected[1].postId,
      'remote',
      1000,
    );
    sqlite.prepare('INSERT INTO remote_likes(likeId,likeActivityUri) VALUES (?,?)').run(
      id(5001),
      'https://fixture.invalid/like',
    );
    sqlite.prepare('INSERT INTO reposts(repostId,actorId,postId,createdAt) VALUES (?,?,?,?)').run(
      id(5002),
      rows[0].actorId,
      selected[1].postId,
      1000,
    );
    const result = await createD1TimelineItemsResolverByActorIds(db).resolve({
      actorIds: actors,
      currentActorId: rows[0].actorId,
      createdAt: undefined,
      mutedActorIds: [selected[0].actorId],
    });
    if (!result.ok) throw new Error('Expected timeline');
    // Existing port filters muted original authors after selecting the global page.
    expect(result.val.map(item => item.post.postId)).toEqual(selected.slice(1).map(row => row.postId));
    expect(result.val[0].post.liked).toBe(true);
    expect(result.val[0].post.reposted).toBe(true);
    expect(result.val[0].post.likeCount).toBe(1);
    expect(result.val[0].post.repostCount).toBe(1);
  });

  it('preserves global profile pagination across >100 actors and handles empty selections without SQL', async () => {
    const { db, queries, actors, expected } = setup();
    const resolver = createD1PostsResolverByActorIds(db, 'https://fixture.invalid');
    const empty = await resolver.resolve({ actorIds: [], currentActorId: undefined, createdAt: undefined });
    expect(empty).toEqual({ ok: true, val: [] });
    expect(queries).toHaveLength(0);
    const emptyTimeline = await createD1TimelineItemsResolverByActorIds(db).resolve({
      actorIds: [],
      currentActorId: undefined,
      createdAt: undefined,
      mutedActorIds: [],
    });
    expect(emptyTimeline).toEqual({ ok: true, val: [] });
    expect(queries).toHaveLength(0);
    const result = await resolver.resolve({
      actorIds: actors,
      currentActorId: undefined,
      createdAt: Instant.orThrow(80000),
    });
    if (!result.ok) throw new Error('Expected posts');
    expect(result.val.map(post => post.postId)).toEqual(
      expected.filter(row => row.time < 80000).slice(0, 20).map(row => row.postId),
    );
    expect(queries[0].params.length).toBeLessThanOrEqual(5);
  });

  it.each(['single', 'multiple'] as const)('preserves strict viewer flags separately from totals (%s)', async mode => {
    const { sqlite, db, rows } = setup();
    const [author, viewer, other] = rows;
    const secondPostId = id(6000);
    sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (?,?,?,?,?)').run(
      secondPostId,
      author.actorId,
      'second synthetic post',
      2000,
      'remote',
    );
    sqlite.prepare('INSERT INTO remote_posts(postId,uri) VALUES (?,?)').run(
      secondPostId,
      'https://fixture.invalid/posts/second',
    );
    sqlite.prepare('INSERT INTO likes(likeId,actorId,postId,type,createdAt) VALUES (?,?,?,?,?)').run(
      id(5001),
      viewer.actorId,
      author.postId,
      'remote',
      1000,
    );
    sqlite.prepare('INSERT INTO remote_likes(likeId,likeActivityUri) VALUES (?,?)').run(
      id(5001),
      'https://fixture.invalid/like',
    );
    sqlite.prepare('INSERT INTO reposts(repostId,actorId,postId,createdAt) VALUES (?,?,?,?)').run(
      id(5002),
      viewer.actorId,
      secondPostId,
      1000,
    );
    for (const currentActorId of [viewer.actorId, other.actorId, undefined]) {
      const result = mode === 'single'
        ? await createD1PostsResolverByActorIdWithPagination(db, 'https://fixture.invalid').resolve({
          actorId: author.actorId,
          currentActorId,
          createdAt: undefined,
        })
        : await createD1PostsResolverByActorIds(db, 'https://fixture.invalid').resolve({
          actorIds: [author.actorId],
          currentActorId,
          createdAt: undefined,
        });
      if (!result.ok) throw new Error('Expected posts');
      expect(result.val.map(post => post.postId)).toEqual([secondPostId, author.postId]);
      expect(result.val[0].liked).toBe(false);
      expect(result.val[0].reposted).toBe(currentActorId === viewer.actorId);
      expect(result.val[0].likeCount).toBe(0);
      expect(result.val[0].repostCount).toBe(1);
      expect(result.val[1].liked).toBe(currentActorId === viewer.actorId);
      expect(result.val[1].reposted).toBe(false);
      expect(result.val[1].likeCount).toBe(1);
      expect(result.val[1].repostCount).toBe(0);
    }
  });
});
