import { describe, expect, it } from 'vitest';

import type {
  IoriBlueskyChatConvoBody,
  IoriBlueskyChatMessageBody,
} from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import {
  CHAT_DISABLED_MESSAGE,
  CHAT_NOT_PERMITTED_MESSAGE,
  CHAT_RECIPIENT_REJECTED_MESSAGE,
  CHAT_RETRY_MESSAGE,
  chatConvoPath,
  chatErrorMessage,
  chatErrorMessageOf,
  chatRouteOfPath,
  formatChatTime,
  graphemeCount,
  groupReactions,
  isOwnMessage,
  isSendable,
  latestMessageId,
  mergeMessages,
  prependOlderMessages,
  remainingGraphemes,
  shouldSendOnKey,
  splitConvos,
} from './blueskyChat.ts';

const ALICE = {
  did: 'did:plc:alice',
  handle: 'alice.bsky.social',
  displayName: 'Alice',
  avatar: null,
  chatDisabled: false,
};

const convo = (id: string, overrides: Partial<IoriBlueskyChatConvoBody> = {}): IoriBlueskyChatConvoBody => ({
  id,
  rev: 'r',
  peers: [ALICE],
  lastMessage: null,
  muted: false,
  status: 'accepted',
  unreadCount: 0,
  ...overrides,
});

const message = (id: string, senderDid = ALICE.did, text = id): IoriBlueskyChatMessageBody => ({
  kind: 'message',
  id,
  text,
  facets: [],
  hasEmbed: false,
  sharedPost: null,
  reactions: [],
  senderDid,
  sentAt: 1000,
});

const failure = (status: number | undefined, code?: string, reason?: string) => ({ status, code, reason });

describe('splitConvos', () => {
  it('リクエストを accepted と unknown から分け、それぞれの順序を保つ', () => {
    const result = splitConvos([
      convo('a'),
      convo('b', { status: 'request' }),
      convo('c', { status: 'unknown' }),
      convo('d', { status: 'request' }),
    ]);

    expect(result.requests.map((c) => c.id)).toEqual(['b', 'd']);
    expect(result.accepted.map((c) => c.id)).toEqual(['a', 'c']);
  });
});

describe('graphemeCount / remainingGraphemes', () => {
  it('書記素クラスタ単位で数える', () => {
    expect(graphemeCount('abc')).toBe(3);
    expect(graphemeCount('👨‍👩‍👧‍👦')).toBe(1);
    expect(graphemeCount('🇯🇵')).toBe(1);
    expect(graphemeCount('が')).toBe(1);
    expect(graphemeCount('')).toBe(0);
  });

  it('1000 から引いた残りを返し、超えると負になる', () => {
    expect(remainingGraphemes('')).toBe(1000);
    expect(remainingGraphemes('👨‍👩‍👧‍👦abc')).toBe(996);
    expect(remainingGraphemes('a'.repeat(1001))).toBe(-1);
    expect(remainingGraphemes('abc', 10)).toBe(7);
  });
});

describe('isSendable', () => {
  it('空白だけ、送信中、上限超過は送れない', () => {
    expect(isSendable('こんにちは', false)).toBe(true);
    expect(isSendable('  \n ', false)).toBe(false);
    expect(isSendable('こんにちは', true)).toBe(false);
    expect(isSendable('a'.repeat(1000), false)).toBe(true);
    expect(isSendable('a'.repeat(1001), false)).toBe(false);
    expect(isSendable(`${'a'.repeat(1000)}   `, false)).toBe(true);
  });
});

