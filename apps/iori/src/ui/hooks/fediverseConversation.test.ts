import { describe, expect, it } from 'vitest';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import type {
  IoriFediverseConversationBody,
  IoriFediverseConversationPeerBody,
} from '../../adaptor/routes/workerIoriFediverseConversationsRouter.ts';
import {
  FEDIVERSE_ACTOR_NOT_FOUND_MESSAGE,
  FEDIVERSE_DELIVERY_FAILED_MESSAGE,
  FEDIVERSE_NOT_FOUND_MESSAGE,
  FEDIVERSE_NOT_PERMITTED_MESSAGE,
  FEDIVERSE_PEER_REJECTED_MESSAGE,
  FEDIVERSE_RETRY_MESSAGE,
  fediverseCharacterCount,
  fediverseChatPath,
  fediverseConversationTitle,
  fediverseErrorMessage,
  fediverseErrorMessageOf,
  fediverseLastMessageSummary,
  fediverseMessageDisclosure,
  fediverseRemainingCharacters,
  fediverseRouteOfPath,
  hasIncomingFediverseMessage,
  isFediverseSendable,
  isOwnFediverseMessage,
  mergeFediverseConversations,
  mergeFediverseMessages,
  prependOlderFediverseMessages,
  sortFediverseConversations,
} from './fediverseConversation.ts';

const ALICE: IoriFediverseConversationPeerBody = {
  accountId: 'actor-alice',
  actorUri: 'https://remote.example/users/alice',
  acct: 'alice@remote.example',
  displayName: 'Alice',
  avatar: 'https://iori.test/default-avatar.png',
  path: '/remote-users/actor-alice',
};

const BOB: IoriFediverseConversationPeerBody = {
  ...ALICE,
  accountId: 'actor-bob',
  actorUri: 'https://other.example/users/bob',
  acct: 'bob@other.example',
  displayName: 'Bob',
};

const conversation = (
  key: string,
  sentAt: number | null,
  overrides: Partial<IoriFediverseConversationBody> = {},
): IoriFediverseConversationBody => ({
  key,
  peers: [ALICE],
  lastMessage: sentAt === null ? null : { text: key, sentAt, own: false },
  unreadCount: 0,
  ...overrides,
});

const status = (id: string, createdAt: string, accountId = ALICE.accountId!, overrides: Partial<Status> = {}) =>
  ({
    id,
    created_at: createdAt,
    account: { id: accountId },
    content: `<p>${id}</p>`,
    spoiler_text: '',
    sensitive: false,
    media_attachments: [],
    ...overrides,
  }) as unknown as Status;

describe('fediverseRouteOfPath / fediverseChatPath', () => {
  it('/messages/fediverse/<key> から key を取り出す', () => {
    expect(fediverseRouteOfPath('/messages/fediverse/WyJhIl0')).toEqual({ key: 'WyJhIl0' });
    expect(fediverseRouteOfPath('/messages/fediverse/WyJhIl0/')).toEqual({ key: 'WyJhIl0' });
  });

  it('Bluesky の会話、一覧、余分な階層、壊れたエンコードは undefined にする', () => {
    for (
      const path of [
        '/messages',
        '/messages/3kconvo',
        '/messages/fediverse',
        '/messages/fediverse/',
        '/messages/fediverse/a/b',
        '/messages/fediverse/%E0%A4%A',
        '/x/messages/fediverse/a',
      ]
    ) {
      expect(fediverseRouteOfPath(path)).toBeUndefined();
    }
  });

  it('key をエンコードしてパスにし、往復できる', () => {
    expect(fediverseChatPath('WyJhIl0')).toBe('/messages/fediverse/WyJhIl0');
    expect(fediverseRouteOfPath(fediverseChatPath('a/b'))).toEqual({ key: 'a/b' });
  });
});

