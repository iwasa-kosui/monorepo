import { Block, Follow, Reject, Undo } from '@fedify/vocab';
import { describe, expect, it } from 'vitest';

import { RelationshipSchema } from '../../mastodon/entities.ts';
import { setupReadApi } from './helper/mastodonReadHarness.ts';
import { ORIGIN } from './helper/oauthHarness.ts';

const notFound = { error: 'Record not found' };

const seedActions = async () => {
  const t = setupReadApi();
  const me = await t.signIn('read write');
  const alice = t.seed.addRemoteActor('alice');
  const other = t.seed.addLocalActor('other');
  const post = (path: string, headers: Record<string, string> = me.bearer) =>
    t.request(path, { method: 'POST', headers });
  const count = (table: string, where = '1=1') =>
    Number((t.sqlite.prepare(`SELECT count(*) AS n FROM ${table} WHERE ${where}`).get() as { n: number | bigint }).n);
  const sentActivities = () => t.federation.sendActivity.mock.calls.map((call) => (call as unknown[])[2]);
  return { ...t, me, alice, other, post, count, sentActivities };
};

describe('POST /api/v1/accounts/:id/follow と /unfollow', () => {
  it('リモートのアカウントをフォローし、following が true の Relationship を返して Follow を送る', async () => {
    const t = await seedActions();

    const response = await t.post(`/api/v1/accounts/${t.alice.actorId}/follow`);

    expect(response.status).toBe(200);
    expect(RelationshipSchema.parse(await response.json())).toMatchObject({
      id: t.alice.actorId,
      following: true,
      followed_by: false,
      muting: false,
      requested: false,
    });
    expect(t.count('follows', `followerId='${t.me.actorId}' AND followingId='${t.alice.actorId}'`)).toBe(1);
    expect(t.sentActivities()).toHaveLength(1);
    expect(t.sentActivities()[0]).toBeInstanceOf(Follow);
  });

  it('フォロー済みでもエラーにせず、現在の Relationship を返して何も送らない', async () => {
    const t = await seedActions();
    t.seed.addFollow(t.me.actorId, t.alice.actorId);
    t.seed.addFollow(t.alice.actorId, t.me.actorId);

    const response = await t.post(`/api/v1/accounts/${t.alice.actorId}/follow`);

    expect(response.status).toBe(200);
    expect(RelationshipSchema.parse(await response.json())).toMatchObject({ following: true, followed_by: true });
    expect(t.count('follows')).toBe(2);
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
  });

  it('フォローを外し、following が false の Relationship を返して Undo を送る', async () => {
    const t = await seedActions();
    t.seed.addFollow(t.me.actorId, t.alice.actorId);

    const response = await t.post(`/api/v1/accounts/${t.alice.actorId}/unfollow`);

    expect(response.status).toBe(200);
    expect(RelationshipSchema.parse(await response.json())).toMatchObject({ id: t.alice.actorId, following: false });
    expect(t.count('follows')).toBe(0);
    expect(t.sentActivities()[0]).toBeInstanceOf(Undo);
  });

  it('自分自身は 422 にする', async () => {
    const t = await seedActions();

    const responses = await Promise.all([
      t.post(`/api/v1/accounts/${t.me.actorId}/follow`),
      t.post(`/api/v1/accounts/${t.me.actorId}/unfollow`),
    ]);

    expect(responses.map((response) => response.status)).toEqual([422, 422]);
    expect(await responses[0]!.json()).toEqual({
      error: 'Validation failed: The action cannot target your own account',
    });
    expect(t.count('follows')).toBe(0);
  });

  it('ほかのローカルのアカウントは既存のドメインで扱えないので 422 にする', async () => {
    const t = await seedActions();

    const responses = await Promise.all([
      t.post(`/api/v1/accounts/${t.other.actorId}/follow`),
      t.post(`/api/v1/accounts/${t.other.actorId}/unfollow`),
    ]);

    expect(responses.map((response) => response.status)).toEqual([422, 422]);
    expect(await responses[0]!.json()).toEqual({
      error: 'Validation failed: The action is not supported for local accounts',
    });
    expect(t.count('follows')).toBe(0);
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
  });

  it('存在しないアカウントと不正な ID は 404 にする', async () => {
    const t = await seedActions();

    const responses = await Promise.all([
      t.post(`/api/v1/accounts/${t.seed.uuid()}/follow`),
      t.post('/api/v1/accounts/not-an-id/unfollow'),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404]);
    expect(await responses[0]!.json()).toEqual(notFound);
  });

  it('トークンがないと 401、write:follows を満たさないスコープは 403 にする', async () => {
    const t = await seedActions();
    const readOnly = await t.bearerFor('read');
    const mutesOnly = await t.bearerFor('write:mutes');

    const responses = await Promise.all([
      t.request(`/api/v1/accounts/${t.alice.actorId}/follow`, { method: 'POST' }),
      t.post(`/api/v1/accounts/${t.alice.actorId}/follow`, { Authorization: 'Bearer invalid' }),
      t.post(`/api/v1/accounts/${t.alice.actorId}/follow`, readOnly),
      t.post(`/api/v1/accounts/${t.alice.actorId}/unfollow`, mutesOnly),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 403, 403]);
    expect(t.count('follows')).toBe(0);
  });
});

