/**
 * search.messages のマッチオブジェクトはスレッド返信であっても
 * `thread_ts` が欠落することがあるが、permalink には
 * `?thread_ts=...&cid=...` の形でスレッド情報が含まれる。
 * permalink からスレッドの親 ts を抽出するためのユーティリティ。
 *
 * 例: https://workspace.slack.com/archives/C123/p1234567890123456?thread_ts=1234567880.123400&cid=C123
 */
export const extractThreadTsFromPermalink = (
  permalink: string,
): string | undefined => {
  const match = permalink.match(/[?&]thread_ts=([^&]+)/);
  const raw = match?.[1];
  if (raw == null) return undefined;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
};
