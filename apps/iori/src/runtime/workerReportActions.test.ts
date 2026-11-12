import { Flag } from '@fedify/vocab';
import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { ActorId } from '../domain/actor/actorId.ts';
import type { LocalActor } from '../domain/actor/localActor.ts';
import type { RemoteActor } from '../domain/actor/remoteActor.ts';
import { Instant } from '../domain/instant/instant.ts';
import type { Post } from '../domain/post/post.ts';
import { PostId } from '../domain/post/postId.ts';
import type { User } from '../domain/user/user.ts';
import { UserId } from '../domain/user/userId.ts';
import type { Username } from '../domain/user/username.ts';
import { createWorkerReportAction } from './workerReportActions.ts';

const setup = () => {
  const userId = UserId.generate();
  const reporter: LocalActor = {
    id: ActorId.generate(),
    userId,
    uri: 'https://blog.test/users/kosui',
    inboxUrl: 'https://blog.test/users/kosui/inbox',
    type: 'local',
  };
  const target: RemoteActor = {
    id: ActorId.generate(),
    uri: 'https://remote.test/users/reader',
    inboxUrl: 'https://remote.test/users/reader/inbox',
    type: 'remote',
    username: 'reader',
  };
  const localOther: LocalActor = {
    id: ActorId.generate(),
    userId: UserId.generate(),
    uri: 'https://blog.test/users/other',
    inboxUrl: 'https://blog.test/users/other/inbox',
    type: 'local',
  };
  const otherRemote: RemoteActor = { ...target, id: ActorId.generate(), uri: 'https://remote.test/users/other' };
  const remotePost = (actorId: ActorId, uri: string): Post => ({
    type: 'remote',
    postId: PostId.generate(),
    actorId,
    content: 'hi',
    createdAt: Instant.orThrow(1),
    uri,
    inReplyToUri: null,
    visibility: null,
    summary: null,
    sensitive: false,
  });
  const ownPost = remotePost(target.id, 'https://remote.test/notes/1');
  const secondPost = remotePost(target.id, 'https://remote.test/notes/2');
  const strangerPost = remotePost(otherRemote.id, 'https://remote.test/notes/3');
  const localPost: Post = {
    type: 'local',
    visibility: 'public',
    postId: PostId.generate(),
    actorId: target.id,
    content: 'hi',
    createdAt: Instant.orThrow(1),
    userId,
    inReplyToUri: null,
    summary: null,
    sensitive: false,
  };
  const posts = new Map<string, Post>(
    [ownPost, secondPost, strangerPost, localPost].map((post) => [post.postId, post]),
  );
  const actors = new Map<string, LocalActor | RemoteActor>(
    [reporter, target, localOther, otherRemote].map((actor) => [actor.id, actor]),
  );
  const user: User = { id: userId, username: 'kosui' as Username };
  const reportSubmittedStore = { store: vi.fn(async () => RA.ok(undefined)) };
  const sendActivity = vi.fn(async () => undefined);
  const action = createWorkerReportAction({
    userResolver: { resolve: vi.fn(async () => RA.ok(user)) },
    actorResolverByUserId: { resolve: vi.fn(async () => RA.ok(reporter)) },
    actorResolverById: { resolve: vi.fn(async (id: ActorId) => RA.ok(actors.get(id))) },
    postResolver: { resolve: vi.fn(async (id: PostId) => RA.ok(posts.get(id))) },
    reportSubmittedStore,
  });
  const ctx = {
    getActorUri: vi.fn((username: string) => new URL(`https://actor.test/users/${username}`)),
    sendActivity,
  } as never;
  return {
    userId,
    reporter,
    target,
    localOther,
    ownPost,
    secondPost,
    strangerPost,
    localPost,
    reportSubmittedStore,
    sendActivity,
    action,
    ctx,
  };
};

