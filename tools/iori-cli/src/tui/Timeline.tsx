import { Box, Text, useStdout } from 'ink';
import React from 'react';

import type { TimelineItemData } from '../types.js';
import { usePagination } from './hooks/usePagination.js';
import { PostItem } from './PostItem.js';

interface TimelineProps {
  items: TimelineItemData[];
  selectedIndex: number;
  loadingMore: boolean;
  hasMore: boolean;
}

export function Timeline({ items, selectedIndex, loadingMore, hasMore }: TimelineProps): React.ReactElement {
  const { stdout } = useStdout();
  const { itemsPerPage, totalPages } = usePagination(items.length);

  const currentPage = Math.floor(selectedIndex / itemsPerPage);
  const pageStart = currentPage * itemsPerPage;
  const visibleItems = items.slice(pageStart, pageStart + itemsPerPage);

  if (items.length === 0) {
    return <Text dimColor>タイムラインに投稿がありません</Text>;
  }

  return (
    <Box flexDirection='column'>
      {visibleItems.map((item, i) => {
        const actualIndex = pageStart + i;
        return (
          <Box key={item.timelineItemId} flexDirection='column'>
            <PostItem item={item} isSelected={actualIndex === selectedIndex} />
            <Text dimColor>{'─'.repeat(Math.min(stdout?.columns ?? 40, 60))}</Text>
          </Box>
        );
      })}
      <Text dimColor>
        {selectedIndex + 1}/{items.length} ページ {currentPage + 1}/{totalPages}
        {loadingMore ? ' 読み込み中...' : !hasMore ? ' (末尾)' : ''}
      </Text>
    </Box>
  );
}
