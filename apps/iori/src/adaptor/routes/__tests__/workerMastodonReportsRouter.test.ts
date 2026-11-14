import { Flag } from '@fedify/vocab';
import { Hono } from 'hono';
import { describe, expect, it, vi } from 'vitest';

import { ActorId } from '../../../domain/actor/actorId.ts';
import { UserId } from '../../../domain/user/userId.ts';
import { ReportSchema } from '../../mastodon/entities.ts';
import { createWorkerMastodonReportsRouter } from '../workerMastodonReportsRouter.ts';
import { setupReadApi } from './helper/mastodonReadHarness.ts';
import { ORIGIN } from './helper/oauthHarness.ts';

const seedReports = async (scope = 'read write') => {
  const t = setupReadApi();
  const me = await t.signIn(scope);
  const alice = t.seed.addRemoteActor('alice');
  const bob = t.seed.addRemoteActor('bob', 'other.example');
  const other = t.seed.addLocalActor('other');
  const alicePost = t.seed.addRemotePost(alice, 1_000);
  const bobPost = t.seed.addRemotePost(bob, 2_000);
  const ownPost = t.seed.addLocalPost(me, 3_000);
  const json = (body: unknown, headers: Record<string, string> = me.bearer) =>
    t.request('/api/v1/reports', {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const events = () =>
    t.sqlite.prepare('SELECT eventName, eventPayload, aggregateState FROM domain_events WHERE eventName = ?').all(
      'report.reportSubmitted',
    ) as Array<{ eventName: string; eventPayload: string; aggregateState: string }>;
  const sent = () => t.federation.sendActivity.mock.calls.map((call) => (call as unknown[])[2]);
  return { ...t, me, alice, bob, other, alicePost, bobPost, ownPost, json, events, sent };
};

describe('POST /api/v1/reports', () => {
  it('リモートのアカウントを通報し、Report を返して、イベントを保存して Flag を送る', async () => {
    const t = await seedReports();

    const response = await t.json({
      account_id: t.alice.actorId,
      status_ids: [t.alicePost.postId],
      comment: '宣伝ばかりです',
      category: 'spam',
      forward: true,
    });

    expect(response.status).toBe(200);
    const report = ReportSchema.parse(await response.json());
    expect(report).toMatchObject({
      action_taken: false,
      action_taken_at: null,
      category: 'spam',
      comment: '宣伝ばかりです',
      forwarded: true,
      status_ids: [t.alicePost.postId],
      rule_ids: null,
      target_account: { id: t.alice.actorId, acct: 'alice@remote.example' },
    });
    expect(Number.isNaN(Date.parse(report.created_at))).toBe(false);
    const [event, ...rest] = t.events();
    expect(rest).toEqual([]);
    expect(JSON.parse(event!.eventPayload)).toMatchObject({ reportId: report.id, targetActorId: t.alice.actorId });
    expect(t.sent()).toHaveLength(1);
    const flag = t.sent()[0] as Flag;
    expect(flag).toBeInstanceOf(Flag);
    expect(flag.id?.href).toBe(`${ORIGIN}/users/${t.me.username}#flags/${report.id}`);
    expect(flag.objectIds.map((id) => id.href)).toEqual([
      'https://remote.example/users/alice',
      t.alicePost.uri,
    ]);
    expect(flag.content).toBe('スパム\n宣伝ばかりです');
    expect((t.federation.sendActivity.mock.calls as unknown[][])[0]![1]).toEqual({
      id: new URL('https://remote.example/users/alice'),
      inboxId: new URL('https://remote.example/users/alice/inbox'),
    });
  });

  it.each([
    ['forward を省く', {}],
    ['forward が false', { forward: false }],
  ])('%s と、イベントだけ保存して Flag を送らず、forwarded を false にして返す', async (_name, extra) => {
    const t = await seedReports();

    const response = await t.json({ account_id: t.alice.actorId, status_ids: [t.alicePost.postId], ...extra });

    expect(response.status).toBe(200);
    expect(ReportSchema.parse(await response.json()).forwarded).toBe(false);
    expect(JSON.parse(t.events()[0]!.eventPayload)).toMatchObject({ forwarded: false });
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
  });

  it('category の violation は offensive として保存し、応答では violation に戻す', async () => {
    const t = await seedReports();

    const response = await t.json({ account_id: t.alice.actorId, category: 'violation', comment: '', forward: true });

    expect(ReportSchema.parse(await response.json()).category).toBe('violation');
    expect(JSON.parse(t.events()[0]!.eventPayload)).toMatchObject({ category: 'offensive' });
    expect((t.sent()[0] as Flag).content).toBe('不快・攻撃的な内容');
  });

  it('form でも受け付ける', async () => {
    const t = await seedReports();
    const form = new URLSearchParams({ account_id: t.alice.actorId, category: 'spam', comment: 'c' });
    form.append('status_ids[]', t.alicePost.postId);

    const response = await t.request('/api/v1/reports', {
      method: 'POST',
      headers: { ...t.me.bearer, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
    });

    expect(response.status).toBe(200);
    expect(ReportSchema.parse(await response.json())).toMatchObject({
      category: 'spam',
      comment: 'c',
      status_ids: [t.alicePost.postId],
    });
  });

  it('ローカルの相手と自分自身は 422 にして、保存も送信もしない', async () => {
    const t = await seedReports();

    const responses = await Promise.all([
      t.json({ account_id: t.other.actorId }),
      t.json({ account_id: t.me.actorId }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([422, 422]);
    expect(await responses[0]!.json()).toEqual({
      error: 'Validation failed: The report is not supported for local accounts',
    });
    expect(await responses[1]!.json()).toEqual({
      error: 'Validation failed: The report cannot target your own account',
    });
    expect(t.events()).toEqual([]);
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
  });

  it('他のアカウントの投稿、ローカルの投稿、存在しない投稿を含むと 422 にする', async () => {
    const t = await seedReports();

    const responses = await Promise.all([
      t.json({ account_id: t.alice.actorId, status_ids: [t.alicePost.postId, t.bobPost.postId] }),
      t.json({ account_id: t.alice.actorId, status_ids: [t.ownPost.postId] }),
      t.json({ account_id: t.alice.actorId, status_ids: [t.seed.uuid()] }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([422, 422, 422]);
    expect(t.events()).toEqual([]);
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
  });

  it('account_id がない、category が不正、status_ids が ID でない、comment が長すぎるときは 422 にする', async () => {
    const t = await seedReports();

    const responses = await Promise.all([
      t.json({}),
      t.json({ account_id: t.alice.actorId, category: 'unknown' }),
      t.json({ account_id: t.alice.actorId, status_ids: ['not-an-id'] }),
      t.json({ account_id: t.alice.actorId, comment: 'a'.repeat(1001) }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([422, 422, 422, 422]);
    expect(t.events()).toEqual([]);
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
  });

  it('target_account を組み立てられないときは、通報を実行せずに 500 を返す', async () => {
    const reportRemoteActor = vi.fn();
    const router = createWorkerMastodonReportsRouter({
      authn: {
        optionalAuth: async (_c, next) => await next(),
        requireApp: async (_c, next) => await next(),
        requireUser: () => async (c, next) => {
          c.set('principal', {
            source: 'token',
            applicationId: null,
            userId: UserId.generate(),
            sessionId: null,
            scopes: [],
          });
          await next();
        },
      },
      statusAssembler: {
        assemble: vi.fn(),
        assembleAccounts: vi.fn(async () => {
          throw new Error('Failed to resolve account profiles');
        }),
      },
      reportRemoteActor,
      createContext: () => ({}) as never,
    });
    const app = new Hono().route('/api', router);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await app.request('http://localhost/api/v1/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ account_id: ActorId.generate(), forward: true }),
    });

    expect(response.status).toBe(500);
    expect(reportRemoteActor).not.toHaveBeenCalled();
  });

  it('存在しないアカウントと不正な ID は 404 にする', async () => {
    const t = await seedReports();

    const responses = await Promise.all([
      t.json({ account_id: t.seed.uuid() }),
      t.json({ account_id: 'not-an-id' }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([404, 404]);
    expect(await responses[0]!.json()).toEqual({ error: 'Record not found' });
  });

  it('トークンがないと 401、write:reports を満たさないスコープは 403 にする', async () => {
    const t = await seedReports();
    const readOnly = await t.bearerFor('read');
    const followOnly = await t.bearerFor('follow');

    const responses = await Promise.all([
      t.json({ account_id: t.alice.actorId }, {}),
      t.json({ account_id: t.alice.actorId }, { Authorization: 'Bearer invalid' }),
      t.json({ account_id: t.alice.actorId }, readOnly),
      t.json({ account_id: t.alice.actorId }, followOnly),
    ]);

    expect(responses.map((response) => response.status)).toEqual([401, 401, 403, 403]);
    expect(t.events()).toEqual([]);
    expect(t.federation.sendActivity).not.toHaveBeenCalled();
  });
});
