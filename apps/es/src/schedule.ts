export type ScheduleRow = {
  readonly id: string;
  readonly title: string;
  readonly minutes: number;
  readonly parts?: string;
  readonly pageStarts?: readonly number[];
};

export const schedule: readonly ScheduleRow[] = [
  { id: 'intro', title: '導入', minutes: 8, pageStarts: [0, 1, 3, 4, 6, 7, 7] },
  { id: 'chapter-1', title: '第1章 答えられない問いを挙げる', minutes: 4, pageStarts: [0, 2, 3] },
  {
    id: 'chapter-2',
    title: '第2章 更新と同じトランザクションで記録する',
    minutes: 13,
    parts: '説明2分、演習9分、解答の確認2分',
    pageStarts: [0, 1, 6, 7, 12],
  },
  { id: 'chapter-3', title: '第3章 記録から、誰がなぜキャンセルしたかを答える', minutes: 4 },
  {
    id: 'chapter-4',
    title: '第4章 3パターンを比較する',
    minutes: 8,
    parts: '実演6分、判断表で比べて選ぶ2分',
    pageStarts: [0, 0, 2, 4, 6, 7],
  },
  { id: 'summary', title: 'まとめ', minutes: 3 },
];

export const formatClock = (minutes: number): string =>
  `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

export const withTimeRanges = (rows: readonly ScheduleRow[]): readonly (ScheduleRow & { readonly range: string })[] => {
  let elapsed = 0;
  return rows.map((row) => {
    const start = elapsed;
    elapsed += row.minutes;
    return { ...row, range: `${formatClock(start)}〜${formatClock(elapsed)}（${row.minutes}分）` };
  });
};