describe('shouldSendOnKey', () => {
  const key = (overrides: Partial<Parameters<typeof shouldSendOnKey>[0]> = {}) => ({
    key: 'Enter',
    ctrlKey: false,
    metaKey: false,
    isComposing: false,
    ...overrides,
  });

  it('Ctrl+Enter と Cmd+Enter で送信し、Enter 単独は送信しない', () => {
    expect(shouldSendOnKey(key({ ctrlKey: true }))).toBe(true);
    expect(shouldSendOnKey(key({ metaKey: true }))).toBe(true);
    expect(shouldSendOnKey(key())).toBe(false);
  });

  it('IME の変換中と Enter 以外のキーでは送信しない', () => {
    expect(shouldSendOnKey(key({ ctrlKey: true, isComposing: true }))).toBe(false);
    expect(shouldSendOnKey(key({ ctrlKey: true, key: 'a' }))).toBe(false);
  });
});

describe('mergeMessages', () => {
  it('新しい id だけを後ろに足し、足した件数を返す', () => {
    const result = mergeMessages([message('m1'), message('m2')], [message('m2'), message('m3')]);

    expect(result.messages.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);
    expect(result.addedCount).toBe(1);
  });

  it('既にある id は重複させず、新しい取得結果で置き換える', () => {
    const deleted: IoriBlueskyChatMessageBody = { kind: 'deleted', id: 'm1', senderDid: ALICE.did, sentAt: 1000 };

    const result = mergeMessages([message('m1')], [deleted, deleted]);

    expect(result.messages).toEqual([deleted]);
    expect(result.addedCount).toBe(0);
  });

  it('新着側の重複と id の無いメッセージは足さず、既存の id の無いメッセージは残す', () => {
    const unsupported: IoriBlueskyChatMessageBody = { kind: 'unsupported', id: null, sentAt: null };

    const result = mergeMessages([unsupported, message('m1')], [unsupported, message('m2'), message('m2')]);

    expect(result.messages.map((m) => m.id)).toEqual([null, 'm1', 'm2']);
    expect(result.addedCount).toBe(1);
  });
});

