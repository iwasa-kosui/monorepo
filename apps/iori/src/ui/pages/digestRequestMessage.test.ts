import { describe, expect, it } from 'vitest';

import { buildDigestRequestFailureMessage } from './digestRequestMessage.ts';

describe('buildDigestRequestFailureMessage', () => {
  it('409 で公開済みなら、作り直せないと伝える', () => {
    expect(buildDigestRequestFailureMessage({ status: 409, error: 'Digest already published' })).toBe(
      '今日のダイジェストは公開済みのため、作り直せません。',
    );
  });

  it('409 で編集済みの下書きがあるなら、作り直せないと伝える', () => {
    expect(buildDigestRequestFailureMessage({ status: 409, error: 'Digest draft edited' })).toBe(
      '編集済みの下書きがあるため作り直せません。',
    );
  });

  it('409 で間隔が短いなら、Retry-After の秒数を入れて伝える', () => {
    expect(
      buildDigestRequestFailureMessage({ status: 409, error: 'Digest request too soon', retryAfterSeconds: 45 }),
    ).toBe('続けて作ることはできません。45秒後にもう一度お試しください。');
  });

  it('409 で間隔が短く Retry-After がなければ、秒数を入れずに伝える', () => {
    expect(buildDigestRequestFailureMessage({ status: 409, error: 'Digest request too soon' })).toBe(
      '続けて作ることはできません。しばらくしてからもう一度お試しください。',
    );
  });

  it('429 なら、1日の上限を伝える', () => {
    expect(buildDigestRequestFailureMessage({ status: 429, error: 'limit', retryAfterSeconds: 3600 })).toBe(
      '今日はこれ以上作れません（1日3回まで）。',
    );
  });

  it('それ以外の状態、未知の 409、ネットワークエラーは同じ文面にする', () => {
    const generic = 'ダイジェストを作れませんでした。時間をおいてもう一度お試しください。';

    expect(buildDigestRequestFailureMessage({ status: 500, error: 'Internal Server Error' })).toBe(generic);
    expect(buildDigestRequestFailureMessage({ status: 401 })).toBe(generic);
    expect(buildDigestRequestFailureMessage({ status: 409, error: 'other' })).toBe(generic);
    expect(buildDigestRequestFailureMessage({})).toBe(generic);
  });
});
