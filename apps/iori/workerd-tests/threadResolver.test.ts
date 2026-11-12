import { env } from 'cloudflare:test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createD1Db } from '../src/adaptor/d1/client.ts';
import { createD1ThreadResolver } from '../src/adaptor/d1/post/threadResolver.ts';
import { PostId } from '../src/domain/post/postId.ts';

const ORIGIN = 'https://iori.test';
const db = createD1Db(env.DB);
const resolver = createD1ThreadResolver(db, ORIGIN);

const userId = crypto.randomUUID();
const localActorId = crypto.randomUUID();
const remoteActorId = crypto.randomUUID();
const username = 'thread-resolver-user';
const postIds: string[] = [];

type Post = Readonly<{ postId: string; uri: string }>;

const addPost = async (
  kind: 'local' | 'remote',
  createdAt: number,
  inReplyToUri: string | null = null,
): Promise<Post> => {
  const postId = crypto.randomUUID();
  postIds.push(postId);
  await env.DB.prepare('INSERT INTO posts(postId,actorId,content,createdAt,type) VALUES (?,?,?,?,?)')
    .bind(postId, kind === 'local' ? localActorId : remoteActorId, `post ${postId}`, createdAt, kind).run();
  if (kind === 'local') {
    await env.DB.prepare('INSERT INTO local_posts(postId,userId,inReplyToUri) VALUES (?,?,?)')
      .bind(postId, userId, inReplyToUri).run();
    return { postId, uri: `${ORIGIN}/users/${username}/posts/${postId}` };
  }
  const uri = `https://remote.example/notes/${postId}`;
  await env.DB.prepare('INSERT INTO remote_posts(postId,uri,inReplyToUri,visibility) VALUES (?,?,?,?)')
    .bind(postId, uri, inReplyToUri, 'public').run();
  return { postId, uri };
};

const resolve = async (postId: string) => {
  const result = await resolver.resolve({ postId: PostId.orThrow(postId) });
  if (!result.ok) throw new Error('resolve failed');
  return {
    ancestors: result.val.ancestors.map((post) => post.postId),
    descendants: result.val.descendants.map((post) => post.postId),
  };
};

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users(userId,username) VALUES (?,?)').bind(userId, username),
    env.DB.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').bind(
      localActorId,
      `${ORIGIN}/users/${username}`,
      `${ORIGIN}/users/${username}/inbox`,
      'local',
    ),
    env.DB.prepare('INSERT INTO local_actors(actorId,userId) VALUES (?,?)').bind(localActorId, userId),
    env.DB.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').bind(
      remoteActorId,
      'https://remote.example/users/thread-resolver-remote',
      'https://remote.example/users/thread-resolver-remote/inbox',
      'remote',
    ),
    env.DB.prepare('INSERT INTO remote_actors(actorId,url,username) VALUES (?,?,?)').bind(
      remoteActorId,
      'https://remote.example/@thread-resolver-remote',
      'thread-resolver-remote',
    ),
  ]);
});

afterAll(async () => {
  const ids = JSON.stringify(postIds);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM local_posts WHERE postId IN (SELECT value FROM json_each(?))').bind(ids),
    env.DB.prepare('DELETE FROM remote_posts WHERE postId IN (SELECT value FROM json_each(?))').bind(ids),
    env.DB.prepare('DELETE FROM posts WHERE postId IN (SELECT value FROM json_each(?))').bind(ids),
    env.DB.prepare('DELETE FROM local_actors WHERE actorId = ?').bind(localActorId),
    env.DB.prepare('DELETE FROM remote_actors WHERE actorId = ?').bind(remoteActorId),
    env.DB.prepare('DELETE FROM actors WHERE actorId IN (?, ?)').bind(localActorId, remoteActorId),
    env.DB.prepare('DELETE FROM users WHERE userId = ?').bind(userId),
  ]);
});

describe('createD1ThreadResolver on workerd D1', () => {
  it('外側が SELECT の再帰 CTE で、リモートとローカルの祖先を根から順に、子孫を深さ優先で返す', async () => {
    const root = await addPost('remote', 1_000);
    const mid = await addPost('local', 2_000, root.uri);
    const current = await addPost('remote', 3_000, mid.uri);
    const late = await addPost('local', 6_000, current.uri);
    const early = await addPost('remote', 4_000, current.uri);
    const earlyChild = await addPost('local', 7_000, early.uri);

    const result = await resolve(current.postId);

    expect(result.ancestors).toEqual([root.postId, mid.postId]);
    expect(result.descendants).toEqual([early.postId, earlyChild.postId, late.postId]);
  });

  it('祖先は 40 件、子孫は 20 段で止め、循環や取得されていない親でも止まる', async () => {
    const chain = [await addPost('local', 10_000)];
    for (let n = 1; n <= 45; n++) chain.push(await addPost('local', 10_000 + n, chain[n - 1].uri));
    const orphan = await addPost('remote', 20_000, 'https://remote.example/notes/not-fetched');
    const cycleA = await addPost('local', 30_000);
    const cycleB = await addPost('local', 30_001, cycleA.uri);
    await env.DB.prepare('UPDATE local_posts SET inReplyToUri = ? WHERE postId = ?').bind(cycleB.uri, cycleA.postId)
      .run();

    const deep = await resolve(chain[45].postId);
    const top = await resolve(chain[0].postId);
    const unfetched = await resolve(orphan.postId);
    const cycle = await resolve(cycleA.postId);

    expect(deep.ancestors).toEqual(chain.slice(5, 45).map((post) => post.postId));
    expect(top.descendants).toEqual(chain.slice(1, 21).map((post) => post.postId));
    expect(unfetched.ancestors).toEqual([]);
    expect(cycle).toEqual({ ancestors: [cycleB.postId], descendants: [cycleB.postId] });
  });

  it('子孫は 60 件で切り、古い順（同時刻は postId 順）の先頭を残す', async () => {
    const root = await addPost('local', 40_000);
    const replies: Array<Post & { createdAt: number }> = [];
    for (let n = 1; n <= 65; n++) {
      const createdAt = 41_000 + Math.floor(n / 4);
      replies.push({ ...await addPost('local', createdAt, root.uri), createdAt });
    }
    const expected = [...replies]
      .sort((a, b) => a.createdAt - b.createdAt || (a.postId < b.postId ? -1 : 1))
      .slice(0, 60)
      .map((post) => post.postId);

    const result = await resolve(root.postId);

    expect(result.descendants).toEqual(expected);
  });
});
