export type ScheduleRow = {
  readonly id: string;
  readonly title: string;
  readonly minutes: number;
  readonly parts?: string;
  readonly pageStarts?: readonly number[];
};

export const schedule: readonly ScheduleRow[] = [
  { id: 'intro', title: '導入', minutes: 5 },
  { id: 'chapter-1', title: '第1章 キャンセルの理由を答えられないことを確かめる', minutes: 4 },
  {
    id: 'chapter-2',
    title: '第2章 更新と同じトランザクションで記録する',
    minutes: 14,
    parts: '説明2分、演習9分、解答の確認3分',
    pageStarts: [0, 1, 1, 2, 7, 13],
  },
  { id: 'chapter-3', title: '第3章 記録から、誰がなぜキャンセルしたかを答える', minutes: 5 },
  {
    id: 'chapter-4',
    title: '第4章 3パターンを比較する',
    minutes: 9,
    parts: '実演7分、判断表で比べて選ぶ2分',
    pageStarts: [0, 0, 3, 5, 7, 8],
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
