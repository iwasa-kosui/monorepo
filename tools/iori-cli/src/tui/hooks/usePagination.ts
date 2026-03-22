import { useStdout } from 'ink';

// 全投稿truncateにより高さ固定: リポストヘッダ(1) + username(1) + content(1) + likes(1) + separator(1) = 5
const LINES_PER_ITEM = 5;
// ステータスバー・タブ・ヘルプ・ページインジケータ
const RESERVED_LINES = 5;

export function usePagination(totalItems: number) {
  const { stdout } = useStdout();
  const terminalRows = stdout?.rows ?? 24;
  const itemsPerPage = Math.max(1, Math.floor((terminalRows - RESERVED_LINES) / LINES_PER_ITEM));
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  return { itemsPerPage, totalPages };
}
