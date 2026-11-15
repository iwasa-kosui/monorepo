import { Result } from '@iwasa-kosui/result';
import { env } from 'cloudflare:test';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createD1BlueskyChatPushReceiptsResolverByConvoIds } from '../src/adaptor/d1/blueskyChatPush/blueskyChatPushReceiptsResolverByConvoIds.ts';
import { createD1BlueskyChatPushReceiptsSavedStore } from '../src/adaptor/d1/blueskyChatPush/blueskyChatPushReceiptsSavedStore.ts';
import { createD1Db } from '../src/adaptor/d1/client.ts';
import { Instant } from '../src/domain/instant/instant.ts';
import { UserId } from '../src/domain/user/userId.ts';

const db = createD1Db(env.DB);
const run = crypto.randomUUID();
const userId = UserId.orThrow(crypto.randomUUID());
const otherUserId = UserId.orThrow(crypto.randomUUID());
const savedStore = createD1BlueskyChatPushReceiptsSavedStore(db, userId);
const resolver = createD1BlueskyChatPushReceiptsResolverByConvoIds(db, userId);

const receipt = (convoId: string, lastMessageId: string, notifiedAt = 1_000) => ({
  convoId: `${run}-${convoId}`,
  lastMessageId,
  notifiedAt: Instant.orThrow(notifiedAt),
});

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO users(userId,username) VALUES (?,?)').bind(userId, `chat-${run}`),
    env.DB.prepare('INSERT INTO users(userId,username) VALUES (?,?)').bind(otherUserId, `chat-other-${run}`),
  ]);
});

afterAll(async () => {
  await env.DB.batch([
    env.DB.prepare('DELETE FROM bluesky_chat_push_receipts WHERE convoId LIKE ?').bind(`${run}-%`),
    env.DB.prepare('DELETE FROM users WHERE userId IN (?,?)').bind(userId, otherUserId),
  ]);
});

describe('bluesky_chat_push_receipts（実 D1）', () => {
  it('保存した会話ごとの最後の message id を引け、保存していない会話は含まれない', async () => {
    Result.unsafeUnwrap(await savedStore.store(receipt('a', 'm1'), receipt('b', 'm2')));

    const resolved = Result.unsafeUnwrap(await resolver.resolve([`${run}-a`, `${run}-b`, `${run}-none`]));

    expect(Object.fromEntries(resolved)).toEqual({ [`${run}-a`]: 'm1', [`${run}-b`]: 'm2' });
  });

  it('同じ会話をもう一度保存すると、message id と通知時刻を上書きし、行は増えない', async () => {
    Result.unsafeUnwrap(await savedStore.store(receipt('c', 'm1', 1_000)));
    Result.unsafeUnwrap(await savedStore.store(receipt('c', 'm2', 2_000)));

    const resolved = Result.unsafeUnwrap(await resolver.resolve([`${run}-c`]));
    const row = await env.DB.prepare(
      'SELECT COUNT(*) AS n, MAX(notifiedAt) AS at FROM bluesky_chat_push_receipts WHERE convoId = ?',
    )
      .bind(`${run}-c`).first<{ n: number; at: number }>();

    expect(resolved.get(`${run}-c`)).toBe('m2');
    expect(row).toEqual({ n: 1, at: 2_000 });
  });

  it('同じ会話でも、別のユーザーの受信の記録は引かず、上書きもしない', async () => {
    const otherStore = createD1BlueskyChatPushReceiptsSavedStore(db, otherUserId);
    Result.unsafeUnwrap(await otherStore.store(receipt('shared', 'theirs')));

    expect(Result.unsafeUnwrap(await resolver.resolve([`${run}-shared`])).size).toBe(0);

    Result.unsafeUnwrap(await savedStore.store(receipt('shared', 'mine')));

    const theirs = Result.unsafeUnwrap(
      await createD1BlueskyChatPushReceiptsResolverByConvoIds(db, otherUserId).resolve([`${run}-shared`]),
    );
    expect(theirs.get(`${run}-shared`)).toBe('theirs');
    expect(Result.unsafeUnwrap(await resolver.resolve([`${run}-shared`])).get(`${run}-shared`)).toBe('mine');
  });

  it('D1 の束縛数の上限を超える件数でも、保存と取得ができる', async () => {
    const receipts = Array.from({ length: 100 }, (_, index) => receipt(`bulk-${index}`, `m${index}`));

    Result.unsafeUnwrap(await savedStore.store(...receipts));
    const resolved = Result.unsafeUnwrap(await resolver.resolve(receipts.map((item) => item.convoId)));

    expect(resolved.size).toBe(100);
    expect(resolved.get(`${run}-bulk-99`)).toBe('m99');
  });
});
