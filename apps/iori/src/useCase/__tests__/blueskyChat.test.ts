import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import { createBlueskyChat } from '../../adaptor/bluesky/blueskyChat.ts';
import type { BlueskyChatConvo, BlueskyChatMessage } from '../../domain/blueskyChat/blueskyChat.ts';
import type { BlueskyChat } from '../../ports/blueskyChat.ts';
import type { BlueskyChatClient, BlueskyClientError } from '../../ports/blueskyClient.ts';
import { BlueskyChatUseCases } from '../blueskyChat.ts';

const ME = 'did:plc:me';
const ALICE = {
  did: 'did:plc:alice',
  handle: 'alice.bsky.social',
  displayName: 'Alice',
  avatar: null,
  chatDisabled: false,
};
const SELF = { did: ME, handle: 'me.bsky.social', displayName: null, avatar: null, chatDisabled: false };
const failure: BlueskyClientError = { type: 'BlueskyClientError', kind: 'http', message: 'failed', status: 500 };

const textMessage = (id: string, text = id) =>
  ({
    kind: 'message',
    id,
    text,
    facets: [],
    hasEmbed: false,
    sharedPost: null,
    reactions: [],
    senderDid: ALICE.did,
    sentAt: 1000,
  }) as const;
const convo = (overrides: Partial<BlueskyChatConvo> = {}): BlueskyChatConvo => ({
  id: 'c1',
  rev: 'r1',
  members: [SELF, ALICE],
  lastMessage: null,
  muted: false,
  status: 'accepted',
  unreadCount: 0,
  ...overrides,
});

const setup = (overrides: Partial<BlueskyChat> = {}) => {
  const base: BlueskyChat = {
    viewerDid: () => RA.ok(ME),
    listConvos: async () => RA.ok({ items: [], cursor: undefined }),
    getConvo: async () => RA.ok(convo()),
    getConvoForMember: async () => RA.ok(convo()),
    getMessages: async () => RA.ok({ items: [], cursor: undefined }),
    sendMessage: async ({ text }) => RA.ok(textMessage('sent', text)),
    updateRead: async () => RA.ok(convo()),
    acceptConvo: async () => RA.ok(undefined),
    ...overrides,
  };
  const chat = {
    viewerDid: base.viewerDid,
    listConvos: vi.fn(base.listConvos),
    getConvo: vi.fn(base.getConvo),
    getConvoForMember: vi.fn(base.getConvoForMember),
    getMessages: vi.fn(base.getMessages),
    sendMessage: vi.fn(base.sendMessage),
    updateRead: vi.fn(base.updateRead),
    acceptConvo: vi.fn(base.acceptConvo),
  } satisfies BlueskyChat;
  return { chat, useCases: BlueskyChatUseCases.create({ chat }) };
};

