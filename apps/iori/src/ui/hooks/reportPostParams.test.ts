import { describe, expect, it } from 'vitest';

import { reportPostParams } from './reportPostParams.ts';

const target = { accountId: 'actor-1', acct: 'alice@remote.example', statusId: 'post-1' };

describe('reportPostParams', () => {
  it('投稿 ID を status_ids に入れ、offensive は violation に変換する', () => {
    expect(reportPostParams(target, { category: 'offensive', comment: '宣伝です' })).toEqual({
      account_id: 'actor-1',
      category: 'violation',
      comment: '宣伝です',
      status_ids: ['post-1'],
    });
  });
});
