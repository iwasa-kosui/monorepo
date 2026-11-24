/**
 * トップページのタイムラインに並べる項目と、その並べ方。
 */

export type TimelineKind = 'post' | 'talk' | 'external-article';

export type TimelineEntry = Readonly<{
  kind: TimelineKind;
  /** ISO 8601 の日時 */
  date: string;
  title: string;
  href: string;
  /** 外部サイトへのリンクか */
  external: boolean;
  /** 登壇したイベント名や、寄稿先の名前 */
  context?: string;
  description?: string;
  themes: readonly string[];
  /** ページ遷移でタイトルをつなぐための名前 */
  transitionName?: string;
}>;

export const KIND_LABEL: Readonly<Record<TimelineKind, string>> = {
  post: 'Post',
  talk: 'Talk',
  'external-article': 'External',
};

const TOKYO = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

const tokyoParts = (
  date: string,
): Readonly<{ year: string; month: string; day: string }> => {
  const parts = TOKYO.formatToParts(new Date(date));
  const part = (type: Intl.DateTimeFormatPartTypes): string => parts.find((p) => p.type === type)?.value ?? '';
  return { year: part('year'), month: part('month'), day: part('day') };
};

/** 日本時間での年 */
export const yearOf = (date: string): string => tokyoParts(date).year;

/** 日本時間での月日（例: 11.15） */
export const formatMonthDay = (date: string): string => {
  const { month, day } = tokyoParts(date);
  return `${month}.${day}`;
};

export type YearGroup = Readonly<{
  year: string;
  entries: readonly TimelineEntry[];
}>;

/**
 * 新しい順に並べ、年ごとにまとめる。
 */
export const groupByYear = (
  entries: readonly TimelineEntry[],
): readonly YearGroup[] => {
  const sorted = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
  );
  const groups = new Map<string, TimelineEntry[]>();
  for (const entry of sorted) {
    const year = yearOf(entry.date);
    groups.set(year, [...(groups.get(year) ?? []), entry]);
  }
  return [...groups].map(([year, grouped]) => ({ year, entries: grouped }));
};
