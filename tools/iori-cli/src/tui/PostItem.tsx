import { Box, Text } from 'ink';
import React from 'react';

import { stripHtml } from '../output.js';
import type { TimelineItemData } from '../types.js';

interface PostItemProps {
  item: TimelineItemData;
  isSelected: boolean;
}

export function PostItem({ item, isSelected }: PostItemProps): React.ReactElement {
  const { post } = item;
  const content = stripHtml(post.content);
  const time = new Date(post.createdAt).toLocaleString();

  return (
    <Box flexDirection='column' paddingLeft={1} paddingRight={1}>
      {item.type === 'repost' && (
        <Text color='green' dimColor>
          {'↻ @'}
          {item.repostedBy.username}
          {' がリポスト'}
        </Text>
      )}
      <Text>
        <Text color={isSelected ? 'cyan' : undefined} bold={isSelected}>
          {'@'}
          {post.username}
        </Text>
        <Text dimColor>{'  '}{time}</Text>
      </Text>
      <Box paddingLeft={2}>
        <Text wrap='truncate'>{content}</Text>
      </Box>
      <Box paddingLeft={2} gap={2}>
        <Text color={post.liked ? 'red' : 'gray'}>
          {'♡ '}
          {post.likeCount}
        </Text>
        <Text color={post.reposted ? 'green' : 'gray'}>
          {'↻ '}
          {post.repostCount}
        </Text>
      </Box>
    </Box>
  );
}
