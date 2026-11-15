import { describe, expect, it } from 'vitest';

import { parseMentionQuery } from './mentionQuery.ts';

describe('parseMentionQuery', () => {
  it('先頭の @ を外してユーザー名だけの条件にする', () => {
    expect(parseMentionQuery('@ali')).toEqual({ username: 'ali', host: undefined });
  });

  it('ホストを書きかけのときはホストで絞らない', () => {
    expect(parseMentionQuery('alice@')).toEqual({ username: 'alice', host: undefined });
  });

  it('ホストは小文字にそろえて前方一致の条件にする', () => {
    expect(parseMentionQuery('alice@Remote.Ex')).toEqual({ username: 'alice', host: 'remote.ex' });
  });

  it('LIKE のワイルドカードになる文字や @ の重なりは宛先として扱わない', () => {
    expect(parseMentionQuery('a%')).toBeUndefined();
    expect(parseMentionQuery('alice@remote@x')).toBeUndefined();
    expect(parseMentionQuery('')).toBeUndefined();
  });
});