describe('createWorkerReportAction', () => {
  it('リモートのアカウントへの通報をイベントとして保存し、相手の inbox へ Flag を送る', async () => {
    const t = setup();

    const reported = await t.action({
      userId: t.userId,
      actorId: t.target.id,
      statusIds: [t.ownPost.postId, t.secondPost.postId],
      category: 'offensive',
      comment: '攻撃的です',
      forward: true,
      ctx: t.ctx,
    });

    expect(reported.ok).toBe(true);
    expect(t.reportSubmittedStore.store).toHaveBeenCalledOnce();
    const [event] = (t.reportSubmittedStore.store.mock.calls as unknown as unknown[][])[0] as [
      { eventName: string; eventPayload: Record<string, unknown> },
    ];
    expect(event).toMatchObject({
      eventName: 'report.reportSubmitted',
      eventPayload: {
        userId: t.userId,
        targetActorId: t.target.id,
        statusIds: [t.ownPost.postId, t.secondPost.postId],
        category: 'offensive',
        comment: '攻撃的です',
        forwarded: true,
      },
    });
    expect(t.sendActivity).toHaveBeenCalledOnce();
    const [sender, recipient, activity] = (t.sendActivity.mock.calls as unknown as unknown[][])[0] as [
      unknown,
      unknown,
      Flag,
    ];
    expect(sender).toEqual({ username: 'kosui' });
    expect(recipient).toEqual({ id: new URL(t.target.uri), inboxId: new URL(t.target.inboxUrl) });
    expect(activity).toBeInstanceOf(Flag);
    expect(activity.id?.href).toBe(`https://actor.test/users/kosui#flags/${event.eventPayload['reportId']}`);
    expect(activity.actorId?.href).toBe('https://actor.test/users/kosui');
    expect(activity.objectIds.map((id) => id.href)).toEqual([
      t.target.uri,
      'https://remote.test/notes/1',
      'https://remote.test/notes/2',
    ]);
    expect(activity.content).toBe('不快・攻撃的な内容\n攻撃的です');
  });

  it('forward が偽のときは通報をイベントとして保存するだけで、Flag を送らず、forwarded を偽にする', async () => {
    const t = setup();

    const reported = await t.action({
      userId: t.userId,
      actorId: t.target.id,
      statusIds: [t.ownPost.postId],
      category: 'spam',
      comment: '宣伝ばかりです',
      forward: false,
      ctx: t.ctx,
    });

    expect(reported.ok && reported.val.report.forwarded).toBe(false);
    expect(t.reportSubmittedStore.store).toHaveBeenCalledOnce();
    expect(
      ((t.reportSubmittedStore.store.mock.calls as unknown as unknown[][])[0]![0] as {
        eventPayload: Record<string, unknown>;
      }).eventPayload['forwarded'],
    ).toBe(false);
    expect(t.sendActivity).not.toHaveBeenCalled();
  });

  it('forward が真のときは forwarded を真にして返す', async () => {
    const t = setup();

    const reported = await t.action({
      userId: t.userId,
      actorId: t.target.id,
      statusIds: [],
      category: 'spam',
      comment: '',
      forward: true,
      ctx: t.ctx,
    });

    expect(reported.ok && reported.val.report.forwarded).toBe(true);
    expect(t.sendActivity).toHaveBeenCalledOnce();
  });

  it('保存してから送る', async () => {
    const t = setup();
    const order: string[] = [];
    t.reportSubmittedStore.store.mockImplementation(async () => {
      order.push('store');
      return RA.ok(undefined);
    });
    t.sendActivity.mockImplementation(async () => {
      order.push('send');
    });

    await t.action({
      userId: t.userId,
      actorId: t.target.id,
      statusIds: [],
      category: 'spam',
      comment: '',
      forward: true,
      ctx: t.ctx,
    });

    expect(order).toEqual(['store', 'send']);
  });

  it('投稿を指定しなければ object は相手のアカウントだけで、comment が空なら本文は理由のラベルだけにする', async () => {
    const t = setup();

    await t.action({
      userId: t.userId,
      actorId: t.target.id,
      statusIds: [],
      category: 'spam',
      comment: '',
      forward: true,
      ctx: t.ctx,
    });

    const activity = (t.sendActivity.mock.calls as unknown as unknown[][])[0]![2] as Flag;
    expect(activity.objectIds.map((id) => id.href)).toEqual([t.target.uri]);
    expect(activity.content).toBe('スパム');
  });

  it('同じ投稿を重ねて指定しても 1 回だけ入れる', async () => {
    const t = setup();

    await t.action({
      userId: t.userId,
      actorId: t.target.id,
      statusIds: [t.ownPost.postId, t.ownPost.postId],
      category: 'other',
      comment: '',
      forward: true,
      ctx: t.ctx,
    });

    const activity = (t.sendActivity.mock.calls as unknown as unknown[][])[0]![2] as Flag;
    expect(activity.objectIds).toHaveLength(2);
    expect(activity.content).toBe('その他');
  });

  it('ローカルの相手は通報できず、保存も送信もしない', async () => {
    const t = setup();

    const reported = await t.action({
      userId: t.userId,
      actorId: t.localOther.id,
      statusIds: [],
      category: 'spam',
      comment: '',
      forward: true,
      ctx: t.ctx,
    });

    expect(!reported.ok && reported.err.type).toBe('CannotReportLocalActorError');
    expect(t.reportSubmittedStore.store).not.toHaveBeenCalled();
    expect(t.sendActivity).not.toHaveBeenCalled();
  });

  it('自分自身は通報できない', async () => {
    const t = setup();

    const reported = await t.action({
      userId: t.userId,
      actorId: t.reporter.id,
      statusIds: [],
      category: 'spam',
      comment: '',
      forward: true,
      ctx: t.ctx,
    });

    expect(!reported.ok && reported.err.type).toBe('CannotReportSelfError');
    expect(t.reportSubmittedStore.store).not.toHaveBeenCalled();
    expect(t.sendActivity).not.toHaveBeenCalled();
  });

  it('存在しないアカウントは TargetNotFoundError にする', async () => {
    const t = setup();

    const reported = await t.action({
      userId: t.userId,
      actorId: ActorId.generate(),
      statusIds: [],
      category: 'spam',
      comment: '',
      forward: true,
      ctx: t.ctx,
    });

    expect(!reported.ok && reported.err.type).toBe('TargetNotFoundError');
  });

  it.each([
    ['他のアカウントの投稿', (t: ReturnType<typeof setup>) => t.strangerPost.postId],
    ['ローカルの投稿', (t: ReturnType<typeof setup>) => t.localPost.postId],
    ['存在しない投稿', () => PostId.generate()],
  ])('%s を指定すると保存も送信もしない', async (_name, pick) => {
    const t = setup();

    const reported = await t.action({
      userId: t.userId,
      actorId: t.target.id,
      statusIds: [t.ownPost.postId, pick(t)],
      category: 'spam',
      comment: '',
      forward: true,
      ctx: t.ctx,
    });

    expect(!reported.ok && reported.err.type).toBe('ReportedStatusNotFoundError');
    expect(t.reportSubmittedStore.store).not.toHaveBeenCalled();
    expect(t.sendActivity).not.toHaveBeenCalled();
  });

  it('comment が 1000 文字を超えると InvalidReportError にして、保存も送信もしない', async () => {
    const t = setup();

    const reported = await t.action({
      userId: t.userId,
      actorId: t.target.id,
      statusIds: [],
      category: 'spam',
      comment: 'a'.repeat(1001),
      forward: true,
      ctx: t.ctx,
    });

    expect(!reported.ok && reported.err.type).toBe('InvalidReportError');
    expect(t.reportSubmittedStore.store).not.toHaveBeenCalled();
    expect(t.sendActivity).not.toHaveBeenCalled();
  });
});
