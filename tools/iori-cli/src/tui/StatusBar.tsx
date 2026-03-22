import { Box, Text } from 'ink';
import React from 'react';

import type { Mode, Tab } from '../types.js';

interface StatusBarProps {
  mode: Mode;
  tab: Tab;
  error: string | null;
}

function normalModeHelp(tab: Tab): string {
  if (tab === 'timeline') {
    return 'j/k:移動 h/l:ページ送り Enter:詳細 a:投稿 e:エディタ d:削除 f/L:Like R:Repost gg:リロード Tab:通知 q:終了';
  }
  return 'j/k:移動 gg:リロード Tab:タイムライン q:終了';
}

export function StatusBar({ mode, tab, error }: StatusBarProps): React.ReactElement {
  return (
    <Box flexDirection='column'>
      <Box gap={1}>
        <Text color={tab === 'timeline' ? 'cyan' : undefined} bold={tab === 'timeline'} inverse={tab === 'timeline'}>
          {' タイムライン '}
        </Text>
        <Text
          color={tab === 'notifications' ? 'cyan' : undefined}
          bold={tab === 'notifications'}
          inverse={tab === 'notifications'}
        >
          {' 通知 '}
        </Text>
      </Box>
      {error && <Text color='red'>{error}</Text>}
      <Text dimColor>
        {mode === 'normal' ? normalModeHelp(tab) : 'Enter:送信 Esc:キャンセル'}
      </Text>
    </Box>
  );
}
