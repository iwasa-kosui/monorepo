import { Box, Text, useInput, useStdout } from 'ink';
import React from 'react';

import { stripHtml } from '../output.js';
import type { TimelineItemData } from '../types.js';

interface PostDetailProps {
  item: TimelineItemData;
  onBack: () => void;
  onLike: () => void;
  onRepost: () => void;
  onDelete: () => void;
}

export function PostDetail({ item, onBack, onLike, onRepost, onDelete }: PostDetailProps): React.ReactElement {
  const { stdout } = useStdout();
  const { post } = item;
  const content = stripHtml(post.content);
  const time = new Date(post.createdAt).toLocaleString();

  useInput((_input, key) => {
    if (key.escape || _input === 'q') {
      onBack();
    } else if (_input === 'L' || _input === 'f') {
      onLike();
    } else if (_input === 'R') {
      onRepost();
    } else if (_input === 'd') {
      onDelete();
    }
  });

  return (
    <Box flexDirection='column'>
      <Box flexDirection='column' paddingLeft={1} paddingRight={1}>
        {item.type === 'repost' && (
          <Text color='green' dimColor>
            {'↻ @'}
            {item.repostedBy.username}
            {' がリポスト'}
          </Text>
        )}
        <Text>
          <Text color='cyan' bold>
            {'@'}
            {post.username}
          </Text>
          <Text dimColor>{'  '}{time}</Text>
        </Text>
        <Text dimColor>{'─'.repeat(Math.min(stdout?.columns ?? 40, 60))}</Text>
        <Box paddingLeft={2} paddingTop={1} paddingBottom={1}>
          <Text wrap='wrap'>{content}</Text>
        </Box>
        <Text dimColor>{'─'.repeat(Math.min(stdout?.columns ?? 40, 60))}</Text>
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
      <Text dimColor>Esc/q:戻る f/L:Like R:Repost d:削除</Text>
    </Box>
  );
}
