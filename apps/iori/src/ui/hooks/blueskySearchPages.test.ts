import { describe, expect, it } from 'vitest';

import { autoLoadCursor, nextSearchCursor, toSearchFailure } from './blueskySearchPages.ts';

describe('nextSearchCursor', () => {
  it('続きがあるときは返ってきた cursor を次に使う', () => {
    expect(nextSearchCursor(undefined, 'c2', 25)).toBe('c2');
    expect(nextSearchCursor('c2', 'c3', 25)).toBe('c3');
  });

  it('cursor が null なら続きは無い', () => {
    expect(nextSearchCursor('c2', null, 25)).toBeUndefined();
  });

  it('0 件の応答や、同じ cursor が返ってきたときは続きを読まない', () => {
    expect(nextSearchCursor('c2', 'c3', 0)).toBeUndefined();
    expect(nextSearchCursor('c2', 'c2', 25)).toBeUndefined();
  });
});

describe('toSearchFailure', () => {
  it('API のエラーから status と code を取り出す', () => {
    expect(toSearchFailure(Object.assign(new Error('x'), { status: 502, code: 'auth' }))).toEqual({
      status: 502,
      code: 'auth',
    });
    expect(toSearchFailure(Object.assign(new Error('x'), { status: 429 }))).toEqual({
      status: 429,
      code: undefined,
    });
  });

  it('API のエラーでなければ status も code も持たない', () => {
    expect(toSearchFailure(new TypeError('Failed to fetch'))).toEqual({ status: undefined, code: undefined });
  });
});

describe('autoLoadCursor', () => {
  it('続きの読み込みが失敗していなければ cursor をそのまま使う', () => {
    expect(autoLoadCursor('c2', undefined)).toBe('c2');
    expect(autoLoadCursor(undefined, undefined)).toBeUndefined();
  });

  it('続きの読み込みが失敗しているあいだはスクロールで自動では読まない', () => {
    expect(autoLoadCursor('c2', { status: 502, code: undefined })).toBeUndefined();
  });
});
