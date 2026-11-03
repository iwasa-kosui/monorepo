import { describe, expect, it } from 'vitest';

import { translationErrorMessage } from './translation.ts';

describe('translationErrorMessage', () => {
  it('429 は今日の回数を使い切ったと伝える', () => {
    expect(translationErrorMessage(429)).toBe('今日の翻訳の回数を使い切りました');
  });

  it('503 は時間をおいて試すよう伝える', () => {
    expect(translationErrorMessage(503)).toBe('翻訳できませんでした。時間をおいてもう一度お試しください');
  });

  it.each([400, 403, 404, 500, undefined])('%s はそのほかの失敗として伝える', (status) => {
    expect(translationErrorMessage(status)).toBe('翻訳できませんでした');
  });
});