describe('BlueskyChatUseCases', () => {
  describe('listConvos', () => {
    it('自分を除いた相手、lastMessage の要約、unreadCount、status、muted、cursor を返す', async () => {
      const t = setup({
        listConvos: async () =>
          RA.ok({
            items: [convo({ lastMessage: textMessage('m1', 'やあ'), unreadCount: 3, muted: true })],
            cursor: 'next',
          }),
      });

      const result = await t.useCases.listConvos.run({ cursor: 'abc' });

      expect(result).toEqual({
        ok: true,
        val: {
          cursor: 'next',
          convos: [{
            id: 'c1',
            rev: 'r1',
            peers: [ALICE],
            lastMessage: { kind: 'message', text: 'やあ', senderDid: ALICE.did, sentAt: 1000 },
            muted: true,
            status: 'accepted',
            unreadCount: 3,
          }],
        },
      });
      expect(t.chat.listConvos).toHaveBeenCalledExactlyOnceWith({ limit: 50, cursor: 'abc' });
    });

    it('削除済みや未対応のメッセージは本文なしの要約にし、cursor が無ければ null にする', async () => {
      const deleted: BlueskyChatMessage = { kind: 'deleted', id: 'm1', senderDid: ME, sentAt: 5 };
      const unsupported: BlueskyChatMessage = { kind: 'unsupported', id: null, sentAt: null };
      const t = setup({
        listConvos: async () =>
          RA.ok({
            items: [convo({ lastMessage: deleted }), convo({ id: 'c2', lastMessage: unsupported })],
            cursor: undefined,
          }),
      });

      const result = await t.useCases.listConvos.run({});

      expect(result).toMatchObject({
        ok: true,
        val: {
          cursor: null,
          convos: [
            { lastMessage: { kind: 'deleted', text: null, senderDid: ME, sentAt: 5 } },
            { lastMessage: { kind: 'unsupported', text: null, senderDid: null, sentAt: null } },
          ],
        },
      });
    });

    it('取得の失敗をそのまま返す', async () => {
      const t = setup({ listConvos: async () => RA.err(failure) });

      expect(await t.useCases.listConvos.run({})).toEqual({ ok: false, err: failure });
    });
  });

  describe('getConvo / openConvo / markRead', () => {
    it('会話 1 件を相手つきで返す', async () => {
      const t = setup();

      expect(await t.useCases.getConvo.run({ convoId: 'c1' })).toMatchObject({
        ok: true,
        val: { id: 'c1', peers: [ALICE] },
      });
      expect(t.chat.getConvo).toHaveBeenCalledExactlyOnceWith('c1');
    });

    it('相手の DID から会話を開く', async () => {
      const t = setup();

      expect(await t.useCases.openConvo.run({ did: ALICE.did })).toMatchObject({ ok: true, val: { id: 'c1' } });
      expect(t.chat.getConvoForMember).toHaveBeenCalledExactlyOnceWith(ALICE.did);
    });

    it('既読化は messageId を渡して更新後の会話を返す', async () => {
      const t = setup();

      const result = await t.useCases.markRead.run({ convoId: 'c1', messageId: 'm1' });

      expect(result).toMatchObject({ ok: true, val: { id: 'c1' } });
      expect(t.chat.updateRead).toHaveBeenCalledExactlyOnceWith({ convoId: 'c1', messageId: 'm1' });
    });

    it('承諾は convoId を渡す', async () => {
      const t = setup();

      expect(await t.useCases.acceptConvo.run({ convoId: 'c1' })).toEqual({ ok: true, val: undefined });
      expect(t.chat.acceptConvo).toHaveBeenCalledExactlyOnceWith('c1');
    });
  });

  describe('listMessages', () => {
    it('新しい順の応答を古い順に並べ替え、order で明示する', async () => {
      const t = setup({
        getMessages: async () =>
          RA.ok({ items: [textMessage('m3'), textMessage('m2'), textMessage('m1')], cursor: 'older' }),
      });

      const result = await t.useCases.listMessages.run({ convoId: 'c1', cursor: 'abc' });

      expect(result).toMatchObject({ ok: true, val: { cursor: 'older', order: 'oldest_first' } });
      expect(result.ok && result.val.messages.map((message) => message.kind === 'message' ? message.id : null)).toEqual(
        [
          'm1',
          'm2',
          'm3',
        ],
      );
      expect(t.chat.getMessages).toHaveBeenCalledExactlyOnceWith({ convoId: 'c1', limit: 50, cursor: 'abc' });
    });
  });

  describe('sendMessage', () => {
    it('前後の空白を除いた本文を送る', async () => {
      const t = setup();

      const result = await t.useCases.sendMessage.run({ convoId: 'c1', text: '  こんにちは\n' });

      expect(result).toMatchObject({ ok: true, val: { id: 'sent', text: 'こんにちは' } });
      expect(t.chat.sendMessage).toHaveBeenCalledExactlyOnceWith({ convoId: 'c1', text: 'こんにちは' });
    });

    it('空の本文は empty で拒否し、送らない', async () => {
      const t = setup();

      expect(await t.useCases.sendMessage.run({ convoId: 'c1', text: ' \n ' })).toEqual({
        ok: false,
        err: { type: 'BlueskyChatMessageInvalid', reason: 'empty' },
      });
      expect(t.chat.sendMessage).not.toHaveBeenCalled();
    });

    it('1000 graphemes までは通し、超えたら too_many_graphemes で拒否する。絵文字の組み合わせは 1 grapheme と数える', async () => {
      const t = setup();
      const family = '👨‍👩‍👧‍👦';

      expect((await t.useCases.sendMessage.run({ convoId: 'c1', text: 'a'.repeat(1000) })).ok).toBe(true);
      expect((await t.useCases.sendMessage.run({ convoId: 'c1', text: family.repeat(1000) })).ok).toBe(false);
      expect(await t.useCases.sendMessage.run({ convoId: 'c1', text: 'a'.repeat(1001) })).toEqual({
        ok: false,
        err: { type: 'BlueskyChatMessageInvalid', reason: 'too_many_graphemes' },
      });
    });

    it('graphemes が 1000 以内でも UTF-8 で 10000 バイトを超えたら too_many_bytes で拒否する', async () => {
      const t = setup();

      expect((await t.useCases.sendMessage.run({ convoId: 'c1', text: 'あ'.repeat(1000) })).ok).toBe(true);
      expect(await t.useCases.sendMessage.run({ convoId: 'c1', text: '👨‍👩‍👧‍👦'.repeat(401) })).toEqual({
        ok: false,
        err: { type: 'BlueskyChatMessageInvalid', reason: 'too_many_bytes' },
      });
      expect(t.chat.sendMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('unreadCount', () => {
    it('listConvos を limit 100 で 1 ページ読み、accepted の unreadCount だけを合計して、リクエストは件数を別に返す', async () => {
      const t = setup({
        listConvos: async () =>
          RA.ok({
            items: [
              convo({ id: 'a', unreadCount: 2 }),
              convo({ id: 'b', unreadCount: 5, status: 'request' }),
              convo({ id: 'c', unreadCount: 1 }),
              convo({ id: 'd', unreadCount: 4, status: 'unknown' }),
              convo({ id: 'e', unreadCount: 0, status: 'request' }),
            ],
            cursor: 'more',
          }),
      });

      const result = await t.useCases.unreadCount.run();

      expect(result).toEqual({ ok: true, val: { unread: 3, requests: 2 } });
      expect(t.chat.listConvos).toHaveBeenCalledExactlyOnceWith({ limit: 100 });
    });

    it('取得の失敗をそのまま返す', async () => {
      const t = setup({ listConvos: async () => RA.err(failure) });

      expect(await t.useCases.unreadCount.run()).toEqual({ ok: false, err: failure });
    });
  });

  describe('未知の $type を含む応答（アダプター経由）', () => {
    it('systemMessageView や未知の lastMessage があっても会話一覧とメッセージ一覧が失敗しない', async () => {
      const chatQuery = vi.fn<BlueskyChatClient['chatQuery']>(async (nsid) =>
        nsid === 'chat.bsky.convo.listConvos'
          ? RA.ok({
            convos: [{
              id: 'c1',
              rev: 'r1',
              members: [SELF, ALICE],
              muted: false,
              unreadCount: 1,
              lastMessage: {
                $type: 'chat.bsky.convo.defs#systemMessageView',
                id: 's1',
                rev: 'r',
                sentAt: '2026-11-12T00:00:00Z',
              },
            }, {
              id: 'c2',
              rev: 'r2',
              members: [SELF, ALICE],
              muted: false,
              unreadCount: 0,
              lastMessage: { $type: 'chat.bsky.convo.defs#brandNew' },
            }],
          })
          : RA.ok({ messages: [{ $type: 'chat.bsky.convo.defs#brandNew', x: 1 }] })
      );
      const chat = createBlueskyChat({
        client: { chatQuery, chatProcedure: vi.fn(), viewerDid: () => RA.ok(ME) },
      });
      const useCases = BlueskyChatUseCases.create({ chat });

      const convos = await useCases.listConvos.run({});
      const messages = await useCases.listMessages.run({ convoId: 'c1' });

      expect(convos).toMatchObject({
        ok: true,
        val: { convos: [{ lastMessage: { kind: 'unsupported' } }, { lastMessage: { kind: 'unsupported' } }] },
      });
      expect(messages).toMatchObject({ ok: true, val: { messages: [{ kind: 'unsupported', id: null }] } });
    });
  });
});
