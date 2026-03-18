import { Box, Text, useStdout } from 'ink';
import React from 'react';

import type { NotificationItemData } from '../types.js';
import { NotificationItem } from './NotificationItem.js';

interface NotificationListProps {
  items: NotificationItemData[];
  selectedIndex: number;
}

const LINES_PER_ITEM = 3;
const RESERVED_LINES = 4;

export function NotificationList({ items, selectedIndex }: NotificationListProps): React.ReactElement {
  const { stdout } = useStdout();
  const terminalRows = stdout?.rows ?? 24;

  const visibleCount = Math.max(1, Math.floor((terminalRows - RESERVED_LINES) / LINES_PER_ITEM));

  const viewportStart = selectedIndex;

  const visibleItems = items.slice(viewportStart, viewportStart + visibleCount);

  if (items.length === 0) {
    return <Text dimColor>通知はありません</Text>;
  }

  return (
    <Box flexDirection='column'>
      {visibleItems.map((item, i) => {
        const actualIndex = viewportStart + i;
        return (
          <Box
            key={`${item.notification.notification.type}-${item.notification.createdAt}-${i}`}
            flexDirection='column'
          >
            <NotificationItem item={item} isSelected={actualIndex === selectedIndex} />
            <Text dimColor>{'─'.repeat(Math.min(stdout?.columns ?? 40, 60))}</Text>
          </Box>
        );
      })}
      <Text dimColor>
        {selectedIndex + 1}/{items.length}
      </Text>
    </Box>
  );
}
