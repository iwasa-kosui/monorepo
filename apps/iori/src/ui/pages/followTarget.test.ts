import { describe, expect, it } from 'vitest';

import { parseFollowTarget } from './followTarget.ts';

const OWN_HOST = 'iori.test';

describe('parseFollowTarget', () => {
  it.each([
    ['@user@remote.example', 'user@remote.example'],
    ['user@remote.example', 'user@remote.example'],
    ['acct:user@remote.example', 'user@remote.example'],
    ['acct:@user@remote.example', 'user@remote.example'],
    ['  @user@remote.example  ', 'user@remote.example'],
  ])('%s は先頭の acct: と @ を取り除いて検索する', (input, query) => {
    expect(parseFollowTarget(input, OWN_HOST)).toEqual({ type: 'search', query });
  });

  it('https の URL はそのまま検索する', () => {
    expect(parseFollowTarget('https://remote.example/users/user', OWN_HOST)).toEqual({
      type: 'search',
      query: 'https://remote.example/users/user',
    });
  });

  it.each([
    'http://remote.example/users/user',
    'ftp://remote.example/users/user',
    'https://',
  ])('%s は解決しない', (input) => {
    expect(parseFollowTarget(input, OWN_HOST)).toEqual({ type: 'unsupported' });
  });

  it.each([
    'user',
    '@user',
    '@user@iori.test',
    'acct:user@IORI.test',
    'https://iori.test/users/user',
  ])('%s は自サーバーのアカウントとして検索しない', (input) => {
    expect(parseFollowTarget(input, OWN_HOST)).toEqual({ type: 'local' });
  });
});
