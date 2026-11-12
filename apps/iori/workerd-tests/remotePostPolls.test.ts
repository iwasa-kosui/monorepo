import { env } from 'cloudflare:test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createD1Db } from '../src/adaptor/d1/client.ts';
import { createD1PostCreatedStore } from '../src/adaptor/d1/post/postCreatedStore.ts';
import { createD1PostDeletedStore } from '../src/adaptor/d1/post/postDeletedStore.ts';
import { createD1RemotePostPollsResolverByPostIds } from '../src/adaptor/d1/post/remotePostPollsResolverByPostIds.ts';
import { createD1RemotePostUpdatedStore } from '../src/adaptor/d1/post/remotePostUpdatedStore.ts';
import { ActorId } from '../src/domain/actor/actorId.ts';
import { Instant } from '../src/domain/instant/instant.ts';
import { Post } from '../src/domain/post/post.ts';
import type { RemotePostPoll } from '../src/domain/post/remotePostPoll.ts';

const db = createD1Db(env.DB);
const actorId = crypto.randomUUID();

const poll = (overrides: Partial<RemotePostPoll> = {}): RemotePostPoll => ({
  multiple: false,
  options: [{ title: '赤', votesCount: 3 }, { title: '青', votesCount: 5 }],
  votersCount: 8,
  expiresAt: Instant.orThrow(4_000_000_000_000),
  closed: false,
  ...overrides,
});

const createRemote = (pollValue?: RemotePostPoll) =>
  Post.createRemotePost(Instant.now())({
    actorId: ActorId.orThrow(actorId),
    content: '<p>q</p>',
    uri: `https://remote.example/notes/${crypto.randomUUID()}`,
    visibility: null,
    poll: pollValue,
  });

const resolvePoll = async (postId: string) => {
  const resolved = await createD1RemotePostPollsResolverByPostIds(db).resolve([postId as never]);
  if (!resolved.ok) throw new Error('unreachable');
  return resolved.val.get(postId as never);
};

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO actors(actorId,uri,inboxUrl,type) VALUES (?,?,?,?)').bind(
      actorId,
      'https://remote.example/users/remote-post-polls',
      'https://remote.example/users/remote-post-polls/inbox',
      'remote',
    ),
    env.DB.prepare('INSERT INTO remote_actors(actorId,url,username) VALUES (?,?,?)').bind(
      actorId,
      'https://remote.example/@remote-post-polls',
      'remote-post-polls',
    ),
  ]);
});

afterAll(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM remote_post_polls WHERE postId IN (SELECT postId FROM posts WHERE actorId = ?)').bind(
      actorId,
    ),
    env.DB.prepare('DELETE FROM remote_posts WHERE postId IN (SELECT postId FROM posts WHERE actorId = ?)').bind(
      actorId,
    ),
    env.DB.prepare('DELETE FROM domain_events WHERE aggregateId IN (SELECT postId FROM posts WHERE actorId = ?)').bind(
      actorId,
    ),
    env.DB.prepare('DELETE FROM posts WHERE actorId = ?').bind(actorId),
    env.DB.prepare('DELETE FROM remote_actors WHERE actorId = ?').bind(actorId),
    env.DB.prepare('DELETE FROM actors WHERE actorId = ?').bind(actorId),
  ]);
});

describe('remote_post_polls on workerd D1', () => {
  it('migration の後に、Question の投稿と一緒に投票を保存して読み出せる', async () => {
    const event = createRemote(poll({ multiple: true, votersCount: null }));

    await createD1PostCreatedStore(db).store(event);

    expect(await resolvePoll(event.aggregateState.postId)).toEqual(poll({ multiple: true, votersCount: null }));
  });

  it('投票の無い投稿は、投票を読み出さない', async () => {
    const event = createRemote();

    await createD1PostCreatedStore(db).store(event);

    expect(await resolvePoll(event.aggregateState.postId)).toBeUndefined();
  });

  it('Update で票数・投票者数・締め切り・closed を上書きする', async () => {
    const created = createRemote(poll());
    await createD1PostCreatedStore(db).store(created);
    const next = poll({
      options: [{ title: '赤', votesCount: 10 }, { title: '青', votesCount: 6 }],
      votersCount: 16,
      expiresAt: null,
      closed: true,
    });

    const result = await createD1RemotePostUpdatedStore(db).store(
      Post.updateRemotePost(Instant.now())(created.aggregateState, {
        content: '<p>q2</p>',
        summary: null,
        sensitive: false,
        editedAt: Instant.orThrow(5_000),
        visibility: null,
        recipientActorUris: [],
        previousRecipientActorUris: [],
        images: [],
        poll: next,
      }),
    );

    expect(result).toMatchObject({ ok: true, val: { written: true } });
    expect(await resolvePoll(created.aggregateState.postId)).toEqual(next);
  });

  it('投稿を削除すると、投票の行も消える', async () => {
    const created = createRemote(poll());
    await createD1PostCreatedStore(db).store(created);

    await createD1PostDeletedStore(db).store(Post.deletePost(Instant.now())(created.aggregateState.postId));

    expect(await resolvePoll(created.aggregateState.postId)).toBeUndefined();
  });
});
