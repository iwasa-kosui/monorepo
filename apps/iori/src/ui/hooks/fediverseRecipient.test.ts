import { describe, expect, it } from 'vitest';

import type { Account } from '../../adaptor/mastodon/entities.ts';
import {
  hasRecipientHandle,
  normalizeRecipientQuery,
  recipientCandidates,
  resolvableRecipientHandle,
} from './fediverseRecipient.ts';

const LOCAL = {
  id: 'actor-local',
  username: 'kosui',
  acct: 'kosui',
  uri: 'https://iori.example/users/kosui',
} as Account;
const ALICE = {
  id: 'actor-alice',
  username: 'alice',
  acct: 'alice@remote.example',
  uri: 'https://remote.example/users/alice',
} as Account;
const BLUESKY = {
  id: 'bluesky:did:plc:carol',
  username: 'carol.bsky.social',
  acct: 'carol.bsky.social',
  uri: 'https://bsky.app/profile/did:plc:carol',
} as Account;

describe('normalizeRecipientQuery', () => {
  it('前後の空白と先頭の @ を取り除く', () => {
    expect(normalizeRecipientQuery('  @alice@remote.example ')).toBe('alice@remote.example');
    expect(normalizeRecipientQuery('kosui')).toBe('kosui');
  });
});

describe('resolvableRecipientHandle', () => {
  it('user@host の形のときだけ、解決する対象として返す', () => {
    expect(resolvableRecipientHandle('alice@remote.example')).toBe('alice@remote.example');
    expect(resolvableRecipientHandle('alice')).toBeUndefined();
    expect(resolvableRecipientHandle('alice@')).toBeUndefined();
    expect(resolvableRecipientHandle('alice@remote')).toBeUndefined();
    expect(resolvableRecipientHandle('alice@remote.example/extra')).toBeUndefined();
    expect(resolvableRecipientHandle('a@b@remote.example')).toBeUndefined();
  });
});

describe('hasRecipientHandle', () => {
  it('ホスト名の大文字小文字を区別せず、候補に入力されたアカウントがあるか判定する', () => {
    expect(hasRecipientHandle([ALICE], 'Alice@Remote.example')).toBe(true);
    expect(hasRecipientHandle([ALICE], 'bob@remote.example')).toBe(false);
  });

  it('ローカルのアカウントは、自分のホスト名つきの形で照合する', () => {
    expect(hasRecipientHandle([LOCAL], 'kosui@iori.example')).toBe(true);
  });
});

describe('recipientCandidates', () => {
  it('自分自身と Bluesky のアカウントを候補から外す', () => {
    expect(recipientCandidates({ found: [LOCAL, ALICE, BLUESKY], resolved: undefined, selfAccountId: LOCAL.id }))
      .toEqual([ALICE]);
  });

  it('解決したアカウントを、検索で見つかった候補の後ろに足す', () => {
    expect(recipientCandidates({ found: [LOCAL], resolved: ALICE, selfAccountId: undefined }))
      .toEqual([LOCAL, ALICE]);
  });

  it('解決したアカウントが自分自身なら足さない', () => {
    expect(recipientCandidates({ found: [], resolved: LOCAL, selfAccountId: LOCAL.id })).toEqual([]);
  });

  it('同じアカウントを重複して返さない', () => {
    expect(recipientCandidates({ found: [ALICE], resolved: ALICE, selfAccountId: undefined })).toEqual([ALICE]);
  });
});
