import { jsx } from 'hono/jsx';
import { describe, expect, it } from 'vitest';

import type { IoriFediverseConversationBody } from '../../adaptor/routes/workerIoriFediverseConversationsRouter.ts';
import { FediverseChatConvoRow } from './FediverseChatConvoRow.tsx';

const NOW = Date.UTC(2026, 10, 12, 3, 0);

const peer = {
  accountId: 'actor-alice',
  actorUri: 'https://remote.example/users/alice',
  acct: 'alice@remote.example',
  displayName: 'Alice',
  avatar: 'https://iori.test/avatars/alice.png',
  path: '/remote-users/actor-alice',
};

const base: IoriFediverseConversationBody = {
  key: 'WyJhIl0',
  peers: [peer],
  lastMessage: { text: 'こんにちは', sentAt: NOW, own: false },
  unreadCount: 0,
};

const render = (overrides: Partial<IoriFediverseConversationBody> = {}): string =>
  String(jsx(FediverseChatConvoRow, { conversation: { ...base, ...overrides }, now: NOW }));

describe('FediverseChatConvoRow', () => {
  it('相手のアバター、表示名、acct、最後のメッセージを出し、会話のページへリンクする', () => {
    const html = render();

    expect(html).toContain('href="/messages/fediverse/WyJhIl0"');
    expect(html).toContain('src="https://iori.test/avatars/alice.png"');
    expect(html).toContain('Alice');
    expect(html).toContain('@alice@remote.example');
    expect(html).toContain('こんにちは');
  });

  it('自分が送った最後のメッセージには「あなた」を付ける', () => {
    expect(render({ lastMessage: { text: 'やあ', sentAt: NOW, own: true } })).toContain('あなた: ');
    expect(render()).not.toContain('あなた: ');
  });

  it('未読があるときだけ未読数のバッジを出す', () => {
    expect(render({ unreadCount: 3 })).toContain('aria-label="未読のメッセージ"');
    expect(render({ unreadCount: 0 })).not.toContain('aria-label="未読のメッセージ"');
  });

  it('複数の相手の会話は、表示名を並べて個別の acct は出さない', () => {
    const html = render({
      peers: [peer, { ...peer, accountId: 'actor-bob', displayName: 'Bob', acct: 'bob@other.example' }],
    });

    expect(html).toContain('Alice、Bob');
    expect(html).not.toContain('@alice@remote.example');
  });

  it('安全でないアバターの URL は使わず、頭文字にする', () => {
    const html = render({ peers: [{ ...peer, avatar: 'javascript:alert(1)' }] });

    expect(html).not.toContain('javascript:');
    expect(html).toContain('>A<');
  });

  it('本文が空なら添付の案内、日時の表示は time 要素にする', () => {
    const html = render({ lastMessage: { text: '', sentAt: NOW, own: false } });

    expect(html).toContain('添付ファイルを送りました');
    expect(html).toContain(`dateTime="${new Date(NOW).toISOString()}"`);
  });

  it('360px でも崩れないよう、長い文字列は truncate で省略する', () => {
    const html = render();

    expect(html).toContain('min-w-0 flex-1');
    expect(html.match(/truncate/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
