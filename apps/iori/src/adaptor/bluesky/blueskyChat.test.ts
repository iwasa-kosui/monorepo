import { RA } from '@iwasa-kosui/result';
import { describe, expect, it, vi } from 'vitest';

import type { BlueskyChatClient, BlueskyClientError } from '../../ports/blueskyClient.ts';
import { createBlueskyChat } from './blueskyChat.ts';

const SENT_AT = '2026-11-12T03:00:00.000Z';
const SENT_AT_MS = Date.parse(SENT_AT);
const ME = 'did:plc:me';
const ALICE = {
  did: 'did:plc:alice',
  handle: 'alice.bsky.social',
  displayName: 'Alice',
  avatar: 'https://cdn.example/a.jpg',
};
const messageView = (overrides: Record<string, unknown> = {}) => ({
  $type: 'chat.bsky.convo.defs#messageView',
  id: 'm1',
  rev: 'r1',
  text: 'こんにちは',
  sender: { did: ALICE.did },
  sentAt: SENT_AT,
  ...overrides,
});
const convoView = (overrides: Record<string, unknown> = {}) => ({
  id: 'c1',
  rev: 'r1',
  members: [{ did: ME, handle: 'me.bsky.social' }, ALICE],
  muted: false,
  unreadCount: 2,
  ...overrides,
});
const failure: BlueskyClientError = { type: 'BlueskyClientError', kind: 'http', message: 'failed', status: 500 };

const setup = (response: Readonly<Record<string, unknown>> = {}, error?: BlueskyClientError) => {
  const result = (): ReturnType<BlueskyChatClient['chatQuery']> =>
    error === undefined ? RA.ok(response) : RA.err(error);
  const chatQuery = vi.fn<BlueskyChatClient['chatQuery']>(result);
  const chatProcedure = vi.fn<BlueskyChatClient['chatProcedure']>(result);
  const chat = createBlueskyChat({
    client: { chatQuery, chatProcedure, viewerDid: () => RA.ok(ME) },
  });
  return { chat, chatQuery, chatProcedure };
};

