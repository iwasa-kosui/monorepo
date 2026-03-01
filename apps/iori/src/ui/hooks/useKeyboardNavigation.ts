import { useEffect } from 'hono/jsx';

import type { TimelineItemWithPost } from '../../domain/timeline/timelineItem.ts';

type UseKeyboardNavigationProps = Readonly<{
  items: readonly TimelineItemWithPost[];
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  scrollToSelected: (index: number) => void;
  emojiPickerOpenForIndex: number | null;
  setEmojiPickerOpenForIndex: (index: number | null) => void;
  replyingToPostId: string | null;
  threadModalPostId: string | null;
  likingPostId: string | null;
  undoingLikePostId: string | null;
  onLike: (postId: string) => void;
  onUndoLike: (postId: string) => void;
  onReply: (postId: string) => void;
  onCancelReply: () => void;
  onCloseThread: () => void;
}>;

export const useKeyboardNavigation = ({
  items,
  selectedIndex,
  setSelectedIndex,
  scrollToSelected,
  emojiPickerOpenForIndex,
  setEmojiPickerOpenForIndex,
  replyingToPostId,
  threadModalPostId,
  likingPostId,
  undoingLikePostId,
  onLike,
  onUndoLike,
  onReply,
  onCancelReply,
  onCloseThread,
}: UseKeyboardNavigationProps): void => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeElement = document.activeElement as HTMLElement | null;
      if (
        activeElement
        && (activeElement.tagName === 'INPUT'
          || activeElement.tagName === 'TEXTAREA'
          || activeElement.isContentEditable)
      ) {
        return;
      }

      const isPostModalOpen = window.location.hash === '#post-modal';

      if (e.key === 'n' || e.key === 'N') {
        if (!isPostModalOpen) {
          e.preventDefault();
          window.location.hash = '#post-modal';
        }
        return;
      }

      if (e.key === 'Escape') {
        if (isPostModalOpen) {
          e.preventDefault();
          window.location.hash = '';
          return;
        }
        if (threadModalPostId !== null) {
          e.preventDefault();
          onCloseThread();
          return;
        }
        if (replyingToPostId !== null) {
          e.preventDefault();
          onCancelReply();
          return;
        }
        if (emojiPickerOpenForIndex !== null) {
          e.preventDefault();
          setEmojiPickerOpenForIndex(null);
          return;
        }
        if (selectedIndex >= 0) {
          e.preventDefault();
          setSelectedIndex(-1);
          return;
        }
        return;
      }

      if (e.key === 'j' || e.key === 'k') {
        if (selectedIndex < 0 && items.length > 0) {
          e.preventDefault();
          setSelectedIndex(0);
          scrollToSelected(0);
          return;
        }
      }

      const selectedItem = items[selectedIndex];
      if (!selectedItem) return;

      const post = selectedItem.post;

      switch (e.key) {
        case 'j':
          e.preventDefault();
          if (selectedIndex < items.length - 1) {
            const newIndex = selectedIndex + 1;
            setSelectedIndex(newIndex);
            scrollToSelected(newIndex);
          }
          break;
        case 'k':
          e.preventDefault();
          if (selectedIndex > 0) {
            const newIndex = selectedIndex - 1;
            setSelectedIndex(newIndex);
            scrollToSelected(newIndex);
          }
          break;
        case 'l':
          e.preventDefault();
          if (post.liked && !undoingLikePostId) {
            onUndoLike(post.postId);
          } else if (!post.liked && !likingPostId) {
            onLike(post.postId);
          }
          break;
        case 'o':
        case 'Enter':
          e.preventDefault();
          if (post.type === 'local') {
            window.location.href = `/users/${post.username}/posts/${post.postId}`;
          } else if (post.type === 'remote' && 'uri' in post) {
            window.open(post.uri, '_blank');
          }
          break;
        case 'g':
          e.preventDefault();
          setSelectedIndex(0);
          scrollToSelected(0);
          break;
        case 'G': {
          e.preventDefault();
          const lastIndex = items.length - 1;
          setSelectedIndex(lastIndex);
          scrollToSelected(lastIndex);
          break;
        }
        case 'e': {
          e.preventDefault();
          setEmojiPickerOpenForIndex(
            emojiPickerOpenForIndex === selectedIndex ? null : selectedIndex,
          );
          break;
        }
        case 'p': {
          e.preventDefault();
          onReply(post.postId);
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    items,
    selectedIndex,
    setSelectedIndex,
    scrollToSelected,
    emojiPickerOpenForIndex,
    setEmojiPickerOpenForIndex,
    replyingToPostId,
    threadModalPostId,
    likingPostId,
    undoingLikePostId,
    onLike,
    onUndoLike,
    onReply,
    onCancelReply,
    onCloseThread,
  ]);
};