describe('prependOlderMessages', () => {
  it('古い側を前に足し、既にある id は足さない', () => {
    const result = prependOlderMessages([message('m3'), message('m4')], [message('m1'), message('m2'), message('m3')]);

    expect(result.map((m) => m.id)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });
});

describe('latestMessageId / isOwnMessage', () => {
  it('末尾から数えて id のあるメッセージを返す', () => {
    const unsupported: IoriBlueskyChatMessageBody = { kind: 'unsupported', id: null, sentAt: null };

    expect(latestMessageId([message('m1'), message('m2'), unsupported])).toBe('m2');
    expect(latestMessageId([unsupported])).toBeUndefined();
    expect(latestMessageId([])).toBeUndefined();
  });

  it('相手以外の送信者を自分として扱い、unsupported は自分にしない', () => {
    expect(isOwnMessage(message('m1', 'did:plc:me'), [ALICE])).toBe(true);
    expect(isOwnMessage(message('m1', ALICE.did), [ALICE])).toBe(false);
    expect(isOwnMessage({ kind: 'unsupported', id: null, sentAt: null }, [ALICE])).toBe(false);
  });
});

describe('groupReactions', () => {
  it('同じ値のリアクションを件数にまとめ、出てきた順に並べる', () => {
    expect(
      groupReactions([
        { value: '👍', senderDid: 'a' },
        { value: '❤️', senderDid: 'a' },
        { value: '👍', senderDid: 'b' },
      ]),
    ).toEqual([{ value: '👍', count: 2 }, { value: '❤️', count: 1 }]);
  });
});

describe('chatErrorMessage', () => {
  it('403 chat_not_permitted はアプリパスワードの案内にする', () => {
    expect(chatErrorMessage(failure(403, 'chat_not_permitted'))).toBe(CHAT_NOT_PERMITTED_MESSAGE);
  });

  it('422 の相手が受け付けない理由は、相手が DM を受け付けていない文言にする', () => {
    for (const code of ['MessagesDisabled', 'NotFollowedBySender', 'BlockedActor', 'ConvoLocked']) {
      expect(chatErrorMessage(failure(422, code))).toBe(CHAT_RECIPIENT_REJECTED_MESSAGE);
    }
  });

  it('422 の入力の誤りは理由ごとの文言にする', () => {
    expect(chatErrorMessage(failure(422, 'Validation failed: text', 'too_many_graphemes'))).toContain('1000');
    expect(chatErrorMessage(failure(422, 'Validation failed: text', 'empty'))).toContain('入力');
  });

  it('404 InvalidConvo は会話が見つからない文言にし、その他は再試行を促す', () => {
    expect(chatErrorMessage(failure(404, 'InvalidConvo'))).toContain('見つかりません');
    expect(chatErrorMessage(failure(502, 'Bluesky request failed'))).toBe(CHAT_RETRY_MESSAGE);
    expect(chatErrorMessage(failure(500))).toBe(CHAT_RETRY_MESSAGE);
    expect(chatErrorMessage(failure(422, 'Unknown'))).toBe(CHAT_RETRY_MESSAGE);
    expect(chatErrorMessage(failure(undefined))).toBe(CHAT_RETRY_MESSAGE);
  });

  it('API のエラーでない例外は再試行を促す文言にする', () => {
    expect(chatErrorMessageOf(new TypeError('network'))).toBe(CHAT_RETRY_MESSAGE);
    expect(chatErrorMessageOf(Object.assign(new Error('x'), { status: 409 }))).toBe(CHAT_DISABLED_MESSAGE);
  });
});

describe('chatRouteOfPath / chatConvoPath', () => {
  it('一覧と会話のパスを見分ける', () => {
    expect(chatRouteOfPath('/messages')).toEqual({ kind: 'list' });
    expect(chatRouteOfPath('/messages/')).toEqual({ kind: 'list' });
    expect(chatRouteOfPath('/messages/3kabc')).toEqual({ kind: 'convo', convoId: '3kabc' });
    expect(chatRouteOfPath('/messages/a%2Fb/')).toEqual({ kind: 'convo', convoId: 'a/b' });
  });

  it('Fediverse の会話のパスは、Bluesky の convoId と見分けて key を取り出す', () => {
    expect(chatRouteOfPath('/messages/fediverse/WyJhIl0')).toEqual({ kind: 'fediverseConvo', key: 'WyJhIl0' });
    expect(chatRouteOfPath('/messages/fediverse/WyJhIl0/')).toEqual({ kind: 'fediverseConvo', key: 'WyJhIl0' });
    expect(chatRouteOfPath('/messages/fediverse')).toBeUndefined();
    expect(chatRouteOfPath('/messages/fediverse/')).toBeUndefined();
    expect(chatRouteOfPath('/messages/fediverse/a/b')).toBeUndefined();
    expect(chatRouteOfPath('/messages/fediverse/%E0%A4%A')).toBeUndefined();
    expect(chatRouteOfPath('/messages/fediversex')).toEqual({ kind: 'convo', convoId: 'fediversex' });
  });

  it('対象外のパスと壊れたエンコードは undefined にする', () => {
    expect(chatRouteOfPath('/messages/a/b')).toBeUndefined();
    expect(chatRouteOfPath('/messagesx')).toBeUndefined();
    expect(chatRouteOfPath('/messages/%E0%A4%A')).toBeUndefined();
  });

  it('会話の ID をエンコードしてパスにする', () => {
    expect(chatConvoPath('3kabc')).toBe('/messages/3kabc');
    expect(chatConvoPath('a/b')).toBe('/messages/a%2Fb');
  });
});

describe('formatChatTime', () => {
  const NOW = Date.UTC(2026, 10, 12, 3, 0);

  it('同じ日は時刻だけ、別の日は日付と時刻を出す', () => {
    expect(formatChatTime(Date.UTC(2026, 10, 12, 1, 5), NOW, 'UTC')).toBe('01:05');
    expect(formatChatTime(Date.UTC(2026, 10, 11, 1, 5), NOW, 'UTC')).toBe('11/11 01:05');
  });
});
