import { Box, Text, useApp } from 'ink';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import React, { useCallback, useEffect, useState } from 'react';

import type { Client } from '../client.js';
import type { Mode, Tab } from '../types.js';
import { ComposeInput } from './ComposeInput.js';
import { useKeyBindings } from './hooks/useKeyBindings.js';
import { useNotifications } from './hooks/useNotifications.js';
import { useTimeline } from './hooks/useTimeline.js';
import { NotificationList } from './NotificationList.js';
import { StatusBar } from './StatusBar.js';
import { Timeline } from './Timeline.js';

interface AppProps {
  client: Client;
}

export function App({ client }: AppProps): React.ReactElement {
  const [mode, setMode] = useState<Mode>('normal');
  const [tab, setTab] = useState<Tab>('timeline');
  const [tlSelectedIndex, setTlSelectedIndex] = useState(0);
  const [notifSelectedIndex, setNotifSelectedIndex] = useState(0);
  const { exit } = useApp();

  const {
    items: tlItems,
    loading: tlLoading,
    loadingMore,
    hasMore,
    error: tlError,
    reload: tlReload,
    loadMore,
    createPost,
    deletePost,
    toggleLike,
    toggleRepost,
  } = useTimeline(client);

  const {
    items: notifItems,
    loading: notifLoading,
    error: notifError,
    reload: notifReload,
  } = useNotifications(client);

  useEffect(() => {
    void tlReload();
  }, [tlReload]);

  const handleMoveDown = useCallback(() => {
    if (tab === 'timeline') {
      setTlSelectedIndex((prev) => {
        const next = Math.min(prev + 1, tlItems.length - 1);
        if (next >= tlItems.length - 3 && hasMore && !loadingMore) {
          void loadMore();
        }
        return next;
      });
    } else {
      setNotifSelectedIndex((prev) => Math.min(prev + 1, notifItems.length - 1));
    }
  }, [tab, tlItems.length, hasMore, loadingMore, loadMore, notifItems.length]);

  const handleMoveUp = useCallback(() => {
    if (tab === 'timeline') {
      setTlSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else {
      setNotifSelectedIndex((prev) => Math.max(prev - 1, 0));
    }
  }, [tab]);

  const handleCompose = useCallback(() => {
    if (tab === 'timeline') {
      setMode('compose');
    }
  }, [tab]);

  const handleEditorCompose = useCallback(() => {
    if (tab !== 'timeline') return;
    const editor = process.env['EDITOR'] || 'vi';
    const dir = mkdtempSync(join(tmpdir(), 'iori-'));
    const filePath = join(dir, 'post.md');
    writeFileSync(filePath, '', 'utf-8');
    try {
      process.stdin.setRawMode?.(false);
      const result = spawnSync(editor, [filePath], { stdio: 'inherit' });
      process.stdin.setRawMode?.(true);
      if (result.status !== 0) return;
      const content = readFileSync(filePath, 'utf-8').trim();
      if (content) {
        void createPost(content);
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, [tab, createPost]);

  const handleDelete = useCallback(() => {
    if (tab !== 'timeline') return;
    const item = tlItems[tlSelectedIndex];
    if (item) {
      void deletePost(item.post.postId);
      if (tlSelectedIndex >= tlItems.length - 1 && tlSelectedIndex > 0) {
        setTlSelectedIndex(tlSelectedIndex - 1);
      }
    }
  }, [tab, tlItems, tlSelectedIndex, deletePost]);

  const handleLike = useCallback(() => {
    if (tab === 'timeline') {
      void toggleLike(tlSelectedIndex);
    }
  }, [tab, tlSelectedIndex, toggleLike]);

  const handleRepost = useCallback(() => {
    if (tab === 'timeline') {
      void toggleRepost(tlSelectedIndex);
    }
  }, [tab, tlSelectedIndex, toggleRepost]);

  const handleReload = useCallback(() => {
    if (tab === 'timeline') {
      setTlSelectedIndex(0);
      void tlReload();
    } else {
      setNotifSelectedIndex(0);
      void notifReload();
    }
  }, [tab, tlReload, notifReload]);

  const handleTabSwitch = useCallback(() => {
    setTab((prev) => {
      const next = prev === 'timeline' ? 'notifications' : 'timeline';
      if (next === 'notifications' && notifItems.length === 0 && !notifLoading) {
        void notifReload();
      }
      return next;
    });
  }, [notifItems.length, notifLoading, notifReload]);

  const handleQuit = useCallback(() => {
    exit();
  }, [exit]);

  useKeyBindings({
    isActive: mode === 'normal',
    onMoveDown: handleMoveDown,
    onMoveUp: handleMoveUp,
    onCompose: handleCompose,
    onEditorCompose: handleEditorCompose,
    onDelete: handleDelete,
    onLike: handleLike,
    onRepost: handleRepost,
    onReload: handleReload,
    onTabSwitch: handleTabSwitch,
    onQuit: handleQuit,
  });

  const handleSubmitPost = useCallback(
    (content: string) => {
      setMode('normal');
      void createPost(content);
    },
    [createPost],
  );

  const handleCancelCompose = useCallback(() => {
    setMode('normal');
  }, []);

  const loading = tab === 'timeline' ? tlLoading : notifLoading;
  const error = tab === 'timeline' ? tlError : notifError;
  const currentItems = tab === 'timeline' ? tlItems : notifItems;

  if (loading && currentItems.length === 0) {
    return <Text>読み込み中...</Text>;
  }

  return (
    <Box flexDirection='column'>
      {tab === 'timeline'
        ? <Timeline items={tlItems} selectedIndex={tlSelectedIndex} loadingMore={loadingMore} hasMore={hasMore} />
        : <NotificationList items={notifItems} selectedIndex={notifSelectedIndex} />}
      {mode === 'compose' && <ComposeInput onSubmit={handleSubmitPost} onCancel={handleCancelCompose} />}
      <StatusBar mode={mode} tab={tab} error={error} />
    </Box>
  );
}
