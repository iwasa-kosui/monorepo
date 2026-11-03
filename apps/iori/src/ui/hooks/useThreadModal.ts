import { useCallback, useState } from 'hono/jsx';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import { fetchStatus, fetchStatusContext } from '../api/mastodonClient.ts';

export type ThreadData = Readonly<{
  currentPost: Status | null;
  ancestors: readonly Status[];
  descendants: readonly Status[];
}>;

export type UseThreadModalReturn = Readonly<{
  threadModalPostId: string | null;
  threadData: ThreadData | null;
  isLoadingThread: boolean;
  showThread: (postId: string) => Promise<void>;
  closeThread: () => void;
  updateThreadPost: (
    postId: string,
    updater: (status: Status) => Status,
  ) => void;
  removeFromThread: (postId: string) => void;
}>;

export const useThreadModal = (): UseThreadModalReturn => {
  const [threadModalPostId, setThreadModalPostId] = useState<string | null>(null);
  const [threadData, setThreadData] = useState<ThreadData | null>(null);
  const [isLoadingThread, setIsLoadingThread] = useState(false);

  const showThread = useCallback(async (postId: string) => {
    setThreadModalPostId(postId);
    setThreadData(null);
    setIsLoadingThread(true);
    try {
      const [currentPost, context] = await Promise.all([
        fetchStatus(postId),
        fetchStatusContext(postId),
      ]);
      setThreadData({
        currentPost,
        ancestors: context.ancestors,
        descendants: context.descendants,
      });
    } catch (error) {
      console.error('Failed to load thread:', error);
    } finally {
      setIsLoadingThread(false);
    }
  }, []);

  const closeThread = useCallback(() => {
    setThreadModalPostId(null);
    setThreadData(null);
  }, []);

  const updateThreadPost = useCallback(
    (postId: string, updater: (status: Status) => Status) => {
      setThreadData((prev) => {
        if (!prev) return prev;
        return {
          currentPost: prev.currentPost?.id === postId
            ? updater(prev.currentPost)
            : prev.currentPost,
          ancestors: prev.ancestors.map((post) => post.id === postId ? updater(post) : post),
          descendants: prev.descendants.map((post) => post.id === postId ? updater(post) : post),
        };
      });
    },
    [],
  );

  const removeFromThread = useCallback((postId: string) => {
    setThreadData((prev) => {
      if (!prev) return prev;
      if (prev.currentPost?.id === postId) {
        setThreadModalPostId(null);
        return null;
      }
      return {
        currentPost: prev.currentPost,
        ancestors: prev.ancestors.filter((post) => post.id !== postId),
        descendants: prev.descendants.filter((post) => post.id !== postId),
      };
    });
  }, []);

  return {
    threadModalPostId,
    threadData,
    isLoadingThread,
    showThread,
    closeThread,
    updateThreadPost,
    removeFromThread,
  } as const;
};
