import { describe, expect, it, vi } from 'vitest';

import type { FeedSource } from '../api/mastodonClient.ts';
import {
  addXUserFailureMessage,
  addXUserSource,
  EMPTY_USERNAME_MESSAGE,
  normalizeXUsername,
  refreshFailureMessage,
  refreshSuccessMessage,
  runOptimisticToggle,
  toggleFailureMessage,
  withSource,
  xUserSourcesOf,
} from './xFeedSources.ts';

const source = (overrides: Partial<FeedSource> = {}): FeedSource => ({
  feedSourceId: 'a',
  kind: 'x_user',
  url: 'https://x.com/jack',
  title: '@jack',
  enabled: true,
  lastFetchedAt: null,
  lastError: null,
  ...overrides,
});

const apiError = (status: number) => Object.assign(new Error('boom'), { status });

describe('xUserSourcesOf', () => {
  it('kind が x_user のものだけを残す', () => {
    const sources = [source({ feedSourceId: 'a' }), source({ feedSourceId: 'b', kind: 'rss' })];

    expect(xUserSourcesOf(sources).map((s) => s.feedSourceId)).toEqual(['a']);
  });
});

describe('normalizeXUsername', () => {
  it('前後の空白と先頭の @ を取り除く', () => {
    expect(normalizeXUsername('  @jack ')).toBe('jack');
    expect(normalizeXUsername('jack')).toBe('jack');
  });

  it('先頭以外の @ は残す', () => {
    expect(normalizeXUsername('ja@ck')).toBe('ja@ck');
  });
});

describe('addXUserSource', () => {
  it('@ を取り除いて送り、追加されたユーザーを返す', async () => {
    const saved = source({ feedSourceId: 'new', title: '@jack' });
    const request = vi.fn(() => Promise.resolve(saved));

    const outcome = await addXUserSource({ input: '@jack', request });

    expect(request).toHaveBeenCalledWith('jack');
    expect(outcome).toEqual({ ok: true, source: saved });
  });

  it('空の入力は送らずに、入力を促す', async () => {
    const request = vi.fn();

    const outcome = await addXUserSource({ input: ' @ ', request });

    expect(request).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ ok: false, message: EMPTY_USERNAME_MESSAGE });
  });

  it('失敗したら状態に合う文言とエラーを返す', async () => {
    const error = apiError(409);

    const outcome = await addXUserSource({ input: 'jack', request: () => Promise.reject(error) });

    expect(outcome).toEqual({ ok: false, message: 'このユーザーはすでに追加されています。', error });
  });
});

describe('addXUserFailureMessage', () => {
  it('400、409、403 をそれぞれ別の文言にする', () => {
    const messages = [400, 409, 403].map((status) => addXUserFailureMessage(apiError(status)));

    expect(messages[0]).toContain('ユーザー名が正しくありません');
    expect(messages[1]).toContain('すでに追加されています');
    expect(messages[2]).toContain('所有者だけ');
    expect(new Set(messages).size).toBe(3);
  });

  it('それ以外の状態とネットワークエラーは同じ文言にする', () => {
    const generic = '追加できませんでした。時間をおいてもう一度お試しください。';

    expect(addXUserFailureMessage(apiError(500))).toBe(generic);
    expect(addXUserFailureMessage(new TypeError('Failed to fetch'))).toBe(generic);
  });
});

describe('toggleFailureMessage', () => {
  it('404 は読み込み直しを促し、それ以外は共通の文言にする', () => {
    expect(toggleFailureMessage(apiError(404))).toContain('読み込み直して');
    expect(toggleFailureMessage(apiError(500))).toBe('切り替えられませんでした。時間をおいてもう一度お試しください。');
  });
});

describe('withSource', () => {
  it('同じ ID があれば置き換え、なければ末尾に足す', () => {
    const sources = [source({ feedSourceId: 'a' }), source({ feedSourceId: 'b' })];

    expect(withSource(sources, source({ feedSourceId: 'a', enabled: false })).map((s) => s.enabled)).toEqual([
      false,
      true,
    ]);
    expect(withSource(sources, source({ feedSourceId: 'c' })).map((s) => s.feedSourceId)).toEqual(['a', 'b', 'c']);
  });
});

describe('runOptimisticToggle', () => {
  const createStore = (initial: readonly FeedSource[]) => {
    let current = initial;
    return {
      get: () => current,
      update: (updater: (sources: readonly FeedSource[]) => readonly FeedSource[]) => {
        current = updater(current);
      },
    };
  };

  it('押した時点で画面を変え、成功したら応答の内容にする', async () => {
    const store = createStore([source({ enabled: true }), source({ feedSourceId: 'b' })]);
    let resolve!: (value: FeedSource) => void;
    const request = vi.fn(() => new Promise<FeedSource>((res) => (resolve = res)));

    const running = runOptimisticToggle({
      feedSourceId: 'a',
      enabled: false,
      request,
      updateSources: store.update,
    });

    expect(store.get()[0]?.enabled).toBe(false);
    resolve(source({ enabled: false, lastFetchedAt: '2026-11-06T01:00:00.000Z' }));
    await running;

    expect(request).toHaveBeenCalledWith('a', false);
    expect(store.get()[0]).toMatchObject({ enabled: false, lastFetchedAt: '2026-11-06T01:00:00.000Z' });
    expect(store.get()[1]?.enabled).toBe(true);
  });

  it('失敗したら表示を元に戻し、エラーを投げ直す', async () => {
    const store = createStore([source({ enabled: false })]);
    const error = apiError(500);

    await expect(
      runOptimisticToggle({
        feedSourceId: 'a',
        enabled: true,
        request: () => Promise.reject(error),
        updateSources: store.update,
      }),
    ).rejects.toBe(error);

    expect(store.get()[0]?.enabled).toBe(false);
  });
});

describe('refreshSuccessMessage', () => {
  it('取得するユーザーがいないとき（sources が 0）は、そのことを伝える', () => {
    expect(refreshSuccessMessage({ sources: 0, failed: 0, collected: 0 })).toBe('取得するユーザーがいません');
  });

  it('取り込んだ件数を伝える', () => {
    expect(refreshSuccessMessage({ sources: 2, failed: 0, collected: 7 })).toBe('7 件を取り込みました');
    expect(refreshSuccessMessage({ sources: 1, failed: 0, collected: 0 })).toBe('0 件を取り込みました');
  });

  it('失敗したユーザーがいるときは、人数を後ろにつなげる', () => {
    expect(refreshSuccessMessage({ sources: 3, failed: 2, collected: 4 })).toBe(
      '4 件を取り込みました（2 人は取得に失敗しました）',
    );
  });
});

describe('refreshFailureMessage', () => {
  it('409 は取り込みが無効だと伝える', () => {
    expect(refreshFailureMessage(apiError(409))).toBe('取り込みは無効です');
  });

  it('429 で retryAfterSeconds があれば、待つ秒数を伝える', () => {
    const error = Object.assign(new Error('boom'), { status: 429, retryAfterSeconds: 120 });

    expect(refreshFailureMessage(error)).toBe('あと 120 秒待ってから取得してください');
  });

  it('429 でも retryAfterSeconds が無ければ、既存の failureMessage の書き方にする', () => {
    expect(refreshFailureMessage(apiError(429))).toBe('Failed to refresh X posts: boom');
  });

  it('それ以外の API エラーとネットワークエラーは、既存の failureMessage の書き方にする', () => {
    expect(refreshFailureMessage(apiError(500))).toBe('Failed to refresh X posts: boom');
    expect(refreshFailureMessage(new TypeError('network'))).toBe('Failed to refresh X posts. Please try again.');
  });
});
