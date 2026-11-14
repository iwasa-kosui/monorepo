import { RA } from '@iwasa-kosui/result';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createMastodonSeed } from '../../adaptor/d1/__tests__/mastodonSeed.ts';
import { createSqliteD1Fixture } from '../../adaptor/d1/__tests__/sqliteFixture.ts';
import { createD1BlueskyChatPushReceiptsResolverByConvoIds } from '../../adaptor/d1/blueskyChatPush/blueskyChatPushReceiptsResolverByConvoIds.ts';
import { createD1BlueskyChatPushReceiptsSavedStore } from '../../adaptor/d1/blueskyChatPush/blueskyChatPushReceiptsSavedStore.ts';
import { createD1PushSubscriptionsResolverByUserId } from '../../adaptor/d1/pushSubscription/pushSubscriptionsResolverByUserId.ts';
import { createD1UserResolverByUsername } from '../../adaptor/d1/user/userResolverByUsername.ts';
import type { WebPushSender } from '../../adaptor/webPush/webPush.ts';
import type { BlueskyChatConvo, BlueskyChatMessage } from '../../domain/blueskyChat/blueskyChat.ts';
import type { BlueskyStoredCredential } from '../../domain/blueskyCredential/blueskyCredential.ts';
import { Instant } from '../../domain/instant/instant.ts';
import { Username } from '../../domain/user/username.ts';
import type { BlueskyChat } from '../../ports/blueskyChat.ts';
import type { BlueskyClientError } from '../../ports/blueskyClient.ts';
import { CollectBlueskyChatPushUseCase } from '../collectBlueskyChatPush.ts';

const MINUTE = 60 * 1000;
const NOW = Instant.orThrow(Date.UTC(2026, 10, 13, 12));
const ME = 'did:plc:me';
const ALICE = {
  did: 'did:plc:alice',
  handle: 'alice.bsky.social',
  displayName: 'Alice',
  avatar: null,
  chatDisabled: false,
};
const MYSELF = { did: ME, handle: 'me.bsky.social', displayName: null, avatar: null, chatDisabled: false };

const messageOf = (
  id: string,
  overrides: Partial<Extract<BlueskyChatMessage, { kind: 'message' }>> = {},
): BlueskyChatMessage => ({
  kind: 'message',
  id,
  text: `text ${id}`,
  facets: [],
  hasEmbed: false,
  sharedPost: null,
  reactions: [],
  senderDid: ALICE.did,
  sentAt: NOW - MINUTE,
  ...overrides,
});

const convoOf = (id: string, overrides: Partial<BlueskyChatConvo> = {}): BlueskyChatConvo => ({
  id,
  rev: 'rev',
  members: [MYSELF, ALICE],
  lastMessage: messageOf(`${id}-m1`),
  muted: false,
  status: 'accepted',
  unreadCount: 1,
  ...overrides,
});

const notPermitted: BlueskyClientError = {
  type: 'BlueskyClientError',
  kind: 'chat_not_permitted',
  message: 'listConvos failed: status 400 InvalidToken',
  status: 400,
  code: 'InvalidToken',
};

const fixtures: ReturnType<typeof createSqliteD1Fixture>[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const fixture of fixtures.splice(0)) fixture.sqlite.close();
});

const setup = (
  response: readonly BlueskyChatConvo[] | BlueskyClientError,
  options: { subscriptions?: number; owner?: boolean; chatPermitted?: boolean | null | 'none' } = {},
) => {
  const fixture = createSqliteD1Fixture();
  fixtures.push(fixture);
  const { db, sqlite } = fixture;
  const seed = createMastodonSeed(fixture);
  const owner = options.owner === false ? undefined : seed.addLocalActor('kosui');
  for (let index = 0; owner !== undefined && index < (options.subscriptions ?? 1); index++) {
    sqlite.prepare(
      'INSERT INTO push_subscriptions(subscriptionId,userId,endpoint,p256dhKey,authKey,createdAt) VALUES (?,?,?,?,?,?)',
    ).run(seed.uuid(), owner.userId, `https://push.example/${index}`, 'p256dh', 'auth', 1);
  }
  const listConvos = vi.fn<BlueskyChat['listConvos']>(async () =>
    'type' in response ? RA.err(response) : RA.ok({ items: response, cursor: 'next' })
  );
  const viewerDid = vi.fn<BlueskyChat['viewerDid']>(async () => RA.ok(ME));
  const subscriptionsResolver = createD1PushSubscriptionsResolverByUserId(db);
  const send = vi.fn<WebPushSender['send']>(async () => RA.ok(undefined));
  const stored = options.chatPermitted === 'none'
    ? undefined
    : { chatPermitted: options.chatPermitted ?? true } as BlueskyStoredCredential;
  const useCase = CollectBlueskyChatPushUseCase.create({
    chat: { listConvos, viewerDid },
    ownerUsername: Username.parseOrThrow('kosui'),
    userResolverByUsername: createD1UserResolverByUsername(db),
    storedCredentialResolver: { resolve: async () => RA.ok(stored) },
    receiptsResolver: createD1BlueskyChatPushReceiptsResolverByConvoIds(db),
    receiptsSavedStore: createD1BlueskyChatPushReceiptsSavedStore(db),
    pushSubscriptionsResolverByUserId: subscriptionsResolver,
    webPushSender: { send },
    now: () => NOW,
  });
  const receipts = () =>
    sqlite.prepare('SELECT convoId, lastMessageId, notifiedAt FROM bluesky_chat_push_receipts ORDER BY convoId').all();
  const payloads = () => send.mock.calls.map(([, payload]) => payload);
  return { ...fixture, listConvos, viewerDid, send, useCase, receipts, payloads };
};