describe('fediverseErrorMessage', () => {
  const failure = (status: number | undefined, code?: string, reason?: string) => ({ status, code, reason });

  it('ステータスごとの案内にする', () => {
    expect(fediverseErrorMessage(failure(403, 'Forbidden'))).toBe(FEDIVERSE_NOT_PERMITTED_MESSAGE);
    expect(fediverseErrorMessage(failure(400, 'Validation failed: key'))).toBe(FEDIVERSE_NOT_FOUND_MESSAGE);
    expect(fediverseErrorMessage(failure(404, 'Record not found'))).toBe(FEDIVERSE_ACTOR_NOT_FOUND_MESSAGE);
    expect(fediverseErrorMessage(failure(502))).toBe(FEDIVERSE_DELIVERY_FAILED_MESSAGE);
    expect(fediverseErrorMessage(failure(500))).toBe(FEDIVERSE_RETRY_MESSAGE);
    expect(fediverseErrorMessage(failure(undefined))).toBe(FEDIVERSE_RETRY_MESSAGE);
  });

  it('422 は理由ごとに案内する', () => {
    expect(fediverseErrorMessage(failure(422, 'Validation failed: peers'))).toBe(FEDIVERSE_PEER_REJECTED_MESSAGE);
    expect(fediverseErrorMessage(failure(422, 'Validation failed: text', 'empty'))).toBe(
      'メッセージを入力してください。',
    );
    expect(fediverseErrorMessage(failure(422, 'Validation failed: text', 'too_long'))).toBe(
      'メッセージは 10000 文字までです。',
    );
    expect(fediverseErrorMessage(failure(422, 'Validation failed: text', 'other'))).toBe(FEDIVERSE_RETRY_MESSAGE);
  });

  it('API のエラーだけを読み取り、それ以外は再試行の案内にする', () => {
    const apiError = Object.assign(new Error('x'), {
      status: 422,
      code: 'Validation failed: peers',
      reason: undefined,
    });

    expect(fediverseErrorMessageOf(apiError)).toBe(FEDIVERSE_PEER_REJECTED_MESSAGE);
    expect(fediverseErrorMessageOf(new Error('offline'))).toBe(FEDIVERSE_RETRY_MESSAGE);
    expect(fediverseErrorMessageOf('nope')).toBe(FEDIVERSE_RETRY_MESSAGE);
  });
});

describe('文字数と送信できるか', () => {
  it('コードポイントで数え、上限までの残りを返す', () => {
    expect(fediverseCharacterCount('あ😀a')).toBe(3);
    expect(fediverseRemainingCharacters('')).toBe(10000);
    expect(fediverseRemainingCharacters('あ'.repeat(10000))).toBe(0);
    expect(fediverseRemainingCharacters('あ'.repeat(10001))).toBe(-1);
  });

  it('空白だけ、上限超過、送信中は送れず、前後の空白を除いた本文で上限を測る', () => {
    expect(isFediverseSendable('hi', false)).toBe(true);
    expect(isFediverseSendable(' \n ', false)).toBe(false);
    expect(isFediverseSendable('hi', true)).toBe(false);
    expect(isFediverseSendable('あ'.repeat(10001), false)).toBe(false);
    expect(isFediverseSendable(` ${'あ'.repeat(10000)} `, false)).toBe(true);
  });
});

describe('会話の一覧の並べ方', () => {
  it('最後のメッセージの新しい順に並べ、メッセージが無い会話は最後にする', () => {
    const sorted = sortFediverseConversations([
      conversation('b', 2000),
      conversation('empty', null),
      conversation('a', 3000),
    ]);

    expect(sorted.map(({ key }) => key)).toEqual(['a', 'b', 'empty']);
  });

  it('元の配列を変えない', () => {
    const input = [conversation('old', 1000), conversation('new', 2000)];

    sortFediverseConversations(input);

    expect(input.map(({ key }) => key)).toEqual(['old', 'new']);
  });

  it('続きの読み込みでは、すでにある会話を残して新しい key だけを足し、並べ直す', () => {
    const existing = [conversation('a', 3000, { unreadCount: 2 }), conversation('b', 1000)];
    const incoming = [conversation('a', 500, { unreadCount: 0 }), conversation('c', 2000), conversation('c', 100)];

    const merged = mergeFediverseConversations(existing, incoming);

    expect(merged.map(({ key }) => key)).toEqual(['a', 'c', 'b']);
    expect(merged[0]?.unreadCount).toBe(2);
  });
});

