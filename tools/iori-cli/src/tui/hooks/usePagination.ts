import { useStdout } from 'ink';

const LINES_PER_ITEM = 5;
const RESERVED_LINES = 4;

export function usePagination(totalItems: number, linesPerItem = LINES_PER_ITEM, reservedLines = RESERVED_LINES) {
  const { stdout } = useStdout();
  const terminalRows = stdout?.rows ?? 24;
  const itemsPerPage = Math.max(1, Math.floor((terminalRows - reservedLines) / linesPerItem));
  const totalPages = Math.max(1, Math.ceil(totalItems / itemsPerPage));
  return { itemsPerPage, totalPages };
}