describe('CollectBlueskyChatPushUseCase', () => {
  it('新着のメッセージがある会話を push し、会話の画面を開く url と最後のメッセージを記録する', async () => {
    const t = setup([convoOf('convo/1')]);

    const result = await t.useCase.run();

    expect(result).toEqual({ ok: true, val: { skipped: null, fetched: 1, notified: 1, pushed: 1 } });
    expect(t.payloads()).toEqual([{
      title: 'Bluesky のメッセージ',
      body: 'Alice からメッセージが届きました',
      url: '/messages/convo%2F1',
    }]);
    expect(t.receipts()).toEqual([{ convoId: 'convo/1', lastMessageId: 'convo/1-m1', notifiedAt: NOW }]);
    expect(t.listConvos).toHaveBeenCalledOnce();
    expect(t.listConvos).toHaveBeenCalledWith({ limit: 100, readState: 'unread' });
  });

  it('保存済みの id と同じメッセージは送らず、新しいメッセージに変わったら送る', async () => {
    const t = setup([convoOf('c1')]);
    await t.useCase.run();
    t.send.mockClear();

    const again = await t.useCase.run();

    expect(again).toEqual({ ok: true, val: { skipped: null, fetched: 1, notified: 0, pushed: 0 } });
    expect(t.send).not.toHaveBeenCalled();

    t.listConvos.mockReturnValueOnce(
      RA.ok({ items: [convoOf('c1', { lastMessage: messageOf('c1-m2') })], cursor: undefined }),
    );
    await t.useCase.run();

    expect(t.send).toHaveBeenCalledOnce();
    expect(t.receipts()).toEqual([{ convoId: 'c1', lastMessageId: 'c1-m2', notifiedAt: NOW }]);
  });

  it('自分が送ったメッセージは送らない', async () => {
    const t = setup([convoOf('c1', { lastMessage: messageOf('m1', { senderDid: ME }) })]);

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { notified: 0, pushed: 0 } });
    expect(t.send).not.toHaveBeenCalled();
    expect(t.receipts()).toEqual([]);
  });

  it('mute した会話は送らない', async () => {
    const t = setup([convoOf('c1', { muted: true })]);

    await t.useCase.run();

    expect(t.send).not.toHaveBeenCalled();
    expect(t.receipts()).toEqual([]);
  });

  it('既読の accepted、unknown の状態、削除済みと未対応のメッセージは送らない', async () => {
    const t = setup([
      convoOf('read', { unreadCount: 0 }),
      convoOf('unknown', { status: 'unknown' }),
      convoOf('deleted', { lastMessage: { kind: 'deleted', id: 'd1', senderDid: ALICE.did, sentAt: NOW - MINUTE } }),
      convoOf('unsupported', { lastMessage: { kind: 'unsupported', id: 'u1', sentAt: NOW - MINUTE } }),
      convoOf('empty', { lastMessage: null }),
    ]);

    await t.useCase.run();

    expect(t.send).not.toHaveBeenCalled();
  });

  it('15 分より古いメッセージは送らず、ちょうど 15 分前のものは送る', async () => {
    const t = setup([
      convoOf('old', { lastMessage: messageOf('m1', { sentAt: NOW - 15 * MINUTE - 1 }) }),
      convoOf('edge', { lastMessage: messageOf('m2', { sentAt: NOW - 15 * MINUTE }) }),
    ]);

    await t.useCase.run();

    expect(t.payloads().map((payload) => payload.url)).toEqual(['/messages/edge']);
    expect(t.receipts()).toEqual([{ convoId: 'edge', lastMessageId: 'm2', notifiedAt: NOW }]);
  });

  it('メッセージリクエストは、未読数が 0 でも、リクエストであることがわかる title と body で送る', async () => {
    const t = setup([convoOf('c1', { status: 'request', unreadCount: 0 })]);

    await t.useCase.run();

    expect(t.payloads()[0]).toMatchObject({
      title: 'Bluesky のメッセージリクエスト',
      body: 'Alice からメッセージリクエストが届きました',
    });
  });

  it('メッセージの本文を payload の title と body に含めない', async () => {
    const secret = 'SECRET-TEXT-9f3a';
    const t = setup([convoOf('c1', { lastMessage: messageOf('m1', { text: secret }) })]);

    await t.useCase.run();

    const [payload] = t.payloads();
    expect(payload!.title).not.toContain(secret);
    expect(payload!.body).not.toContain(secret);
  });

  it('6 会話以上は新しい 5 会話を個別に送り、残りを 1 通にまとめ、まとめた分も記録する', async () => {
    const convos = Array.from(
      { length: 7 },
      (_, index) => convoOf(`c${index}`, { lastMessage: messageOf(`m${index}`, { sentAt: NOW - (index + 1) * 1000 }) }),
    );
    const t = setup(convos);

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { notified: 7, pushed: 6 } });
    expect(t.payloads().map((payload) => payload.url)).toEqual([
      '/messages/c0',
      '/messages/c1',
      '/messages/c2',
      '/messages/c3',
      '/messages/c4',
      '/messages',
    ]);
    expect(t.payloads().at(-1)).toEqual({
      title: 'Bluesky のメッセージ',
      body: 'ほか 2 件の会話に新しいメッセージがあります',
      url: '/messages',
    });
    expect(t.receipts()).toHaveLength(7);
  });

  it('push が失敗しても、例外を投げても、Ok を返し、記録は残す', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const t = setup([convoOf('c1'), convoOf('c2', { lastMessage: messageOf('m2', { sentAt: NOW - 2 * MINUTE }) })]);
    t.send.mockReturnValueOnce(RA.err({ type: 'SendError' as const, message: 'gone', statusCode: 410 }));
    t.send.mockRejectedValueOnce(new Error('boom'));

    const result = await t.useCase.run();

    expect(result).toEqual({ ok: true, val: { skipped: null, fetched: 2, notified: 2, pushed: 0 } });
    expect(error).toHaveBeenCalledTimes(2);
    expect(t.receipts()).toHaveLength(2);
  });

  it('購読が 0 件なら、API を呼ばずに終わる', async () => {
    const t = setup([convoOf('c1')], { subscriptions: 0 });

    const result = await t.useCase.run();

    expect(result).toEqual({ ok: true, val: { skipped: 'noSubscriptions', fetched: 0, notified: 0, pushed: 0 } });
    expect(t.listConvos).not.toHaveBeenCalled();
    expect(t.receipts()).toEqual([]);
  });

  it('所有者がいないときは、API を呼ばずに終わる', async () => {
    const t = setup([convoOf('c1')], { owner: false });

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { skipped: 'noOwner' } });
    expect(t.listConvos).not.toHaveBeenCalled();
  });

  it('登録済みの資格情報で DM が許可されていなければ、API を呼ばずに終わる', async () => {
    const t = setup([convoOf('c1')], { chatPermitted: false });

    const result = await t.useCase.run();

    expect(result).toMatchObject({ ok: true, val: { skipped: 'chatNotPermitted' } });
    expect(t.listConvos).not.toHaveBeenCalled();
  });

  it('DM の許可が未確認、または環境変数の資格情報のときは、API を呼ぶ', async () => {
    for (const chatPermitted of [null, 'none'] as const) {
      const t = setup([], { chatPermitted });
      await t.useCase.run();
      expect(t.listConvos).toHaveBeenCalledOnce();
    }
  });

  it('chat_not_permitted は失敗にせず、何も送らず記録もしない', async () => {
    const t = setup(notPermitted);

    const result = await t.useCase.run();

    expect(result).toEqual({ ok: true, val: { skipped: 'chatNotPermitted', fetched: 0, notified: 0, pushed: 0 } });
    expect(t.send).not.toHaveBeenCalled();
    expect(t.receipts()).toEqual([]);
  });

  it('それ以外の API の失敗は Err で返し、何も送らず記録もしない', async () => {
    const failure: BlueskyClientError = {
      type: 'BlueskyClientError',
      kind: 'http',
      message: 'status 502',
      status: 502,
    };
    const t = setup(failure);

    const result = await t.useCase.run();

    expect(result).toEqual({ ok: false, err: failure });
    expect(t.send).not.toHaveBeenCalled();
    expect(t.receipts()).toEqual([]);
  });
});
