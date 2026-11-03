import type { Status } from '../../adaptor/mastodon/entities.ts';

export type SummaryCitation = Readonly<{ n: number; status: Status }>;

export type SummarySegment =
  | Readonly<{ type: 'text'; text: string }>
  | Readonly<{ type: 'link'; n: number; status: Status }>;

const citationGroup = /\[(\d+(?:\s*[,、]\s*\d+)*)\]/g;

export const splitSummaryCitations = (
  summary: string,
  citations: readonly SummaryCitation[],
): readonly SummarySegment[] => {
  const statusByNumber = new Map(citations.map((citation) => [citation.n, citation.status]));
  const segments: SummarySegment[] = [];
  const pushText = (text: string) => {
    if (text === '') return;
    const last = segments[segments.length - 1];
    if (last?.type === 'text') {
      segments[segments.length - 1] = { type: 'text', text: last.text + text };
    } else {
      segments.push({ type: 'text', text });
    }
  };
  let cursor = 0;
  for (const match of summary.matchAll(citationGroup)) {
    const group = match[1] ?? '';
    pushText(summary.slice(cursor, match.index));
    pushText('[');
    let separatorStart = 0;
    for (const number of group.matchAll(/\d+/g)) {
      pushText(group.slice(separatorStart, number.index));
      const status = statusByNumber.get(Number(number[0]));
      if (status === undefined) {
        pushText(number[0]);
      } else {
        segments.push({ type: 'link', n: Number(number[0]), status });
      }
      separatorStart = number.index + number[0].length;
    }
    pushText(']');
    cursor = match.index + match[0].length;
  }
  pushText(summary.slice(cursor));
  return segments;
};

export type SummaryRequestInput = Readonly<{
  query: string;
  since: string;
  until: string;
}>;

export type SummaryRequestBody = Readonly<{ q?: string; since?: string; until?: string }>;

export type SummaryRequestResult =
  | Readonly<{ ok: true; body: SummaryRequestBody }>
  | Readonly<{ ok: false; message: string }>;

const toIso = (value: string): string | undefined => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? undefined : new Date(time).toISOString();
};

export const buildSummaryRequest = ({ query, since, until }: SummaryRequestInput): SummaryRequestResult => {
  const q = query.trim();
  const sinceIso = since === '' ? undefined : toIso(since);
  const untilIso = until === '' ? undefined : toIso(until);
  if ((since !== '' && sinceIso === undefined) || (until !== '' && untilIso === undefined)) {
    return { ok: false, message: '期間の日時を確かめてください。' };
  }
  if (q !== '') {
    return {
      ok: true,
      body: {
        q,
        ...(sinceIso === undefined ? {} : { since: sinceIso }),
        ...(untilIso === undefined ? {} : { until: untilIso }),
      },
    };
  }
  if (sinceIso === undefined || untilIso === undefined) {
    return { ok: false, message: '検索語がないときは、期間の開始と終了の両方を入力してください。' };
  }
  return { ok: true, body: { since: sinceIso, until: untilIso } };
};

export const SUMMARY_DAILY_LIMIT = 20;

const clockOf = (date: Date): string =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

export const summaryErrorMessage = (
  status: number | undefined,
  retryAfterSeconds: number | undefined,
  now: Date,
): string => {
  switch (status) {
    case 422:
      return '入力を確かめてください（期間は 7 日以内、終了は現在より前）';
    case 429: {
      const limit = `今日の要約の回数（${SUMMARY_DAILY_LIMIT} 回）を使い切りました。`;
      return retryAfterSeconds === undefined
        ? limit
        : `${limit}${clockOf(new Date(now.getTime() + retryAfterSeconds * 1000))} から使えます。`;
    }
    case 502:
      return '要約を作れませんでした。時間をおいて試してください。';
    default:
      return '要約に失敗しました。時間をおいて試してください。';
  }
};
