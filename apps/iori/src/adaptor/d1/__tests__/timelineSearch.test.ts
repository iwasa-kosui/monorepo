import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { SearchTerm } from '../../../domain/timelineSearch/searchTerm.ts';
import { createD1TimelineSearchCandidatesResolver } from '../timelineSearch/timelineSearchCandidatesResolver.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const terms = (...values: string[]) => values.map((value) => SearchTerm.orThrow(value));

const setup = () => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { sqlite } = fixture;
  const actors = [1, 2, 3].map((n) => ActorId.orThrow(id(n)));
  for (const [index, actorId] of actors.entries()) {
    sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').run(
      actorId,
      `https://fixture.invalid/actors/${index}`,
      `https://fixture.invalid/inbox/${index}`,
      'remote',
    );
  }
  let next = 100;
  const addPost = (actorId: string, content: string, createdAt: number, deletedAt?: number) => {
    const postId = id(next++);
    sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type,deletedAt) VALUES (?,?,?,?,?,?)').run(
      postId,
      actorId,
      content,
      createdAt,
      'remote',
      deletedAt ?? null,
    );
    return postId;
  };
  return { ...fixture, actors, addPost };
};

describe('createD1TimelineSearchCandidatesResolver', () => {
  it('渡した actorId の投稿だけを返す', async () => {
    const { db, actors, addPost } = setup();
    const mine = addPost(actors[0], '旅行の写真', 1000);
    const followed = addPost(actors[1], '旅行に行った', 2000);
    addPost(actors[2], '旅行の話', 3000);

    const result = await createD1TimelineSearchCandidatesResolver(db).resolve({
      actorIds: [actors[0], actors[1]],
      terms: terms('旅行'),
      limit: 20,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('Expected candidates');
    expect(result.val.map((row) => row.postId)).toEqual([followed, mine]);
    expect(result.val[0]).toEqual({ postId: followed, content: '旅行に行った', createdAt: 2000 });
  });

  it('削除済みの投稿を返さない', async () => {
    const { db, actors, addPost } = setup();
    const alive = addPost(actors[0], '旅行', 1000);
    addPost(actors[0], '旅行 削除済み', 2000, 5000);

    const result = await createD1TimelineSearchCandidatesResolver(db).resolve({
      actorIds: [actors[0]],
      terms: terms('旅行'),
      limit: 20,
    });

    expect(result.ok && result.val.map((row) => row.postId)).toEqual([alive]);
  });

  it('日本語の 2 文字の語が一致する', async () => {
    const { db, actors, addPost } = setup();
    const hit = addPost(actors[0], '週末は旅行に行きます', 1000);
    addPost(actors[0], '週末は家にいます', 2000);

    const result = await createD1TimelineSearchCandidatesResolver(db).resolve({
      actorIds: [actors[0]],
      terms: terms('旅行'),
      limit: 20,
    });

    expect(result.ok && result.val.map((row) => row.postId)).toEqual([hit]);
  });

  it('複数の語を OR でつなぐ', async () => {
    const { db, actors, addPost } = setup();
    const a = addPost(actors[0], '旅行です', 1000);
    const b = addPost(actors[0], 'trip memo', 2000);
    addPost(actors[0], '関係ない投稿', 3000);

    const result = await createD1TimelineSearchCandidatesResolver(db).resolve({
      actorIds: [actors[0]],
      terms: terms('旅行', 'trip', '出張'),
      limit: 20,
    });

    expect(result.ok && result.val.map((row) => row.postId)).toEqual([b, a]);
  });

  it('createdAt の降順に並べ、limit で切る', async () => {
    const { db, queries, actors, addPost } = setup();
    const posts = [3000, 1000, 5000, 2000, 4000].map((time) => ({ time, postId: addPost(actors[0], '旅行', time) }));

    const result = await createD1TimelineSearchCandidatesResolver(db).resolve({
      actorIds: [actors[0]],
      terms: terms('旅行'),
      limit: 3,
    });

    const expected = [...posts].sort((x, y) => y.time - x.time).slice(0, 3).map((post) => post.postId);
    expect(result.ok && result.val.map((row) => row.postId)).toEqual(expected);
    expect(queries.at(-1)?.params).toContain('%旅行%');
  });

  it('terms が空のときは DB を呼ばずに空の配列を返す', async () => {
    const { db, queries, actors, addPost } = setup();
    addPost(actors[0], '旅行', 1000);
    const before = queries.length;

    const result = await createD1TimelineSearchCandidatesResolver(db).resolve({
      actorIds: [actors[0]],
      terms: [],
      limit: 20,
    });

    expect(result.ok && result.val).toEqual([]);
    expect(queries).toHaveLength(before);
  });
});
