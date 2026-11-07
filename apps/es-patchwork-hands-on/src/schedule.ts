export type ScheduleRow = {
  readonly id: string;
  readonly title: string;
  readonly minutes: number;
  readonly parts?: string;
};

export const schedule: readonly ScheduleRow[] = [
  { id: 'intro', title: '導入', minutes: 4 },
  { id: 'chapter-1', title: '第1章 答えられないことを確かめる', minutes: 4 },
  { id: 'chapter-2', title: '第2章 更新処理の境界で記録する', minutes: 14, parts: '説明2分、演習9分、解答の確認3分' },
  { id: 'chapter-3', title: '第3章 記録から答える', minutes: 5 },
  { id: 'chapter-4', title: '第4章 3パターンを比較する', minutes: 10, parts: '実演8分、判断表で比べて選ぶ2分' },
  { id: 'summary', title: 'まとめ', minutes: 3 },
];

const formatClock = (minutes: number): string => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}`;

export const withTimeRanges = (rows: readonly ScheduleRow[]): readonly (ScheduleRow & { readonly range: string })[] => {
  let elapsed = 0;
  return rows.map((row) => {
    const start = elapsed;
    elapsed += row.minutes;
    return { ...row, range: `${formatClock(start)}〜${formatClock(elapsed)}（${row.minutes}分）` };
  });
};
