import { describe, expect, it } from 'vitest';

import { reportPostParams } from './reportPostParams.ts';

const target = { accountId: 'actor-1', acct: 'alice@remote.example', statusId: 'post-1' };

describe('reportPostParams', () => {
  it('対象のアカウント ID と投稿 ID を status_ids に入れる', () => {
    expect(reportPostParams(target, { category: 'spam', comment: '宣伝です' })).toEqual({
      account_id: 'actor-1',
      category: 'spam',
      comment: '宣伝です',
      status_ids: ['post-1'],
    });
  });

  it('offensive は violation に変換する', () => {
    expect(reportPostParams(target, { category: 'offensive', comment: '' }).category).toBe('violation');
  });

  it('other はそのまま渡す', () => {
    expect(reportPostParams(target, { category: 'other', comment: '' }).category).toBe('other');
  });
});
