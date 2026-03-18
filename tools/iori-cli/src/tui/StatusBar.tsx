import { Box, Text } from 'ink';
import React from 'react';

import type { Mode } from '../types.js';

interface StatusBarProps {
  mode: Mode;
  error: string | null;
}

export function StatusBar({ mode, error }: StatusBarProps): React.ReactElement {
  return (
    <Box flexDirection='column'>
      {error && <Text color='red'>{error}</Text>}
      <Text dimColor>
        {mode === 'normal'
          ? 'j/k:移動 a:投稿 d:削除 L:Like R:Repost r:リロード q:終了'
          : 'Enter:送信 Esc:キャンセル'}
      </Text>
    </Box>
  );
}