describe('POST /api/v1/accounts/:id/mute と /unmute', () => {
  it('ミュートして、muting が true の Relationship を返す', async () => {
    const t = await seedActions();

    const response = await t.post(`/api/v1/accounts/${t.alice.actorId}/mute`);

    expect(response.status).toBe(200);
    expect(RelationshipSchema.parse(await response.json())).toMatchObject({
      id: t.alice.actorId,
      muting: true,
      following: false,
    });
    expect(t.count('mutes', `userId='${t.me.userId}' AND mutedActorId='${t.alice.actorId}'`)).toBe(1);
  });

  it('ミュートを外し、muting が false の Relationship を返す', async () => {
    const t = await seedActions();
    t.seed.addMute(t.me.userId, t.alice.actorId);

    const response = await t.post(`/api/v1/accounts/${t.alice.actorId}/unmute`);

    expect(response.status).toBe(200);
    expect(RelationshipSchema.parse(await response.json())).toMatchObject({ muting: false });
    expect(t.count('mutes')).toBe(0);
  });
});

describe('POST /api/v1/accounts/:id/block と /unblock', () => {
  it('リモートのアカウントをブロックし、blocking が true の Relationship を返して Block を送る', async () => {
    const t = await seedActions();

    const response = await t.post(`/api/v1/accounts/${t.alice.actorId}/block`);

    expect(response.status).toBe(200);
    expect(RelationshipSchema.parse(await response.json())).toMatchObject({
      id: t.alice.actorId,
      blocking: true,
      blocked_by: false,
      following: false,
    });
    expect(t.count('blocks', `userId='${t.me.userId}' AND blockedActorId='${t.alice.actorId}'`)).toBe(1);
    expect(t.count('domain_events', `eventName='block.blockCreated'`)).toBe(1);
    expect(t.sentActivities()).toHaveLength(1);
    const sent = t.sentActivities()[0] as Block;
    expect(sent).toBeInstanceOf(Block);
    expect(sent.actorId?.href).toBe(`${ORIGIN}/users/kosui`);
    expect(sent.objectId?.href).toBe('https://remote.example/users/alice');
    const blockId = (t.sqlite.prepare('SELECT blockId FROM blocks').get() as { blockId: string }).blockId;
    expect(sent.id?.href).toBe(`${ORIGIN}/users/kosui#blocks/${blockId}`);
  });

  it('ブロックしている相手へのフォローを外し、Undo(Follow) のあとに Block を送る', async () => {
    const t = await seedActions();
    t.seed.addFollow(t.me.actorId, t.alice.actorId);

    const response = await t.post(`/api/v1/accounts/${t.alice.actorId}/block`);

    expect(response.status).toBe(200);
    expect(RelationshipSchema.parse(await response.json())).toMatchObject({ blocking: true, following: false });
    expect(t.count('follows')).toBe(0);
    const [undo, block] = t.sentActivities();
    expect(undo).toBeInstanceOf(Undo);
    expect(await (undo as Undo).getObject()).toBeInstanceOf(Follow);
    expect(block).toBeInstanceOf(Block);
    expect(t.sentActivities()).toHaveLength(2);
  });

  it('相手から自分へのフォローを外し、Reject(Follow) のあとに Block を送る', async () => {
    const t = await seedActions();
    t.seed.addFollow(t.alice.actorId, t.me.actorId);

    const response = await t.post(`/api/v1/accounts/${t.alice.actorId}/block`);

    expect(response.status).toBe(200);
    expect(RelationshipSchema.parse(await response.json())).toMatchObject({ blocking: true, followed_by: false });
    expect(t.count('follows')).toBe(0);
    const [reject, block] = t.sentActivities();
    expect(reject).toBeInstanceOf(Reject);
    const rejected = await (reject as Reject).getObject() as Follow;
    expect(rejected).toBeInstanceOf(Follow);
    expect(rejected.actorId?.href).toBe('https://remote.example/users/alice');
    expect(rejected.objectId?.href).toBe(`${ORIGIN}/users/kosui`);
    expect(block).toBeInstanceOf(Block);
    expect(t.sentActivities()).toHaveLength(2);
  });

  it('ブロック済みでもエラーにせず、blocks を増やさず、残っていたフォローを外して Block を送り直す', async () => {
    const t = await seedActions();
    const existing = t.seed.addBlock(t.me.userId, t.alice.actorId);
    t.seed.addFollow(t.me.actorId, t.alice.actorId);

    const response = await t.post(`/api/v1/accounts/${t.alice.actorId}/block`);

    expect(response.status).toBe(200);
    expect(RelationshipSchema.parse(await response.json())).toMatchObject({ blocking: true, following: false });
    expect(t.count('blocks')).toBe(1);
    expect(t.count('domain_events', `eventName='block.blockCreated'`)).toBe(0);
    expect(t.count('follows')).toBe(0);
    const [undo, block] = t.sentActivities();
    expect(undo).toBeInstanceOf(Undo);
    expect(block).toBeInstanceOf(Block);
    expect((block as Block).id?.href).toBe(`${ORIGIN}/users/kosui#blocks/${existing.blockId}`);
    expect(t.sentActivities()).toHaveLength(2);
  });

  it('ブロックを外し、blocking が false の Relationship を返して Undo(Block) を送り、フォローは戻さない', async () => {
    const t = await seedActions();
    const existing = t.seed.addBlock(t.me.userId, t.alice.actorId);

    const response = await t.post(`/api/v1/accounts/${t.alice.actorId}/unblock`);

    expect(response.status).toBe(200);
    expect(RelationshipSchema.parse(await response.json())).toMatchObject({
      id: t.alice.actorId,
      blocking: false,
      following: false,
    });
    expect(t.count('blocks')).toBe(0);
    expect(t.count('follows')).toBe(0);
    expect(t.count('domain_events', `eventName='block.blockDeleted'`)).toBe(1);
    expect(t.sentActivities()).toHaveLength(1);
    const undo = t.sentActivities()[0] as Undo;
    expect(undo).toBeInstanceOf(Undo);
    const object = await undo.getObject();
    expect(object).toBeInstanceOf(Block);
    expect(undo.id?.href).toBe(`${ORIGIN}/users/kosui#undo-blocks/${existing.blockId}`);
    expect(object?.id?.href).toBe(`${ORIGIN}/users/kosui#blocks/${existing.blockId}`);
  });

  it('ローカルのアカウントはブロックとフォロー解除だけを行い、何も送らない', async () => {
    const t = await seedActions();
    t.seed.addFollow(t.me.actorId, t.other.actorId);
    t.seed.addFollow(t.other.actorId, t.me.actorId);

    const blocked = await t.post(`/api/v1/accounts/${t.other.actorId}/block`);

    expect(blocked.status).toBe(200);
    expect(RelationshipSchema.parse(await blocked.json())).toMatchObject({
      blocking: true,
      following: false,
      followed_by: false,
    });
    expect(t.count('blocks')).toBe(1);
    expect(t.count('follows')).toBe(0);

    const unblocked = await t.post(`/api/v1/accounts/${t.other.actorId}/unblock`);

    expect(unblocked.status).toBe(200);
    expect(t.count('blocks')).toBe(0);
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
  });

  it('GET /accounts/relationships の blocking にブロックを反映する', async () => {
    const t = await seedActions();
    t.seed.addBlock(t.me.userId, t.alice.actorId);

    const response = await t.request(
      `/api/v1/accounts/relationships?id[]=${t.alice.actorId}&id[]=${t.other.actorId}`,
      { headers: t.me.bearer },
    );

    expect(response.status).toBe(200);
    expect((await response.json() as unknown[]).map((item) => RelationshipSchema.parse(item))).toMatchObject([
      { id: t.alice.actorId, blocking: true, blocked_by: false },
      { id: t.other.actorId, blocking: false },
    ]);
  });
});