describe('createBlueskyChat', () => {
  it('listConvos は limit と cursor を送り、会話を変換する。status が無ければ accepted、未知の値は unknown にする', async () => {
    const t = setup({
      cursor: 'next',
      convos: [
        convoView({ lastMessage: messageView() }),
        convoView({ id: 'c2', status: 'request' }),
        convoView({ id: 'c3', status: 'something-new', kind: { $type: 'future' } }),
        { id: '' },
      ],
    });

    const result = await t.chat.listConvos({ limit: 100, cursor: 'abc' });

    expect(t.chatQuery).toHaveBeenCalledExactlyOnceWith('chat.bsky.convo.listConvos', { limit: '100', cursor: 'abc' });
    expect(result).toMatchObject({ ok: true, val: { cursor: 'next' } });
    if (!result.ok) return;
    expect(result.val.items.map((convo) => [convo.id, convo.status, convo.unreadCount])).toEqual([
      ['c1', 'accepted', 2],
      ['c2', 'request', 2],
      ['c3', 'unknown', 2],
    ]);
    expect(result.val.items[0]).toMatchObject({
      members: [
        { did: ME, handle: 'me.bsky.social', displayName: null, avatar: null, chatDisabled: false },
        { did: ALICE.did, displayName: 'Alice', avatar: 'https://cdn.example/a.jpg' },
      ],
      lastMessage: { kind: 'message', id: 'm1', text: 'こんにちは', senderDid: ALICE.did, sentAt: SENT_AT_MS },
    });
  });

  it('listConvos は cursor が無ければ送らない', async () => {
    const t = setup({ convos: [] });

    await t.chat.listConvos({ limit: 50 });

    expect(t.chatQuery).toHaveBeenCalledExactlyOnceWith('chat.bsky.convo.listConvos', { limit: '50' });
  });

  it('getMessages は未知の $type や削除済みのメッセージでも失敗にせず、変換する', async () => {
    const t = setup({
      messages: [
        messageView(),
        { $type: 'chat.bsky.convo.defs#deletedMessageView', id: 'm2', rev: 'r2', sender: { did: ME }, sentAt: SENT_AT },
        { $type: 'chat.bsky.convo.defs#systemMessageView', id: 'm3', rev: 'r3', sentAt: SENT_AT, data: { $type: 'x' } },
        { $type: 'chat.bsky.convo.defs#futureView', foo: 1 },
        'not an object',
      ],
    });

    const result = await t.chat.getMessages({ convoId: 'c1', limit: 50 });

    expect(t.chatQuery).toHaveBeenCalledExactlyOnceWith('chat.bsky.convo.getMessages', { convoId: 'c1', limit: '50' });
    expect(result).toEqual({
      ok: true,
      val: {
        cursor: undefined,
        items: [
          {
            kind: 'message',
            id: 'm1',
            text: 'こんにちは',
            facets: [],
            hasEmbed: false,
            sharedPost: null,
            reactions: [],
            senderDid: ALICE.did,
            sentAt: SENT_AT_MS,
          },
          { kind: 'deleted', id: 'm2', senderDid: ME, sentAt: SENT_AT_MS },
          { kind: 'unsupported', id: 'm3', sentAt: SENT_AT_MS },
          { kind: 'unsupported', id: null, sentAt: null },
        ],
      },
    });
  });

  it('getMessages は共有された投稿とリアクションを取り出し、viewRecord 以外の埋め込みは sharedPost にしない', async () => {
    const sharedEmbed = {
      $type: 'app.bsky.embed.record#view',
      record: {
        $type: 'app.bsky.embed.record#viewRecord',
        uri: 'at://did:plc:bob/app.bsky.feed.post/3k',
        cid: 'bafy',
        author: { did: 'did:plc:bob', handle: 'bob.bsky.social', displayName: 'Bob' },
        value: { $type: 'app.bsky.feed.post', text: '共有された本文' },
      },
    };
    const t = setup({
      messages: [
        messageView({
          id: 'm1',
          text: '',
          embed: sharedEmbed,
          reactions: [
            { value: '👍', sender: { did: ME }, createdAt: SENT_AT },
            { value: '', sender: { did: ME } },
            'x',
          ],
        }),
        messageView({
          id: 'm2',
          embed: {
            $type: 'app.bsky.embed.record#view',
            record: { $type: 'app.bsky.embed.record#viewNotFound', uri: 'at://did:plc:bob/app.bsky.feed.post/3k' },
          },
        }),
        messageView({
          id: 'm3',
          embed: { ...sharedEmbed, record: { ...sharedEmbed.record, author: { handle: 'bob.bsky.social' } } },
        }),
      ],
    });

    const result = await t.chat.getMessages({ convoId: 'c1', limit: 50 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.val.items).toMatchObject([
      {
        id: 'm1',
        hasEmbed: true,
        sharedPost: {
          uri: 'at://did:plc:bob/app.bsky.feed.post/3k',
          authorHandle: 'bob.bsky.social',
          authorDisplayName: 'Bob',
          text: '共有された本文',
        },
        reactions: [{ value: '👍', senderDid: ME }],
      },
      { id: 'm2', hasEmbed: true, sharedPost: null, reactions: [] },
      { id: 'm3', sharedPost: { authorDisplayName: null } },
    ]);
  });

  it('getConvo は convoId を送り、convo の形が違えば invalid_response にする', async () => {
    const ok = setup({ convo: convoView() });
    const broken = setup({ convo: { id: 'c1' } });

    expect(await ok.chat.getConvo('c1')).toMatchObject({ ok: true, val: { id: 'c1' } });
    expect(ok.chatQuery).toHaveBeenCalledExactlyOnceWith('chat.bsky.convo.getConvo', { convoId: 'c1' });
    expect(await broken.chat.getConvo('c1')).toMatchObject({ ok: false, err: { kind: 'invalid_response' } });
  });

  it('getConvoForMember は members を 1 人だけの配列で送る', async () => {
    const t = setup({ convo: convoView() });

    await t.chat.getConvoForMember(ALICE.did);

    expect(t.chatQuery).toHaveBeenCalledExactlyOnceWith('chat.bsky.convo.getConvoForMembers', { members: [ALICE.did] });
  });

  it('sendMessage は $type の無い応答も受け付け、convoId と message.text を POST する', async () => {
    const t = setup({ id: 'm9', rev: 'r9', text: 'hi', sender: { did: ME }, sentAt: SENT_AT });

    const result = await t.chat.sendMessage({ convoId: 'c1', text: 'hi' });

    expect(t.chatProcedure).toHaveBeenCalledExactlyOnceWith('chat.bsky.convo.sendMessage', {
      convoId: 'c1',
      message: { text: 'hi' },
    });
    expect(result).toMatchObject({ ok: true, val: { kind: 'message', id: 'm9', text: 'hi', senderDid: ME } });
  });

  it('sendMessage は message でない応答を invalid_response にする', async () => {
    const t = setup({
      $type: 'chat.bsky.convo.defs#deletedMessageView',
      id: 'm9',
      sender: { did: ME },
      sentAt: SENT_AT,
    });

    expect(await t.chat.sendMessage({ convoId: 'c1', text: 'hi' })).toMatchObject({
      ok: false,
      err: { kind: 'invalid_response' },
    });
  });

  it('updateRead は messageId があるときだけ送り、acceptConvo は convoId だけを送る', async () => {
    const t = setup({ convo: convoView() });

    await t.chat.updateRead({ convoId: 'c1', messageId: 'm1' });
    await t.chat.updateRead({ convoId: 'c1' });
    const accepted = await t.chat.acceptConvo('c1');

    expect(t.chatProcedure.mock.calls).toEqual([
      ['chat.bsky.convo.updateRead', { convoId: 'c1', messageId: 'm1' }],
      ['chat.bsky.convo.updateRead', { convoId: 'c1' }],
      ['chat.bsky.convo.acceptConvo', { convoId: 'c1' }],
    ]);
    expect(accepted).toEqual({ ok: true, val: undefined });
  });

  it('クライアントの失敗はそのまま返す', async () => {
    const t = setup({}, failure);

    expect(await t.chat.listConvos({ limit: 1 })).toEqual({ ok: false, err: failure });
    expect(await t.chat.acceptConvo('c1')).toEqual({ ok: false, err: failure });
  });
});
