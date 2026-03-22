import { useStdout } from 'ink';

// 非選択投稿の最大行数: リポストヘッダ(1) + username(1) + content truncated(1) + likes(1) + separator(1) = 5
const LINES_PER_UNSELECTED = 5;
// 選択投稿の展開用予算: username(1) + content expanded(~5) + likes(1) + separator(1) = 8
const LINES_FOR_SELECTED = 8;
// ステータスバー・タブ・ヘルプ・ページインジケータ
const RESERVED_LINES = 5;

export function usePagination(totalItems: number) {
  const { stdout } = useStdout();
  const terminalRows = stdout?.rows ?? 24;
  const availableForUnselected = terminalRows - RESERVED_LINES - LINES_FOR_SELECTED;
  const unselectedCount = Math.max(0, Math.floor(availableForUnselected / LINES_PER_UNSELECTED));
  const itemsPerPage = Math.max(1, unselectedCount + 1);
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  return { itemsPerPage, totalPages };
}
