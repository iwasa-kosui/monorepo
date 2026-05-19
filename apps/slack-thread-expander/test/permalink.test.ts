import { describe, expect, it } from 'vitest';

import { Permalink } from '../src/domain/permalink.ts';

const parsePermalink = (raw: string) => Permalink.schema.parse(raw);

describe('Permalink.extractThreadTs', () => {
  it('スレッド返信の permalink から thread_ts を抽出する', () => {
    const permalink = parsePermalink(
      'https://example.slack.com/archives/C03387UAMQR/p1644939337956639?thread_ts=1644938961.726289&cid=C03387UAMQR',
    );
    expect(Permalink.extractThreadTs(permalink)).toBe('1644938961.726289');
  });

  it('thread_ts のみのクエリでも抽出できる', () => {
    const permalink = parsePermalink(
      'https://example.slack.com/archives/C03387UAMQR/p1644939337956639?thread_ts=1644938961.726289',
    );
    expect(Permalink.extractThreadTs(permalink)).toBe('1644938961.726289');
  });

  it('別のクエリパラメータの後ろにあっても抽出できる', () => {
    const permalink = parsePermalink(
      'https://example.slack.com/archives/C03387UAMQR/p1644939337956639?cid=C03387UAMQR&thread_ts=1644938961.726289',
    );
    expect(Permalink.extractThreadTs(permalink)).toBe('1644938961.726289');
  });

  it('トップレベルメッセージの permalink は undefined を返す', () => {
    const permalink = parsePermalink(
      'https://example.slack.com/archives/C03387UAMQR/p1644939337956639',
    );
    expect(Permalink.extractThreadTs(permalink)).toBeUndefined();
  });

  it('無関係なクエリしかない permalink は undefined を返す', () => {
    const permalink = parsePermalink(
      'https://example.slack.com/archives/C03387UAMQR/p1644939337956639?cid=C03387UAMQR',
    );
    expect(Permalink.extractThreadTs(permalink)).toBeUndefined();
  });

  it('thread_ts の形式が不正なら undefined を返す', () => {
    const permalink = parsePermalink(
      'https://example.slack.com/archives/C0/p1?thread_ts=not-a-ts',
    );
    expect(Permalink.extractThreadTs(permalink)).toBeUndefined();
  });
});
