import type {
  IoriBlueskyScopeStatusBody,
  IoriBlueskyStatusResponse,
} from '../../adaptor/routes/workerIoriBlueskyRouter.ts';

export type BlueskyStatusPage = 'home' | 'notifications';

export type BlueskyStatusNotice = Readonly<{
  title: string;
  detail: string;
  action?: Readonly<{ kind: 'reload'; label: string }>;
}>;

const STALE_AFTER_MS = 3 * 60 * 1000;
const LOGIN_FAILED_TITLE = 'Bluesky にログインできません';
const REPLACE_PASSWORD_HINT =
  'アプリパスワードを取り消したか変更した場合は、設定画面の「Bluesky の連携」で新しいアプリパスワードを登録し直してください。';

const two = (value: number): string => String(value).padStart(2, '0');

const formatTime = (iso: string, now: number): string => {
  const at = new Date(iso);
  const clock = `${two(at.getHours())}:${two(at.getMinutes())}`;
  const today = new Date(now);
  const isToday = at.getFullYear() === today.getFullYear()
    && at.getMonth() === today.getMonth()
    && at.getDate() === today.getDate();
  return isToday ? clock : `${at.getMonth() + 1}/${at.getDate()} ${clock}`;
};

const unfetchedNotice = (
  scope: IoriBlueskyScopeStatusBody,
  page: BlueskyStatusPage,
  now: number,
): BlueskyStatusNotice | undefined => {
  if (scope.state !== 'failing' || scope.failureKind === 'auth') return undefined;
  const succeededAt = scope.lastSucceededAt;
  if (succeededAt !== null && now - Date.parse(succeededAt) < STALE_AFTER_MS) return undefined;
  const lead = succeededAt === null
    ? 'まだ一度も取得できていません。'
    : `最後に取得できたのは ${formatTime(succeededAt, now)} です。`;
  const code = scope.failureCode === null ? '' : `（${scope.failureCode}）`;
  return {
    title: page === 'home' ? 'Bluesky の投稿を取得できていません' : 'Bluesky の通知を取得できていません',
    detail: `${lead}Bluesky か通信の問題の可能性があります。1分ごとに自動で取得し直します。${code}`,
  };
};

export const blueskyStatusNotices = (
  input: Readonly<{
    status: IoriBlueskyStatusResponse | undefined;
    page: BlueskyStatusPage;
    clientLoadFailed: boolean;
    now: number;
  }>,
): readonly BlueskyStatusNotice[] => {
  const { status, page, clientLoadFailed, now } = input;
  if (status?.enabled === false) return [];
  const notices: BlueskyStatusNotice[] = [];
  if (status !== undefined) {
    const scope = page === 'home' ? status.timeline : status.notifications;
    if (status.login.state === 'waiting') {
      notices.push({
        title: LOGIN_FAILED_TITLE,
        detail: `${
          formatTime(status.login.failedAt, now)
        } にログインに失敗しました。Bluesky の障害の可能性もあります。${
          formatTime(status.login.retryAt, now)
        } にもう一度ログインします。${REPLACE_PASSWORD_HINT}`,
      });
    } else if (scope.state === 'failing' && scope.failureKind === 'auth') {
      notices.push({ title: LOGIN_FAILED_TITLE, detail: `Bluesky のログインが切れています。${REPLACE_PASSWORD_HINT}` });
    }
    const unfetched = unfetchedNotice(scope, page, now);
    if (unfetched !== undefined) notices.push(unfetched);
  }
  if (clientLoadFailed && status?.enabled === true) {
    notices.push({
      title: 'Bluesky を読み込めませんでした',
      detail: 'iori のサーバーから Bluesky の投稿を読み込めませんでした。',
      action: { kind: 'reload', label: '再読み込み' },
    });
  }
  return notices;
};
