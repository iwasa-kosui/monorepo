import { describe, expect, it } from 'vitest';

import {
  FEDIVERSE_CONVERSATION_MAX_KEY_LENGTH,
  FEDIVERSE_CONVERSATION_MAX_PEERS,
  FEDIVERSE_CONVERSATION_MAX_URI_LENGTH,
  FediverseConversationKey,
} from './conversationKey.ts';

const alice = 'https://remote.example/users/alice';
const bob = 'https://other.example/users/bob';
const uris = (count: number) => Array.from({ length: count }, (_, i) => `https://h.example/users/u${i}`);
const base64Url = (text: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text))).replaceAll('+', '-').replaceAll('/', '_').replaceAll(
    '=',
    '',
  );

describe('FediverseConversationKey', () => {
  it('URI の組を、base64url の文字だけの key に往復できる', () => {
    const key = FediverseConversationKey.encode([alice, bob]);

    expect(key.ok && key.val).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(key.ok && FediverseConversationKey.decode(key.val)).toEqual({ ok: true, val: [bob, alice] });
  });

  it('並べ替えと重複に関わらず、同じ組から同じ key を作る', () => {
    const keys = [[alice, bob], [bob, alice], [bob, alice, bob]].map((peers) => FediverseConversationKey.encode(peers));

    expect(keys.every((key) => key.ok && key.val === (keys[0]!.ok ? keys[0].val : undefined))).toBe(true);
  });

  it('ASCII でない URI も往復できる', () => {
    const uri = 'https://例え.example/users/あ';

    const key = FediverseConversationKey.encode([uri]);

    expect(key.ok && FediverseConversationKey.decode(key.val)).toEqual({ ok: true, val: [uri] });
  });

  it('相手が 10 人までなら受け付け、11 人からは too_many_peers にする', () => {
    expect(FediverseConversationKey.encode(uris(FEDIVERSE_CONVERSATION_MAX_PEERS)).ok).toBe(true);
    expect(FediverseConversationKey.encode(uris(FEDIVERSE_CONVERSATION_MAX_PEERS + 1))).toEqual({
      ok: false,
      err: { type: 'FediverseConversationKeyInvalid', reason: 'too_many_peers' },
    });
  });

  it('相手がいない組と、URL でも http(s) でもない要素と、長すぎる URI を作らない', () => {
    const reasonOf = (peers: string[]) => {
      const key = FediverseConversationKey.encode(peers);
      return key.ok ? undefined : key.err.reason;
    };

    expect(reasonOf([])).toBe('empty');
    expect(reasonOf(['nope'])).toBe('invalid_uri');
    expect(reasonOf(['ftp://remote.example/alice'])).toBe('invalid_uri');
    expect(reasonOf([`https://h.example/${'a'.repeat(FEDIVERSE_CONVERSATION_MAX_URI_LENGTH)}`])).toBe('invalid_uri');
  });

  it.each([
    ['空文字', ''],
    ['base64url にない文字', 'a b'],
    ['パディング付き', 'WyJodHRwczovL2EuZXhhbXBsZSJd=='],
    ['base64url として読めない', 'a'],
    ['UTF-8 として読めない', '_w'],
    ['JSON でない', base64Url('nope')],
    ['配列でない', base64Url('{"a":1}')],
    ['配列の要素が文字列でない', base64Url('[1]')],
    ['空の配列', base64Url('[]')],
    ['並べ替えていない配列', base64Url(JSON.stringify([alice, bob]))],
    ['重複のある配列', base64Url(JSON.stringify([alice, alice]))],
    ['11 人の配列', base64Url(JSON.stringify(uris(11)))],
    ['長すぎる key', 'a'.repeat(FEDIVERSE_CONVERSATION_MAX_KEY_LENGTH + 1)],
  ])('%s を decode で拒む', (_name, key) => {
    expect(FediverseConversationKey.decode(key).ok).toBe(false);
  });
});
