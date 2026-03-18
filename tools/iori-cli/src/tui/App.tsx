import { Box, Text, useApp } from 'ink';
import React, { useCallback, useEffect, useState } from 'react';

import type { Client } from '../client.js';
import type { Mode } from '../types.js';
import { ComposeInput } from './ComposeInput.js';
import { useKeyBindings } from './hooks/useKeyBindings.js';
import { useTimeline } from './hooks/useTimeline.js';
import { StatusBar } from './StatusBar.js';
import { Timeline } from './Timeline.js';

interface AppProps {
  client: Client;
}

export function App({ client }: AppProps): React.ReactElement {
  const [mode, setMode] = useState<Mode>('normal');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const { exit } = useApp();

  const {
    items,
    loading,
    loadingMore,
    hasMore,
    error,
    reload,
    loadMore,
    createPost,
    deletePost,
    toggleLike,
    toggleRepost,
  } = useTimeline(client);

  useEffect(() => {
    void reload();
  }, [reload]);

  const handleMoveDown = useCallback(() => {
    setSelectedIndex((prev) => {
      const next = Math.min(prev + 1, items.length - 1);
      if (next >= items.length - 3 && hasMore && !loadingMore) {
        void loadMore();
      }
      return next;
    });
  }, [items.length, hasMore, loadingMore, loadMore]);

  const handleMoveUp = useCallback(() => {
    setSelectedIndex((prev) => Math.max(prev - 1, 0));
  }, []);

  const handleCompose = useCallback(() => {
    setMode('compose');
  }, []);

  const handleDelete = useCallback(() => {
    const item = items[selectedIndex];
    if (item) {
      void deletePost(item.post.postId);
      if (selectedIndex >= items.length - 1 && selectedIndex > 0) {
        setSelectedIndex(selectedIndex - 1);
      }
    }
  }, [items, selectedIndex, deletePost]);

  const handleLike = useCallback(() => {
    void toggleLike(selectedIndex);
  }, [selectedIndex, toggleLike]);

  const handleRepost = useCallback(() => {
    void toggleRepost(selectedIndex);
  }, [selectedIndex, toggleRepost]);

  const handleReload = useCallback(() => {
    setSelectedIndex(0);
    void reload();
  }, [reload]);

  const handleQuit = useCallback(() => {
    exit();
  }, [exit]);

  useKeyBindings({
    isActive: mode === 'normal',
    onMoveDown: handleMoveDown,
    onMoveUp: handleMoveUp,
    onCompose: handleCompose,
    onDelete: handleDelete,
    onLike: handleLike,
    onRepost: handleRepost,
    onReload: handleReload,
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

  if (loading && items.length === 0) {
    return <Text>読み込み中...</Text>;
  }

  return (
    <Box flexDirection='column'>
      <Timeline items={items} selectedIndex={selectedIndex} loadingMore={loadingMore} hasMore={hasMore} />
      {mode === 'compose' && <ComposeInput onSubmit={handleSubmitPost} onCancel={handleCancelCompose} />}
      <StatusBar mode={mode} error={error} />
    </Box>
  );
}
