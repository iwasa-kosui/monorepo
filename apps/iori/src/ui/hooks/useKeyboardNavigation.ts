import { useEffect } from 'hono/jsx';

import type { Status } from '../../adaptor/mastodon/entities.ts';
import type { IoriBlueskyTimelineItemBody } from '../../adaptor/routes/workerIoriBlueskyRouter.ts';
import type { Visibility } from '../../domain/post/visibility.ts';
import { detailHref, displayStatus } from '../api/status.ts';
import { shouldCloseReplyModalOnKey } from '../components/FediverseReplyModal.tsx';
import type { HomeItem } from './homeFeed.ts';

type UseKeyboardNavigationProps = Readonly<{
  items: readonly HomeItem[];
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  scrollToSelected: (index: number) => void;
  emojiPickerOpenForIndex: number | null;
  setEmojiPickerOpenForIndex: (index: number | null) => void;
  replyingToPostId: string | null;
  isSendingReply: boolean;
  threadModalPostId: string | null;
  onLike: (postId: string) => void;
  onUndoLike: (postId: string) => void;
  onReply: (postId: string, username: string, visibility?: Visibility, status?: Status) => void;
  onBlueskyReply: (item: IoriBlueskyTimelineItemBody) => void;
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
  isSendingReply,
  threadModalPostId,
  onLike,
  onUndoLike,
  onReply,
  onBlueskyReply,
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
          if (!shouldCloseReplyModalOnKey(e.key, isSendingReply)) return;
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

      const post = selectedItem.kind === 'status' ? displayStatus(selectedItem.status) : undefined;

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
          if (post === undefined) break;
          e.preventDefault();
          if (post.favourited) {
            onUndoLike(post.id);
          } else {
            onLike(post.id);
          }
          break;
        case 'o':
        case 'Enter':
          if (post === undefined) break;
          e.preventDefault();
          window.location.href = detailHref(post);
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
          if (post === undefined) break;
          e.preventDefault();
          setEmojiPickerOpenForIndex(
            emojiPickerOpenForIndex === selectedIndex ? null : selectedIndex,
          );
          break;
        }
        case 'p': {
          if (selectedItem.kind === 'bluesky') {
            e.preventDefault();
            onBlueskyReply(selectedItem.item);
            break;
          }
          if (post === undefined) break;
          e.preventDefault();
          onReply(post.id, post.account.acct, post.visibility, post);
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
    isSendingReply,
    threadModalPostId,
    onLike,
    onUndoLike,
    onReply,
    onBlueskyReply,
    onCancelReply,
    onCloseThread,
  ]);
};
