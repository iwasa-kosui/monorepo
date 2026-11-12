import { describe, expect, it } from 'vitest';

import type {
  IoriBlueskyScopeStatusBody,
  IoriBlueskyStatusResponse,
} from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import { blueskyStatusNotices } from './blueskyStatusNotices.ts';

const MINUTE = 60_000;
const NOW = new Date(2026, 10, 12, 15, 30).getTime();
const iso = (at: Date) => at.toISOString();
const ago = (ms: number) => iso(new Date(NOW - ms));

const scope = (overrides: Partial<IoriBlueskyScopeStatusBody> = {}): IoriBlueskyScopeStatusBody => ({
  state: 'ok',
  lastSucceededAt: ago(MINUTE),
  lastFailedAt: null,
  failureKind: null,
  failureCode: null,
  ...overrides,
});

const enabled = (
  overrides: Partial<Extract<IoriBlueskyStatusResponse, { enabled: true }>> = {},
): IoriBlueskyStatusResponse => ({
  enabled: true,
  timeline: scope(),
  notifications: scope(),
  login: { state: 'ok' },
  ...overrides,
});

const notices = (
  status: IoriBlueskyStatusResponse | undefined,
  page: 'home' | 'notifications' = 'home',
  clientLoadFailed = false,
) => blueskyStatusNotices({ status, page, clientLoadFailed, now: NOW });

const PASSWORD_HINT =
  'アプリパスワードを取り消したか変更した場合は、BLUESKY_APP_PASSWORD を新しいアプリパスワードに替えてデプロイしてください。';

describe('blueskyStatusNotices', () => {
  it('何も問題が無ければ空の配列を返す', () => {
    expect(notices(enabled())).toEqual([]);
    expect(notices(enabled(), 'notifications')).toEqual([]);
    expect(notices(undefined)).toEqual([]);
  });

  it('無効なときは、読み込みの失敗があっても何も出さない', () => {
    expect(notices({ enabled: false }, 'home', true)).toEqual([]);
  });

  describe('ログインの待ち時間（a）', () => {
    const waiting = enabled({
      login: {
        state: 'waiting',
        failedAt: iso(new Date(2026, 10, 12, 15, 5)),
        retryAt: iso(new Date(2026, 10, 12, 15, 35)),
      },
    });

    it('失敗と再試行の時刻を HH:mm で出す', () => {
      expect(notices(waiting)).toEqual([
        {
          title: 'Bluesky にログインできません',
          detail: `15:05 にログインに失敗しました。15:35 にもう一度ログインします。${PASSWORD_HINT}`,
        },
      ]);
    });

    it('通知の画面でも出す', () => {
      expect(notices(waiting, 'notifications').map((notice) => notice.title)).toEqual([
        'Bluesky にログインできません',
      ]);
    });

    it('日付が今日でない時刻には M/D を付ける', () => {
      const crossing = enabled({
        login: {
          state: 'waiting',
          failedAt: iso(new Date(2026, 10, 11, 23, 50)),
          retryAt: iso(new Date(2026, 10, 12, 0, 20)),
        },
      });

      expect(notices(crossing)[0]?.detail).toContain('11/11 23:50 にログインに失敗しました。00:20 にもう一度');
    });

    it('同じ scope が auth で失敗していても、ログインの通知は 1 つだけにする', () => {
      const both = enabled({
        login: waiting.enabled ? waiting.login : { state: 'ok' },
        timeline: scope({ state: 'failing', failureKind: 'auth', lastFailedAt: ago(0) }),
      });

      expect(notices(both)).toHaveLength(1);
    });
  });

  describe('対象の scope の認証切れ（b）', () => {
    const expired = (page: 'timeline' | 'notifications') =>
      enabled({ [page]: scope({ state: 'failing', failureKind: 'auth', failureCode: 'ExpiredToken' }) });

    it('ホームでは timeline が auth で失敗しているときに出す', () => {
      expect(notices(expired('timeline'))).toEqual([
        {
          title: 'Bluesky にログインできません',
          detail: `Bluesky のログインが切れています。${PASSWORD_HINT}`,
        },
      ]);
    });

    it('通知では notifications が auth で失敗しているときだけ出す', () => {
      expect(notices(expired('timeline'), 'notifications')).toEqual([]);
      expect(notices(expired('notifications'), 'notifications').map((notice) => notice.title)).toEqual([
        'Bluesky にログインできません',
      ]);
      expect(notices(expired('notifications'), 'home')).toEqual([]);
    });
  });

  describe('取得できていない（c）', () => {
    const failing = (overrides: Partial<IoriBlueskyScopeStatusBody> = {}) =>
      scope({ state: 'failing', failureKind: 'http', lastFailedAt: ago(0), ...overrides });

    it('最後に取得できた時刻と、失敗のコードを出す', () => {
      const result = notices(enabled({
        timeline: failing({ lastSucceededAt: iso(new Date(2026, 10, 12, 15, 20)), failureCode: 'UpstreamFailure' }),
      }));

      expect(result).toEqual([
        {
          title: 'Bluesky の投稿を取得できていません',
          detail:
            '最後に取得できたのは 15:20 です。Bluesky か通信の問題の可能性があります。1分ごとに自動で取得し直します。（UpstreamFailure）',
        },
      ]);
    });

    it('通知の画面では通知の見出しにし、コードが無ければ括弧を付けない', () => {
      const result = notices(
        enabled({ notifications: failing({ lastSucceededAt: ago(10 * MINUTE), failureKind: 'network' }) }),
        'notifications',
      );

      expect(result[0]?.title).toBe('Bluesky の通知を取得できていません');
      expect(result[0]?.detail.endsWith('1分ごとに自動で取得し直します。')).toBe(true);
    });

    it('一度も取得できていなければ、その旨の文にする', () => {
      const result = notices(enabled({ timeline: failing({ lastSucceededAt: null }) }));

      expect(result[0]?.detail).toBe(
        'まだ一度も取得できていません。Bluesky か通信の問題の可能性があります。1分ごとに自動で取得し直します。',
      );
    });

    it('最後の成功が 3 分未満前なら出さない', () => {
      expect(notices(enabled({ timeline: failing({ lastSucceededAt: ago(3 * MINUTE - 1) }) }))).toEqual([]);
    });

    it('最後の成功がちょうど 3 分前なら出す', () => {
      expect(notices(enabled({ timeline: failing({ lastSucceededAt: ago(3 * MINUTE) }) }))).toHaveLength(1);
    });

    it('failing でなければ出さない', () => {
      expect(notices(enabled({ timeline: scope({ state: 'unknown', lastSucceededAt: null }) }))).toEqual([]);
    });
  });

  describe('ブラウザからの読み込みの失敗（d）', () => {
    it('再読み込みの操作つきで出す', () => {
      expect(notices(enabled(), 'home', true)).toEqual([
        {
          title: 'Bluesky を読み込めませんでした',
          detail: 'iori のサーバーから Bluesky の投稿を読み込めませんでした。',
          action: { kind: 'reload', label: '再読み込み' },
        },
      ]);
    });

    it('状態の取得ができていなくても出す', () => {
      expect(notices(undefined, 'notifications', true).map((notice) => notice.title)).toEqual([
        'Bluesky を読み込めませんでした',
      ]);
    });

    it('ほかの通知と並べて出す', () => {
      const result = notices(
        enabled({ timeline: scope({ state: 'failing', failureKind: 'auth' }) }),
        'home',
        true,
      );

      expect(result.map((notice) => notice.title)).toEqual([
        'Bluesky にログインできません',
        'Bluesky を読み込めませんでした',
      ]);
    });
  });
});
