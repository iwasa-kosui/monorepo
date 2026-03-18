import { Box, Text } from 'ink';
import React from 'react';

import { stripHtml } from '../output.js';
import type { NotificationItemData } from '../types.js';

interface NotificationItemProps {
  item: NotificationItemData;
  isSelected: boolean;
}

function resolveActorName(n: NotificationItemData['notification']): string {
  const actor = n.likerActor ?? n.followerActor ?? n.replierActor;
  return actor ? `@${actor.username}` : 'unknown';
}

const TYPE_LABELS: Record<string, { label: string; color: string }> = {
  like: { label: 'Like', color: 'red' },
  follow: { label: 'Follow', color: 'blue' },
  reply: { label: 'Reply', color: 'cyan' },
  mention: { label: 'Mention', color: 'yellow' },
};

export function NotificationItem({ item, isSelected }: NotificationItemProps): React.ReactElement {
  const n = item.notification;
  const type = n.notification.type;
  const time = new Date(n.createdAt).toLocaleString();
  const actorName = resolveActorName(n);
  const content = stripHtml(item.sanitizedContent);
  const typeInfo = TYPE_LABELS[type] ?? { label: type, color: 'white' };

  return (
    <Box flexDirection='column' paddingLeft={1} paddingRight={1}>
      <Text>
        <Text color={typeInfo.color} bold={isSelected}>[{typeInfo.label}]</Text>
        <Text>{' '}{actorName}</Text>
        <Text dimColor>{'  '}{time}</Text>
      </Text>
      {content && (
        <Box paddingLeft={2}>
          <Text wrap='wrap' dimColor={!isSelected}>{content}</Text>
        </Box>
      )}
    </Box>
  );
}
