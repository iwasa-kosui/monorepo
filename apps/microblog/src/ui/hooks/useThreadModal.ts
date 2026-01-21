import { hc } from 'hono/client';
import { useCallback, useState } from 'hono/jsx';

import type { APIRouterType } from '../../adaptor/routes/apiRouter.tsx';
import type { PostWithAuthor } from '../../domain/post/post.ts';

const client = hc<APIRouterType>('/api');

export type ThreadData = Readonly<{
  currentPost: PostWithAuthor | null;
  ancestors: PostWithAuthor[];
  descendants: PostWithAuthor[];
}>;

export type UseThreadModalReturn = Readonly<{
  threadModalPostId: string | null;
  threadData: ThreadData | null;
  isLoadingThread: boolean;
  showThread: (postId: string) => Promise<void>;
  closeThread: () => void;
  updateThreadPost: (
    postId: string,
    updater: (post: PostWithAuthor) => PostWithAuthor,
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
      const res = await client.v1.thread.$get({ query: { postId } });
      const result = await res.json();
      if (
        'currentPost' in result
        && 'ancestors' in result
        && 'descendants' in result
      ) {
        setThreadData(
          result as {
            currentPost: PostWithAuthor | null;
            ancestors: PostWithAuthor[];
            descendants: PostWithAuthor[];
          },
        );
      } else if ('error' in result) {
        console.error('Failed to load thread:', result.error);
      }
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
    (postId: string, updater: (post: PostWithAuthor) => PostWithAuthor) => {
      setThreadData((prev) => {
        if (!prev) return prev;
        return {
          currentPost: prev.currentPost?.postId === postId
            ? updater(prev.currentPost)
            : prev.currentPost,
          ancestors: prev.ancestors.map((post) => post.postId === postId ? updater(post) : post),
          descendants: prev.descendants.map((post) => post.postId === postId ? updater(post) : post),
        };
      });
    },
    [],
  );

  const removeFromThread = useCallback((postId: string) => {
    setThreadData((prev) => {
      if (!prev) return prev;
      if (prev.currentPost?.postId === postId) {
        setThreadModalPostId(null);
        return null;
      }
      return {
        currentPost: prev.currentPost,
        ancestors: prev.ancestors.filter((post) => post.postId !== postId),
        descendants: prev.descendants.filter((post) => post.postId !== postId),
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