describe('メッセージの取り込み', () => {
  it('新しい投稿を足し、すでにある投稿は新しい内容に置き換えて、日時の古い順に並べる', () => {
    const existing = [status('m1', '2026-11-12T01:00:00.000Z'), status('m2', '2026-11-12T02:00:00.000Z')];
    const incoming = [
      status('m2', '2026-11-12T02:00:00.000Z', ALICE.accountId!, { content: '<p>edited</p>' }),
      status('m3', '2026-11-12T03:00:00.000Z'),
    ];

    const merged = mergeFediverseMessages(existing, incoming);

    expect(merged.messages.map(({ id }) => id)).toEqual(['m1', 'm2', 'm3']);
    expect(merged.messages[1]?.content).toBe('<p>edited</p>');
    expect(merged.added.map(({ id }) => id)).toEqual(['m3']);
  });

  it('同じ投稿が二重に入っても、一度だけ数える', () => {
    const merged = mergeFediverseMessages([], [
      status('m1', '2026-11-12T01:00:00.000Z'),
      status('m1', '2026-11-12T01:00:00.000Z'),
    ]);

    expect(merged.messages).toHaveLength(1);
    expect(merged.added).toHaveLength(1);
  });

  it('新着が無ければ added を空にする', () => {
    const existing = [status('m1', '2026-11-12T01:00:00.000Z')];

    expect(mergeFediverseMessages(existing, existing).added).toEqual([]);
  });

  it('以前のメッセージは先頭側に入る', () => {
    const merged = prependOlderFediverseMessages(
      [status('m3', '2026-11-12T03:00:00.000Z')],
      [status('m1', '2026-11-12T01:00:00.000Z'), status('m2', '2026-11-12T02:00:00.000Z')],
    );

    expect(merged.map(({ id }) => id)).toEqual(['m1', 'm2', 'm3']);
  });

  it('相手の投稿が新着に入っているときだけ、既読にする対象とみなす', () => {
    const mine = status('m1', '2026-11-12T01:00:00.000Z', 'actor-me');
    const theirs = status('m2', '2026-11-12T02:00:00.000Z', ALICE.accountId!);

    expect(hasIncomingFediverseMessage([mine], 'actor-me')).toBe(false);
    expect(hasIncomingFediverseMessage([mine, theirs], 'actor-me')).toBe(true);
    expect(hasIncomingFediverseMessage([], 'actor-me')).toBe(false);
  });

  it('相手の accountId が null でも、相手の投稿が新着に入っていれば既読にする対象とみなす', () => {
    const theirs = status('m2', '2026-11-12T02:00:00.000Z', 'actor-unresolved');

    expect(hasIncomingFediverseMessage([theirs], 'actor-me')).toBe(true);
  });
});

describe('isOwnFediverseMessage', () => {
  it('閲覧者のアカウントが書いた投稿だけを、自分の投稿にする', () => {
    expect(isOwnFediverseMessage(status('m1', '2026-11-12T01:00:00.000Z', 'actor-me'), 'actor-me')).toBe(true);
    expect(isOwnFediverseMessage(status('m2', '2026-11-12T01:00:00.000Z', BOB.accountId!), 'actor-me')).toBe(false);
  });

  it('相手の accountId が null でも、相手の投稿を自分の投稿にしない', () => {
    expect(isOwnFediverseMessage(status('m1', '2026-11-12T01:00:00.000Z', 'actor-unresolved'), 'actor-me')).toBe(false);
  });
});

describe('fediverseConversationTitle / fediverseLastMessageSummary', () => {
  it('相手の表示名を並べ、表示名が空なら acct にする', () => {
    expect(fediverseConversationTitle([ALICE])).toBe('Alice');
    expect(fediverseConversationTitle([ALICE, BOB])).toBe('Alice、Bob');
    expect(fediverseConversationTitle([{ ...ALICE, displayName: ' ' }])).toBe('alice@remote.example');
    expect(fediverseConversationTitle([])).toBe('会話');
  });

  it('最後のメッセージを要約し、本文が空なら添付、無ければ空の案内にする', () => {
    expect(fediverseLastMessageSummary({ text: 'やあ', sentAt: 1, own: false })).toBe('やあ');
    expect(fediverseLastMessageSummary({ text: '', sentAt: 1, own: false })).toBe('添付ファイルを送りました');
    expect(fediverseLastMessageSummary(null)).toBe('まだメッセージはありません');
  });
});

describe('fediverseMessageDisclosure', () => {
  it('CW があるとき spoiler を返し、センシティブな添付があるときだけメディアを隠す', () => {
    expect(fediverseMessageDisclosure(status('m', '2026-11-12T01:00:00.000Z'))).toEqual({
      spoiler: null,
      concealsMedia: false,
    });
    expect(fediverseMessageDisclosure(status('m', '2026-11-12T01:00:00.000Z', 'a', { spoiler_text: '注意' })))
      .toEqual({ spoiler: '注意', concealsMedia: false });
    expect(
      fediverseMessageDisclosure(
        status('m', '2026-11-12T01:00:00.000Z', 'a', { sensitive: true, media_attachments: [] }),
      ).concealsMedia,
    ).toBe(false);
    expect(
      fediverseMessageDisclosure(
        status('m', '2026-11-12T01:00:00.000Z', 'a', {
          sensitive: true,
          media_attachments: [{ type: 'image' }] as Status['media_attachments'],
        }),
      ).concealsMedia,
    ).toBe(true);
  });
});
