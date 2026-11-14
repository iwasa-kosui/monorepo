import { afterEach, describe, expect, it } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { SearchTerm } from '../../../domain/timelineSearch/searchTerm.ts';
import { SearchTerms } from '../../../domain/timelineSearch/searchTerms.ts';
import { createD1TimelineSearchCandidatesResolver } from '../timelineSearch/timelineSearchCandidatesResolver.ts';
import { createSqliteD1Fixture } from './sqliteFixture.ts';

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const terms = (...values: string[]) => values.map((pattern) => ({ pattern, weight: 1 }));
const queryTerms = (...values: string[]) =>
  SearchTerms.toPatterns(SearchTerms.create({
    original: values.map((value) => SearchTerm.orThrow(value)),
    expanded: [],
  }));

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
  const viewer = ActorId.orThrow(id(9));
  const viewerUri = 'https://fixture.invalid/actors/viewer';
  sqlite.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').run(
    viewer,
    viewerUri,
    'https://fixture.invalid/inbox/viewer',
    'remote',
  );
  let next = 100;
  const addPost = (
    actorId: string,
    content: string,
    createdAt: number,
    deletedAt?: number,
    options: { visibility?: string | null; recipientActorUris?: ReadonlyArray<string> } = {},
  ) => {
    const postId = id(next++);
    sqlite.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type,deletedAt) VALUES (?,?,?,?,?,?)').run(
      postId,
      actorId,
      content,
      createdAt,
      'remote',
      deletedAt ?? null,
    );
    sqlite.prepare('INSERT INTO remote_posts(postId,uri,visibility) VALUES (?,?,?)').run(
      postId,
      `https://fixture.invalid/notes/${postId}`,
      options.visibility === undefined ? 'public' : options.visibility,
    );
    for (const actorUri of options.recipientActorUris ?? []) {
      sqlite.prepare('INSERT INTO remote_post_recipients(postId,actorUri) VALUES (?,?)').run(postId, actorUri);
    }
    return postId;
  };
  const addFollow = (followerId: string, followingId: string) =>
    sqlite.prepare('INSERT INTO follows(followerId,followingId) VALUES (?,?)').run(followerId, followingId);
  return { ...fixture, actors, viewer, viewerUri, addPost, addFollow };
};

