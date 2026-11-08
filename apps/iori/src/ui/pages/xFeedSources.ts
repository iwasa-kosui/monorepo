import { type FeedSource, isMastodonApiError } from '../api/mastodonClient.ts';

export const EMPTY_USERNAME_MESSAGE = 'ユーザー名を入力してください。';

export const xUserSourcesOf = (sources: readonly FeedSource[]): readonly FeedSource[] =>
  sources.filter((source) => source.kind === 'x_user');

export const normalizeXUsername = (input: string): string => input.trim().replace(/^@/, '');

const statusOf = (error: unknown): number | undefined => isMastodonApiError(error) ? error.status : undefined;

export const addXUserFailureMessage = (error: unknown): string => {
  switch (statusOf(error)) {
    case 400:
      return 'ユーザー名が正しくありません。英数字とアンダースコアだけで、15文字までです。';
    case 409:
      return 'このユーザーはすでに追加されています。';
    case 403:
      return 'ユーザーを追加できるのは所有者だけです。';
    default:
      return '追加できませんでした。時間をおいてもう一度お試しください。';
  }
};

export const toggleFailureMessage = (error: unknown): string =>
  statusOf(error) === 404
    ? 'このユーザーが見つかりません。ページを読み込み直してください。'
    : '切り替えられませんでした。時間をおいてもう一度お試しください。';

export const withSourceEnabled = (
  sources: readonly FeedSource[],
  feedSourceId: string,
  enabled: boolean,
): readonly FeedSource[] =>
  sources.map((source) => source.feedSourceId === feedSourceId ? { ...source, enabled } : source);

export const withSource = (sources: readonly FeedSource[], saved: FeedSource): readonly FeedSource[] =>
  sources.some((source) => source.feedSourceId === saved.feedSourceId)
    ? sources.map((source) => source.feedSourceId === saved.feedSourceId ? saved : source)
    : [...sources, saved];

export type AddXUserOutcome =
  | Readonly<{ ok: true; source: FeedSource }>
  | Readonly<{ ok: false; message: string; error: unknown }>;

export const addXUserSource = async ({
  input,
  request,
}: Readonly<{
  input: string;
  request: (username: string) => Promise<FeedSource>;
}>): Promise<AddXUserOutcome> => {
  const username = normalizeXUsername(input);
  if (username === '') return { ok: false, message: EMPTY_USERNAME_MESSAGE, error: undefined };
  try {
    return { ok: true, source: await request(username) };
  } catch (error) {
    return { ok: false, message: addXUserFailureMessage(error), error };
  }
};

export const runOptimisticToggle = async ({
  feedSourceId,
  enabled,
  request,
  updateSources,
}: Readonly<{
  feedSourceId: string;
  enabled: boolean;
  request: (feedSourceId: string, enabled: boolean) => Promise<FeedSource>;
  updateSources: (updater: (sources: readonly FeedSource[]) => readonly FeedSource[]) => void;
}>): Promise<void> => {
  updateSources((sources) => withSourceEnabled(sources, feedSourceId, enabled));
  let saved: FeedSource;
  try {
    saved = await request(feedSourceId, enabled);
  } catch (error) {
    updateSources((sources) => withSourceEnabled(sources, feedSourceId, !enabled));
    throw error;
  }
  updateSources((sources) => withSource(sources, saved));
};
