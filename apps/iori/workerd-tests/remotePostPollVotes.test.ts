import { env } from 'cloudflare:test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createD1Db } from '../src/adaptor/d1/client.ts';
import { createD1PostCreatedStore } from '../src/adaptor/d1/post/postCreatedStore.ts';
import { createD1PostDeletedStore } from '../src/adaptor/d1/post/postDeletedStore.ts';
import { createD1RemotePostPollsResolverByPostIds } from '../src/adaptor/d1/post/remotePostPollsResolverByPostIds.ts';
import { createD1RemotePostPollVotedStore } from '../src/adaptor/d1/post/remotePostPollVotedStore.ts';
import { createD1RemotePostPollVotesResolverByPostIds } from '../src/adaptor/d1/post/remotePostPollVotesResolverByPostIds.ts';
import { ActorId } from '../src/domain/actor/actorId.ts';
import { Instant } from '../src/domain/instant/instant.ts';
import { Post } from '../src/domain/post/post.ts';
import type { PostId } from '../src/domain/post/postId.ts';
import type { RemotePostPoll } from '../src/domain/post/remotePostPoll.ts';
import { RemotePostPollVote } from '../src/domain/post/remotePostPollVote.ts';

const db = createD1Db(env.DB);
const remoteActorId = crypto.randomUUID();
const voterActorId = crypto.randomUUID();

const poll = (overrides: Partial<RemotePostPoll> = {}): RemotePostPoll => ({
  multiple: true,
  options: [{ title: '赤', votesCount: 3 }, { title: '青', votesCount: 5 }, { title: '緑', votesCount: 0 }],
  votersCount: 8,
  expiresAt: Instant.orThrow(4_000_000_000_000),
  closed: false,
  ...overrides,
});

const createRemote = (pollValue: RemotePostPoll) =>
  Post.createRemotePost(Instant.now())({
    actorId: ActorId.orThrow(remoteActorId),
    content: '<p>q</p>',
    uri: `https://remote.example/notes/${crypto.randomUUID()}`,
    visibility: null,
    poll: pollValue,
  });

const vote = (postId: PostId, choices: number[]) => {
  const voted = RemotePostPollVote.vote(
    { postId, actorId: ActorId.orThrow(voterActorId), choices },
    poll(),
    [],
    Instant.now(),
  );
  if (!voted.ok) throw new Error(voted.err.message);
  return voted.val;
};

const resolvePoll = async (postId: PostId) => {
  const resolved = await createD1RemotePostPollsResolverByPostIds(db).resolve([postId]);
  if (!resolved.ok) throw new Error('unreachable');
  return resolved.val.get(postId);
};

const resolveOwnVotes = async (postId: PostId) => {
  const resolved = await createD1RemotePostPollVotesResolverByPostIds(db).resolve({
    actorId: ActorId.orThrow(voterActorId),
    postIds: [postId],
  });
  if (!resolved.ok) throw new Error('unreachable');
  return resolved.val.get(postId);
};

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').bind(
      remoteActorId,
      'https://remote.example/users/remote-post-poll-votes',
      'https://remote.example/users/remote-post-poll-votes/inbox',
      'remote',
    ),
    env.DB.prepare('INSERT INTO remote_actors(actorId,url,username) VALUES (?,?,?)').bind(
      remoteActorId,
      'https://remote.example/@remote-post-poll-votes',
      'remote-post-poll-votes',
    ),
    env.DB.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').bind(
      voterActorId,
      'https://remote.example/users/remote-post-poll-voter',
      'https://remote.example/users/remote-post-poll-voter/inbox',
      'remote',
    ),
  ]);
});

afterAll(async () => {
  const ownPosts = '(SELECT postId FROM posts WHERE actorId = ?)';
  await env.DB.batch([
    env.DB.prepare(`DELETE FROM remote_post_poll_votes WHERE postId IN ${ownPosts}`).bind(remoteActorId),
    env.DB.prepare(`DELETE FROM remote_post_polls WHERE postId IN ${ownPosts}`).bind(remoteActorId),
    env.DB.prepare(`DELETE FROM remote_posts WHERE postId IN ${ownPosts}`).bind(remoteActorId),
    env.DB.prepare(`DELETE FROM domain_events WHERE aggregateId IN ${ownPosts}`).bind(remoteActorId),
    env.DB.prepare(`DELETE FROM domain_events WHERE aggregateName = 'remotePostPollVote' AND aggregateId LIKE ?`).bind(
      `%${voterActorId}%`,
    ),
    env.DB.prepare('DELETE FROM posts WHERE actorId = ?').bind(remoteActorId),
    env.DB.prepare('DELETE FROM remote_actors WHERE actorId = ?').bind(remoteActorId),
    env.DB.prepare('DELETE FROM actors WHERE actorId IN (?, ?)').bind(remoteActorId, voterActorId),
  ]);
});

describe('remote_post_poll_votes on workerd D1', () => {
  it('migration の後に、投票の記録を保存して読み出せる', async () => {
    const created = createRemote(poll());
    await createD1PostCreatedStore(db).store(created);
    const { postId } = created.aggregateState;

    await createD1RemotePostPollVotedStore(db).store(vote(postId, [2, 0]));

    expect(await resolveOwnVotes(postId)).toEqual([0, 2]);
  });

  it('投票の記録と一緒に、選んだ選択肢の votesCount と votersCount を増やす', async () => {
    const created = createRemote(poll());
    await createD1PostCreatedStore(db).store(created);
    const { postId } = created.aggregateState;

    await createD1RemotePostPollVotedStore(db).store(vote(postId, [1]));

    expect(await resolvePoll(postId)).toEqual(poll({
      options: [{ title: '赤', votesCount: 3 }, { title: '青', votesCount: 6 }, { title: '緑', votesCount: 0 }],
      votersCount: 9,
    }));
  });

  it('同じ利用者の 2 回目の保存は何も書かず、written を false で返し、票数を増やさない', async () => {
    const created = createRemote(poll());
    await createD1PostCreatedStore(db).store(created);
    const { postId } = created.aggregateState;
    await createD1RemotePostPollVotedStore(db).store(vote(postId, [1]));

    const second = await createD1RemotePostPollVotedStore(db).store(vote(postId, [1]));

    expect(second).toMatchObject({ ok: true, val: { written: false } });
    expect((await resolvePoll(postId))?.votersCount).toBe(9);
    expect(await resolveOwnVotes(postId)).toEqual([1]);
  });

  it('投票していない投稿は、自分の投票を読み出さない', async () => {
    const created = createRemote(poll());
    await createD1PostCreatedStore(db).store(created);

    expect(await resolveOwnVotes(created.aggregateState.postId)).toBeUndefined();
  });

  it('投稿を削除すると、投票の記録の行も消える', async () => {
    const created = createRemote(poll());
    await createD1PostCreatedStore(db).store(created);
    const { postId } = created.aggregateState;
    await createD1RemotePostPollVotedStore(db).store(vote(postId, [1]));

    await createD1PostDeletedStore(db).store(Post.deletePost(Instant.now())(postId));

    expect(await resolveOwnVotes(postId)).toBeUndefined();
  });
});