describe('createD1TimelineSearchCandidatesResolver', () => {
  it('渡した actorId の投稿だけを返す', async () => {
    const { db, actors, viewer, addPost } = setup();
    const mine = addPost(actors[0], '旅行の写真', 1000);
    const followed = addPost(actors[1], '旅行に行った', 2000);
    addPost(actors[2], '旅行の話', 3000);

    const result = await createD1TimelineSearchCandidatesResolver(db).resolve({
      currentActorId: viewer,
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
    const { db, actors, viewer, addPost } = setup();
    const alive = addPost(actors[0], '旅行', 1000);
    addPost(actors[0], '旅行 削除済み', 2000, 5000);

    const result = await createD1TimelineSearchCandidatesResolver(db).resolve({
      currentActorId: viewer,
      actorIds: [actors[0]],
      terms: terms('旅行'),
      limit: 20,
    });

    expect(result.ok && result.val.map((row) => row.postId)).toEqual([alive]);
  });

  it('日本語の 2 文字の語が一致する', async () => {
    const { db, actors, viewer, addPost } = setup();
    const hit = addPost(actors[0], '週末は旅行に行きます', 1000);
    addPost(actors[0], '週末は家にいます', 2000);

    const result = await createD1TimelineSearchCandidatesResolver(db).resolve({
      currentActorId: viewer,
      actorIds: [actors[0]],
      terms: terms('旅行'),
      limit: 20,
    });

    expect(result.ok && result.val.map((row) => row.postId)).toEqual([hit]);
  });

  it('複数の語を OR でつなぐ', async () => {
    const { db, actors, viewer, addPost } = setup();
    const a = addPost(actors[0], '旅行です', 1000);
    const b = addPost(actors[0], 'trip memo', 2000);
    addPost(actors[0], '関係ない投稿', 3000);

    const result = await createD1TimelineSearchCandidatesResolver(db).resolve({
      currentActorId: viewer,
      actorIds: [actors[0]],
      terms: terms('旅行', 'trip', '出張'),
      limit: 20,
    });

    expect(result.ok && result.val.map((row) => row.postId)).toEqual([b, a]);
  });

  it('createdAt の降順に並べ、limit で切る', async () => {
    const { db, queries, actors, viewer, addPost } = setup();
    const posts = [3000, 1000, 5000, 2000, 4000].map((time) => ({ time, postId: addPost(actors[0], '旅行', time) }));

    const result = await createD1TimelineSearchCandidatesResolver(db).resolve({
      currentActorId: viewer,
      actorIds: [actors[0]],
      terms: terms('旅行'),
      limit: 3,
    });

    const expected = [...posts].sort((x, y) => y.time - x.time).slice(0, 3).map((post) => post.postId);
    expect(result.ok && result.val.map((row) => row.postId)).toEqual(expected);
    expect(queries.at(-1)?.params).toContain('%旅行%');
  });

  it('点数の高い投稿を、新しい投稿が limit を埋めても残す', async () => {
    const { db, actors, viewer, addPost } = setup();
    const expandedOnly = [2000, 3000, 4000, 5000, 6000].map((time) => addPost(actors[0], 'trip memo', time));
    const originalOld = addPost(actors[0], '旅行の記録', 1000);

    const result = await createD1TimelineSearchCandidatesResolver(db).resolve({
      currentActorId: viewer,
      actorIds: [actors[0]],
      terms: [{ pattern: '旅行', weight: 2 }, { pattern: 'trip', weight: 1 }],
      limit: 3,
    });

    expect(result.ok && result.val.map((row) => row.postId)).toEqual([
      originalOld,
      expandedOnly[4],
      expandedOnly[3],
    ]);
  });

  it('点数が同じ投稿は createdAt の降順に並べる', async () => {
    const { db, actors, viewer, addPost } = setup();
    const old = addPost(actors[0], '旅行 trip', 1000);
    const recent = addPost(actors[0], '旅行 trip', 2000);
    const onlyExpanded = addPost(actors[0], 'trip', 3000);

    const result = await createD1TimelineSearchCandidatesResolver(db).resolve({
      currentActorId: viewer,
      actorIds: [actors[0]],
      terms: [{ pattern: '旅行', weight: 2 }, { pattern: 'trip', weight: 1 }],
      limit: 20,
    });

    expect(result.ok && result.val.map((row) => row.postId)).toEqual([recent, old, onlyExpanded]);
  });

  it('半角の語が半角の本文に大文字と小文字を区別せず一致する', async () => {
    const { db, actors, viewer, addPost } = setup();
    const hit = addPost(actors[0], '<p>Trip memo</p>', 1000);
    addPost(actors[0], '<p>関係ない投稿</p>', 2000);

    const result = await createD1TimelineSearchCandidatesResolver(db).resolve({
      currentActorId: viewer,
      actorIds: [actors[0]],
      terms: queryTerms('trip'),
      limit: 20,
    });

    expect(result.ok && result.val.map((row) => row.postId)).toEqual([hit]);
  });

  it('全角の語が半角の本文に一致する', async () => {
    const { db, actors, viewer, addPost } = setup();
    const hit = addPost(actors[0], '<p>Trip memo</p>', 1000);

    const result = await createD1TimelineSearchCandidatesResolver(db).resolve({
      currentActorId: viewer,
      actorIds: [actors[0]],
      terms: queryTerms('ＴＲＩＰ'),
      limit: 20,
    });

    expect(result.ok && result.val.map((row) => row.postId)).toEqual([hit]);
  });

  it('宛先外の direct とフォローしていない private と記録のない投稿を返さず、宛先の direct は返す', async () => {
    const { db, actors, viewer, viewerUri, addPost, addFollow } = setup();
    addFollow(viewer, actors[0]);
    const publicPost = addPost(actors[0], '旅行 public', 1000);
    const unlisted = addPost(actors[0], '旅行 unlisted', 1100, undefined, { visibility: 'unlisted' });
    const directToViewer = addPost(actors[1], '旅行 direct to viewer', 1200, undefined, {
      visibility: 'direct',
      recipientActorUris: [viewerUri],
    });
    addPost(actors[1], '旅行 direct to other', 1300, undefined, {
      visibility: 'direct',
      recipientActorUris: ['https://fixture.invalid/actors/other'],
    });
    const privateFollowed = addPost(actors[0], '旅行 private followed', 1400, undefined, { visibility: 'private' });
    addPost(actors[1], '旅行 private not followed', 1500, undefined, { visibility: 'private' });
    const nullFollowed = addPost(actors[0], '旅行 null followed', 1600, undefined, { visibility: null });
    addPost(actors[1], '旅行 null not followed', 1700, undefined, { visibility: null });
    addPost(actors[0], '旅行 direct followed', 1800, undefined, { visibility: 'direct' });

    const result = await createD1TimelineSearchCandidatesResolver(db).resolve({
      currentActorId: viewer,
      actorIds: [actors[0], actors[1]],
      terms: terms('旅行'),
      limit: 20,
    });

    expect(result.ok && result.val.map((row) => row.postId)).toEqual([
      nullFollowed,
      privateFollowed,
      directToViewer,
      unlisted,
      publicPost,
    ]);
  });

  it('見えない投稿が新しくても、見える古い投稿が limit から外れない', async () => {
    const { db, actors, viewer, addPost } = setup();
    const visible = addPost(actors[0], '旅行', 1000);
    for (const time of [2000, 3000, 4000]) {
      addPost(actors[0], '旅行', time, undefined, { visibility: 'direct' });
    }

    const result = await createD1TimelineSearchCandidatesResolver(db).resolve({
      currentActorId: viewer,
      actorIds: [actors[0]],
      terms: terms('旅行'),
      limit: 3,
    });

    expect(result.ok && result.val.map((row) => row.postId)).toEqual([visible]);
  });
});
